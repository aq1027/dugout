import { describe, it, expect } from 'vitest';
import { computeBattingStats } from '../statsEngine';
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
});
