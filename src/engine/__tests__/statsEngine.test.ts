import { describe, it, expect } from 'vitest';
import { computeBattingStats, computeSituationalBattingStats } from '../statsEngine';
import { getDefaultRunnerStates, computeDefaultRbi } from '../autoAdvance';
import type { AutoAdvanceOutcome } from '../autoAdvance';
import type { PlayEvent } from '../../models/play';

function id(n: number): string {
  return `ev-${n}`;
}

function makeEvent(overrides: Partial<PlayEvent> & { type: PlayEvent['type'] }): PlayEvent {
  return {
    id: id(Math.random()),
    timestamp: new Date().toISOString(),
    inning: 1,
    halfInning: 'top',
    outsBefore: 0,
    batterId: 'batter1',
    pitchSequence: [],
    runnerMovements: [],
    ...overrides,
  } as PlayEvent;
}

describe('computeBattingStats', () => {
  it('returns empty stats for no events', () => {
    const stats = computeBattingStats([], 'batter1');
    expect(stats.pa).toBe(0);
    expect(stats.ab).toBe(0);
    expect(stats.avg).toBe(0);
  });

  it('counts single as hit and plate appearance', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit',
        hitType: 'single',
        rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(1);
    expect(stats.ab).toBe(1);
    expect(stats.h).toBe(1);
    expect(stats.singles).toBe(1);
    expect(stats.avg).toBe(1);
  });

  it('handles home runs correctly', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit',
        hitType: 'home_run',
        rbi: 1,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'home' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.hr).toBe(1);
    expect(stats.h).toBe(1);
    expect(stats.rbi).toBe(1);
    expect(stats.slg).toBe(4); // TB / AB = 4/1
  });

  it('walks do not count as at-bats', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'walk',
        intentional: false,
        rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(1);
    expect(stats.ab).toBe(0);
    expect(stats.bb).toBe(1);
  });

  it('counts strikeouts', () => {
    const events: PlayEvent[] = [
      makeEvent({ type: 'strikeout', looking: false }),
      makeEvent({ type: 'strikeout', looking: true }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.so).toBe(2);
    expect(stats.ab).toBe(2);
    expect(stats.avg).toBe(0);
  });

  it('computes OBP correctly', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit', hitType: 'single', rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
      makeEvent({ type: 'strikeout', looking: false }),
      makeEvent({
        type: 'walk', intentional: false, rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    // OBP = (H + BB + HBP) / (AB + BB + HBP) = (1 + 1 + 0) / (2 + 1 + 0) = 2/3
    expect(stats.obp).toBeCloseTo(2 / 3);
  });

  it('tracks stolen bases and caught stealing on non-batter events', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'stolen_base',
        batterId: null,
        runnerId: 'batter1',
        base: 'second',
      }),
      makeEvent({
        type: 'caught_stealing',
        batterId: null,
        runnerId: 'batter1',
        base: 'third',
        notation: '2-5',
        runnerMovements: [{ runnerId: 'batter1', from: 'second', to: 'out' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.sb).toBe(1);
    expect(stats.cs).toBe(1);
    expect(stats.pa).toBe(0); // SB/CS are not plate appearances
  });

  it('ignores events for other batters', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit', hitType: 'home_run', rbi: 1, batterId: 'other-player',
        runnerMovements: [{ runnerId: 'other-player', from: 'batter', to: 'home' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(0);
    expect(stats.h).toBe(0);
  });

  it('counts HBP correctly (not an AB)', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit_by_pitch', rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(1);
    expect(stats.ab).toBe(0);
    expect(stats.hbp).toBe(1);
  });

  // ─── J.1: Sacrifice fly/bunt should NOT count as AB ───

  it('sacrifice fly does not count as an at-bat (MLB 9.02(a)(1))', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'out',
        outType: 'fly_out',
        notation: '9',
        outsRecorded: 1,
        sacrifice: 'fly',
        rbi: 1,
        runnerMovements: [
          { runnerId: 'batter1', from: 'batter', to: 'out' },
          { runnerId: 'runner3', from: 'third', to: 'home' },
        ],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(1);
    expect(stats.ab).toBe(0);  // sac fly is NOT an AB
    expect(stats.sf).toBe(1);
    expect(stats.rbi).toBe(1);
  });

  it('sacrifice bunt does not count as an at-bat (MLB 9.02(a)(1))', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'out',
        outType: 'ground_out',
        notation: '1-3',
        outsRecorded: 1,
        sacrifice: 'bunt',
        rbi: 0,
        runnerMovements: [
          { runnerId: 'batter1', from: 'batter', to: 'out' },
          { runnerId: 'runner1', from: 'first', to: 'second' },
        ],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(1);
    expect(stats.ab).toBe(0);  // sac bunt is NOT an AB
    expect(stats.sh).toBe(1);
  });

  it('regular out still counts as an at-bat', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'out',
        outType: 'ground_out',
        notation: '6-3',
        outsRecorded: 1,
        rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'out' }],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    expect(stats.pa).toBe(1);
    expect(stats.ab).toBe(1);
    expect(stats.sf).toBe(0);
    expect(stats.sh).toBe(0);
  });

  // ─── J.2: OBP denominator includes SF ────────────────

  it('OBP denominator includes sacrifice flies (MLB 9.02)', () => {
    const events: PlayEvent[] = [
      // 1 hit (single)
      makeEvent({
        type: 'hit', hitType: 'single', rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
      // 1 sac fly (not an AB, but in OBP denominator)
      makeEvent({
        type: 'out',
        outType: 'fly_out',
        notation: '7',
        outsRecorded: 1,
        sacrifice: 'fly',
        rbi: 1,
        runnerMovements: [
          { runnerId: 'batter1', from: 'batter', to: 'out' },
          { runnerId: 'runner3', from: 'third', to: 'home' },
        ],
      }),
      // 1 strikeout (AB)
      makeEvent({ type: 'strikeout', looking: false }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    // AB = 2 (single + K), SF = 1
    // OBP = (1 + 0 + 0) / (2 + 0 + 0 + 1) = 1/3
    expect(stats.ab).toBe(2);
    expect(stats.sf).toBe(1);
    expect(stats.obp).toBeCloseTo(1 / 3);
  });

  it('sac fly affects AVG correctly (not in AB)', () => {
    const events: PlayEvent[] = [
      // 1 hit
      makeEvent({
        type: 'hit', hitType: 'single', rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
      // 1 sac fly — should NOT be in AB
      makeEvent({
        type: 'out',
        outType: 'fly_out',
        notation: '8',
        outsRecorded: 1,
        sacrifice: 'fly',
        rbi: 1,
        runnerMovements: [
          { runnerId: 'batter1', from: 'batter', to: 'out' },
          { runnerId: 'runner3', from: 'third', to: 'home' },
        ],
      }),
    ];
    const stats = computeBattingStats(events, 'batter1');
    // AVG = 1/1 (only hit counts as AB)
    expect(stats.ab).toBe(1);
    expect(stats.avg).toBe(1);
  });
});

// ─── J.3: GIDP RBI validation ──────────────────────────

describe('computeDefaultRbi — MLB 9.04(b)(1) GIDP', () => {
  it('returns 0 RBI on force double play even if a run scores', () => {
    // Bases loaded, 0 outs: ground ball DP, runner from 3B scores
    const bases = { first: 'r1', second: 'r2', third: 'r3' };
    const outcome: AutoAdvanceOutcome = { kind: 'out', outType: 'ground_out', isForceDP: true };
    const defaults = getDefaultRunnerStates(outcome, bases, 0, 'batter1');
    // Manually set 3B→Home to simulate the scoring runner
    const on3 = defaults.find(r => r.from === 'third');
    if (on3) on3.to = 'home';
    const rbi = computeDefaultRbi(defaults, outcome);
    expect(rbi).toBe(0);
  });

  it('returns normal RBI on tag double play (non-force)', () => {
    // Runners 1B+3B, line drive caught + 1B doubled off. 3B scores on tag up.
    const bases = { first: 'r1', second: null, third: 'r3' };
    const outcome: AutoAdvanceOutcome = { kind: 'out', outType: 'line_out', isForceDP: false };
    const defaults = getDefaultRunnerStates(outcome, bases, 0, 'batter1');
    // 3B scores on tag up
    const on3 = defaults.find(r => r.from === 'third');
    if (on3) on3.to = 'home';
    const rbi = computeDefaultRbi(defaults, outcome);
    expect(rbi).toBe(1);
  });

  it('returns normal RBI on regular out (non-DP)', () => {
    const bases = { first: null, second: null, third: 'r3' };
    const outcome: AutoAdvanceOutcome = { kind: 'out', outType: 'fly_out', sacrifice: 'fly' };
    const defaults = getDefaultRunnerStates(outcome, bases, 0, 'batter1');
    const rbi = computeDefaultRbi(defaults, outcome);
    expect(rbi).toBe(1);
  });
});

// ─── Situational batting stats ──────────────────────

describe('computeSituationalBattingStats', () => {
  it('tracks RISP hits and at-bats', () => {
    const events: PlayEvent[] = [
      // Runner gets to 2B
      makeEvent({
        type: 'hit',
        hitType: 'double',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'runner1',
        rbi: 0,
        runnerMovements: [{ runnerId: 'runner1', from: 'batter', to: 'second' }],
      }),
      // Batter1 hits with RISP
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'batter1',
        rbi: 1,
        runnerMovements: [
          { runnerId: 'runner1', from: 'second', to: 'home' },
          { runnerId: 'batter1', from: 'batter', to: 'first' },
        ],
      }),
    ];
    const stats = computeSituationalBattingStats(events, 'batter1');
    expect(stats.abRisp).toBe(1);
    expect(stats.hRisp).toBe(1);
    expect(stats.avgRisp).toBe(1);
  });

  it('does not count as RISP when runner only on 1B', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'runner1',
        rbi: 0,
        runnerMovements: [{ runnerId: 'runner1', from: 'batter', to: 'first' }],
      }),
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'batter1',
        rbi: 0,
        runnerMovements: [
          { runnerId: 'runner1', from: 'first', to: 'second' },
          { runnerId: 'batter1', from: 'batter', to: 'first' },
        ],
      }),
    ];
    const stats = computeSituationalBattingStats(events, 'batter1');
    expect(stats.abRisp).toBe(0);
    expect(stats.hRisp).toBe(0);
  });

  it('tracks 2-out RBI', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'runner1',
        rbi: 0,
        runnerMovements: [{ runnerId: 'runner1', from: 'batter', to: 'first' }],
      }),
      makeEvent({
        type: 'hit',
        hitType: 'home_run',
        inning: 1,
        halfInning: 'top',
        outsBefore: 2,
        batterId: 'batter1',
        rbi: 2,
        runnerMovements: [
          { runnerId: 'runner1', from: 'first', to: 'home' },
          { runnerId: 'batter1', from: 'batter', to: 'home' },
        ],
      }),
    ];
    const stats = computeSituationalBattingStats(events, 'batter1');
    expect(stats.twoOutRbi).toBe(2);
  });

  it('counts LOB when batter makes an out with runners on', () => {
    const events: PlayEvent[] = [
      // Runner on 1B
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'runner1',
        rbi: 0,
        runnerMovements: [{ runnerId: 'runner1', from: 'batter', to: 'first' }],
      }),
      // Runner on 2B
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'runner2',
        rbi: 0,
        runnerMovements: [
          { runnerId: 'runner1', from: 'first', to: 'second' },
          { runnerId: 'runner2', from: 'batter', to: 'first' },
        ],
      }),
      // Batter strikes out — 2 LOB
      makeEvent({
        type: 'strikeout',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'batter1',
        looking: false,
      }),
    ];
    const stats = computeSituationalBattingStats(events, 'batter1');
    expect(stats.lob).toBe(2);
  });

  it('returns zero RISP stats when no situational events', () => {
    const events: PlayEvent[] = [
      makeEvent({
        type: 'hit',
        hitType: 'single',
        inning: 1,
        halfInning: 'top',
        outsBefore: 0,
        batterId: 'batter1',
        rbi: 0,
        runnerMovements: [{ runnerId: 'batter1', from: 'batter', to: 'first' }],
      }),
    ];
    const stats = computeSituationalBattingStats(events, 'batter1');
    expect(stats.abRisp).toBe(0);
    expect(stats.hRisp).toBe(0);
    expect(stats.avgRisp).toBe(0);
    expect(stats.twoOutRbi).toBe(0);
    expect(stats.lob).toBe(0);
  });
});
