/**
 * Scenario tests: how a game ends, and the engine guards around the 3rd out.
 *
 * Covers the mercy rule (both teams, both halves), the 3rd-out force rule
 * enforced at the engine level, and out counting on multi-out events.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState, getOutsFromEvent } from '../gameEngine';
import type { Game, GameRules } from '../../models/game';
import type { PlayEvent } from '../../models/play';
import {
  makeGame, A, H,
  single, triple, homeRun,
  groundOut, flyOut, strikeout, caughtStealing, fieldersChoice, doublePlay,
  threeOuts, mv,
} from './scenario-helpers';

// ─── Mercy rule ────────────────────────────────

/** 7-inning game, 10-run mercy after 5 */
function mercyGame(events: PlayEvent[], rules: Partial<GameRules> = {}): Game {
  const base = makeGame();
  return makeGame({
    events,
    rules: { ...base.rules, innings: 7, mercyRule: 10, mercyInning: 5, ...rules },
  });
}

type Half = 'top' | 'bottom';
const batters = (half: Half) => (half === 'top' ? A : H);

/** `n` solo home runs in the given half-inning */
function soloHomers(n: number, inning: number, half: Half, outsBefore = 0): PlayEvent[] {
  return Array.from({ length: n }, (_, i) =>
    homeRun(batters(half)[i % 9], [], { inning, halfInning: half, outsBefore }));
}

/** Scoreless full innings 1..n */
function scorelessInnings(n: number): PlayEvent[] {
  const events: PlayEvent[] = [];
  for (let inning = 1; inning <= n; inning++) {
    events.push(...threeOuts(inning, 'top', A), ...threeOuts(inning, 'bottom', H));
  }
  return events;
}

describe('Scenario: Mercy rule', () => {
  it('home team reaches the margin in the bottom half — game ends immediately', () => {
    const events = [
      ...scorelessInnings(4),
      ...threeOuts(5, 'top', A),
      ...soloHomers(10, 5, 'bottom'),
    ];
    const state = deriveGameState(mercyGame(events));

    expect(state.homeScore).toBe(10);
    expect(state.isGameOver).toBe(true);
    // Ended mid-inning — the home team did not have to finish batting
    expect(state.inning).toBe(5);
    expect(state.halfInning).toBe('bottom');
  });

  it('one run short of the margin — play continues', () => {
    const events = [
      ...scorelessInnings(4),
      ...threeOuts(5, 'top', A),
      ...soloHomers(9, 5, 'bottom'),
    ];
    expect(deriveGameState(mercyGame(events)).isGameOver).toBe(false);
  });

  it('home team already ahead by the margin — ends when the top half does', () => {
    const events = [
      ...threeOuts(1, 'top', A),
      ...soloHomers(10, 1, 'bottom'),
      ...threeOuts(1, 'bottom', H),
      ...[2, 3, 4].flatMap(i => [...threeOuts(i, 'top', A), ...threeOuts(i, 'bottom', H)]),
      ...threeOuts(5, 'top', A),
    ];
    const state = deriveGameState(mercyGame(events));

    expect(state.isGameOver).toBe(true);
    expect(state.inning).toBe(5);
  });

  it('away team ahead by the margin — home team still gets its half', () => {
    const events = [
      ...soloHomers(10, 1, 'top'),
      ...threeOuts(1, 'top', A),
      ...threeOuts(1, 'bottom', H),
      ...[2, 3, 4].flatMap(i => [...threeOuts(i, 'top', A), ...threeOuts(i, 'bottom', H)]),
      ...threeOuts(5, 'top', A),
    ];
    const midFifth = deriveGameState(mercyGame(events));
    expect(midFifth.isGameOver).toBe(false);
    expect(midFifth.halfInning).toBe('bottom');

    const afterFifth = deriveGameState(mercyGame([...events, ...threeOuts(5, 'bottom', H)]));
    expect(afterFifth.isGameOver).toBe(true);
    expect(afterFifth.awayScore).toBe(10);
  });

  it('away team going up big mid-inning does not end the game on the spot', () => {
    const events = [
      ...scorelessInnings(4),
      ...soloHomers(10, 5, 'top'),
    ];
    expect(deriveGameState(mercyGame(events)).isGameOver).toBe(false);
  });

  it('does not apply before the mercy inning is complete', () => {
    // "After 5" means five innings, not the start of the fifth
    const events = [
      ...soloHomers(10, 1, 'top'),
      ...threeOuts(1, 'top', A),
      ...threeOuts(1, 'bottom', H),
      ...[2, 3, 4].flatMap(i => [...threeOuts(i, 'top', A), ...threeOuts(i, 'bottom', H)]),
    ];
    const state = deriveGameState(mercyGame(events));

    expect(state.inning).toBe(5);
    expect(state.isGameOver).toBe(false);
  });

  it('home lead before the mercy inning does not end the game', () => {
    const events = [
      ...threeOuts(1, 'top', A),
      ...soloHomers(12, 1, 'bottom'),
    ];
    expect(deriveGameState(mercyGame(events)).isGameOver).toBe(false);
  });

  it('is ignored when no mercy rule is set', () => {
    const events = [
      ...scorelessInnings(4),
      ...threeOuts(5, 'top', A),
      ...soloHomers(20, 5, 'bottom'),
    ];
    const state = deriveGameState(mercyGame(events, { mercyRule: null, mercyInning: null }));
    expect(state.isGameOver).toBe(false);
  });
});

// ─── 3rd-out force rule, enforced by the engine ───

describe('Scenario: 3rd-out force rule (engine guard)', () => {
  const twoOutsRunnerOnThird = (): PlayEvent[] => [
    strikeout(A[0]),
    strikeout(A[1], { outsBefore: 1 }),
    triple(A[2], [], { outsBefore: 2 }),
  ];

  it('batter grounds out for the 3rd out — a run carried on the event does not score', () => {
    const state = deriveGameState(makeGame({
      events: [
        ...twoOutsRunnerOnThird(),
        groundOut(A[3], {
          outsBefore: 2,
          runnerMovements: [mv(A[2], 'third', 'home'), mv(A[3], 'batter', 'out')],
        }),
      ],
    }));

    expect(state.halfInning).toBe('bottom');
    expect(state.awayScore).toBe(0);
    expect(state.awayLineScore[0]).toBe(0);
    expect(state.awayLOB).toBe(1); // the runner is stranded, not scored
  });

  it('batter flies out for the 3rd out — no run', () => {
    const state = deriveGameState(makeGame({
      events: [
        ...twoOutsRunnerOnThird(),
        flyOut(A[3], {
          outsBefore: 2,
          runnerMovements: [mv(A[2], 'third', 'home'), mv(A[3], 'batter', 'out')],
        }),
      ],
    }));
    expect(state.awayScore).toBe(0);
  });

  it('forced runner is the 3rd out on a fielder\'s choice — no run', () => {
    const state = deriveGameState(makeGame({
      events: [
        ...twoOutsRunnerOnThird(),
        single(A[3], [], { outsBefore: 2 }),              // A[3] on 1B, A[2] holds at 3B
        fieldersChoice(A[4], [
          mv(A[2], 'third', 'home'),
          mv(A[3], 'first', 'out'),
          mv(A[4], 'batter', 'first'),
        ], { outsBefore: 2 }),
      ],
    }));

    expect(state.halfInning).toBe('bottom');
    expect(state.awayScore).toBe(0);
  });

  it('timing play: unforced runner tagged for the 3rd out — the run counts', () => {
    const state = deriveGameState(makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        triple(A[2], [], { outsBefore: 2 }),
        // A[3] doubles, A[2] holds — runners 2B+3B, 1B empty
        { ...single(A[3], [], { outsBefore: 2 }), runnerMovements: [mv(A[3], 'batter', 'second')] } as PlayEvent,
        fieldersChoice(A[4], [
          mv(A[2], 'third', 'home'),
          mv(A[3], 'second', 'out'),
          mv(A[4], 'batter', 'first'),
        ], { outsBefore: 2 }),
      ],
    }));

    expect(state.halfInning).toBe('bottom');
    expect(state.awayScore).toBe(1);
  });

  it('runner caught stealing for the 3rd out — an earlier run on the play counts', () => {
    const state = deriveGameState(makeGame({
      events: [
        ...twoOutsRunnerOnThird(),
        single(A[3], [], { outsBefore: 2 }),
        // Double steal: runner from third scores, trail runner thrown out
        {
          ...caughtStealing(A[3], 'first', 'second', { outsBefore: 2 }),
          runnerMovements: [mv(A[2], 'third', 'home'), mv(A[3], 'first', 'out')],
        } as PlayEvent,
      ],
    }));

    expect(state.awayScore).toBe(1);
  });

  it('a run with fewer than 3 outs is untouched', () => {
    const state = deriveGameState(makeGame({
      events: [
        triple(A[0]),
        groundOut(A[1], {
          runnerMovements: [mv(A[0], 'third', 'home'), mv(A[1], 'batter', 'out')],
        }),
      ],
    }));

    expect(state.outs).toBe(1);
    expect(state.awayScore).toBe(1);
  });

  it('pre-v0.1.4 double_play events keep the runs they recorded', () => {
    // The old out type can't tell a ground ball from a line drive, so the
    // engine does not second-guess a stored score.
    const state = deriveGameState(makeGame({
      events: [
        strikeout(A[0]),
        triple(A[1], [], { outsBefore: 1 }),
        single(A[2], [], { outsBefore: 1 }),
        doublePlay(A[3], [
          mv(A[1], 'third', 'home'),
          mv(A[2], 'first', 'out'),
          mv(A[3], 'batter', 'out'),
        ], { outsBefore: 1 }),
      ],
    }));

    expect(state.halfInning).toBe('bottom');
    expect(state.awayScore).toBe(1);
  });
});

// ─── Out counting ──────────────────────────────

describe('Scenario: outs on multi-out events', () => {
  it('double steal, both runners caught — 2 outs', () => {
    const cs = {
      ...caughtStealing(A[1], 'first', 'second'),
      runnerMovements: [mv(A[0], 'second', 'out'), mv(A[1], 'first', 'out')],
    } as PlayEvent;
    expect(getOutsFromEvent(cs)).toBe(2);

    const state = deriveGameState(makeGame({
      events: [
        single(A[0]),
        single(A[1], [mv(A[0], 'first', 'second')]),
        cs,
      ],
    }));
    expect(state.outs).toBe(2);
    expect(state.bases).toEqual({ first: null, second: null, third: null });
  });

  it('ordinary caught stealing — still 1 out', () => {
    expect(getOutsFromEvent(caughtStealing(A[0], 'first', 'second'))).toBe(1);
  });

  it("strike 'em out, throw 'em out — 2 outs", () => {
    const k = { ...strikeout(A[1]), runnerMovements: [mv(A[0], 'first', 'out')] } as PlayEvent;
    expect(getOutsFromEvent(k)).toBe(2);
  });

  it('strikeout that also lists the batter as out — not double-counted', () => {
    const k = { ...strikeout(A[0]), runnerMovements: [mv(A[0], 'batter', 'out')] } as PlayEvent;
    expect(getOutsFromEvent(k)).toBe(1);
  });

  it('plain strikeout — 1 out', () => {
    expect(getOutsFromEvent(strikeout(A[0]))).toBe(1);
  });
});
