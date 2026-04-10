/**
 * Shared test helpers for scenario tests.
 * Re-exports and extends the patterns from gameEngine.test.ts.
 */
import type { Game } from '../../models/game';
import type { PlayEvent, RunnerMovement } from '../../models/play';
import type { Lineup } from '../../models/lineup';
import type { Base, PositionNumber } from '../../models/common';

// ─── ID generator ──────────────────────────────
let idCounter = 1000;
export function tid(prefix = 'id'): string {
  return `${prefix}-${++idCounter}`;
}

// Player IDs for away team (a1–a9) and home team (h1–h9)
export const A = Array.from({ length: 9 }, (_, i) => `a${i + 1}`);
export const H = Array.from({ length: 9 }, (_, i) => `h${i + 1}`);

// ─── Lineup builder ────────────────────────────
export function makeLineup(playerIds: string[] = A, useDH = false): Lineup {
  return {
    startingOrder: playerIds.map((playerId, i) => ({
      playerId,
      position: ((i % 9) + 1) as PositionNumber,
    })),
    substitutions: [],
    useDH,
  };
}

// ─── Game builder ──────────────────────────────
export function makeGame(overrides?: Partial<Game>): Game {
  return {
    id: tid('game'),
    sport: 'baseball',
    date: '2026-04-07',
    innings: 9,
    awayTeamId: 'away-team',
    homeTeamId: 'home-team',
    awayTeamName: 'Away',
    homeTeamName: 'Home',
    awayLineup: makeLineup(A),
    homeLineup: makeLineup(H),
    events: [],
    status: 'in_progress',
    rules: {
      innings: 9,
      playersPerSide: 9,
      useDH: false,
      dpFlex: false,
      mercyRule: null,
      mercyInning: null,
      extraInningAutoRunner: true,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
    },
    createdAt: '2026-04-07T12:00:00Z',
    updatedAt: '2026-04-07T12:00:00Z',
    ...overrides,
  };
}

// ─── Event builders ────────────────────────────

/** Base fields for any event */
function base(overrides: Partial<PlayEvent> & { type: PlayEvent['type'] }): PlayEvent {
  return {
    id: tid('ev'),
    timestamp: new Date().toISOString(),
    inning: 1,
    halfInning: 'top',
    outsBefore: 0,
    batterId: A[0],
    pitchSequence: [],
    runnerMovements: [],
    ...overrides,
  } as PlayEvent;
}

// ── Hits ──

export function hit(
  hitType: 'single' | 'double' | 'triple' | 'home_run',
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    batterId?: string;
    runnerMovements?: RunnerMovement[];
    rbi?: number;
  } = {},
): PlayEvent {
  const mvs = opts.runnerMovements ?? [];
  const rbi = opts.rbi ?? mvs.filter(m => m.to === 'home').length;
  return base({
    type: 'hit',
    hitType,
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId: opts.batterId ?? A[0],
    runnerMovements: mvs,
    rbi,
    pitchSequence: [{ result: 'in_play' }],
  });
}

export function single(
  batterId: string,
  runnerMovements: RunnerMovement[] = [],
  opts: { inning?: number; halfInning?: 'top' | 'bottom'; outsBefore?: number } = {},
): PlayEvent {
  const mvs: RunnerMovement[] = [
    { runnerId: batterId, from: 'batter', to: 'first' },
    ...runnerMovements,
  ];
  return hit('single', { batterId, runnerMovements: mvs, ...opts });
}

export function double_(
  batterId: string,
  runnerMovements: RunnerMovement[] = [],
  opts: { inning?: number; halfInning?: 'top' | 'bottom'; outsBefore?: number } = {},
): PlayEvent {
  const mvs: RunnerMovement[] = [
    { runnerId: batterId, from: 'batter', to: 'second' },
    ...runnerMovements,
  ];
  return hit('double', { batterId, runnerMovements: mvs, ...opts });
}

export function triple(
  batterId: string,
  runnerMovements: RunnerMovement[] = [],
  opts: { inning?: number; halfInning?: 'top' | 'bottom'; outsBefore?: number } = {},
): PlayEvent {
  const mvs: RunnerMovement[] = [
    { runnerId: batterId, from: 'batter', to: 'third' },
    ...runnerMovements,
  ];
  return hit('triple', { batterId, runnerMovements: mvs, ...opts });
}

export function homeRun(
  batterId: string,
  runnerMovements: RunnerMovement[] = [],
  opts: { inning?: number; halfInning?: 'top' | 'bottom'; outsBefore?: number } = {},
): PlayEvent {
  const mvs: RunnerMovement[] = [
    { runnerId: batterId, from: 'batter', to: 'home' as Base },
    ...runnerMovements,
  ];
  return hit('home_run', { batterId, runnerMovements: mvs, ...opts });
}

// ── Outs ──

export function groundOut(
  batterId: string,
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    notation?: string;
    runnerMovements?: RunnerMovement[];
    outsRecorded?: number;
    sacrifice?: 'fly' | 'bunt';
    rbi?: number;
  } = {},
): PlayEvent {
  const mvs = opts.runnerMovements ?? [{ runnerId: batterId, from: 'batter' as const, to: 'out' as const }];
  return base({
    type: 'out',
    outType: 'ground_out',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    notation: opts.notation ?? '4-3',
    outsRecorded: opts.outsRecorded ?? mvs.filter(m => m.to === 'out').length,
    runnerMovements: mvs,
    sacrifice: opts.sacrifice,
    rbi: opts.rbi ?? mvs.filter(m => m.to === 'home').length,
    pitchSequence: [{ result: 'in_play' }],
  });
}

export function flyOut(
  batterId: string,
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    notation?: string;
    runnerMovements?: RunnerMovement[];
    outsRecorded?: number;
    sacrifice?: 'fly' | 'bunt';
    rbi?: number;
  } = {},
): PlayEvent {
  const mvs = opts.runnerMovements ?? [{ runnerId: batterId, from: 'batter' as const, to: 'out' as const }];
  return base({
    type: 'out',
    outType: 'fly_out',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    notation: opts.notation ?? '8',
    outsRecorded: opts.outsRecorded ?? mvs.filter(m => m.to === 'out').length,
    runnerMovements: mvs,
    sacrifice: opts.sacrifice,
    rbi: opts.rbi ?? mvs.filter(m => m.to === 'home').length,
    pitchSequence: [{ result: 'in_play' }],
  });
}

export function lineOut(
  batterId: string,
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    notation?: string;
    runnerMovements?: RunnerMovement[];
    outsRecorded?: number;
  } = {},
): PlayEvent {
  const mvs = opts.runnerMovements ?? [{ runnerId: batterId, from: 'batter' as const, to: 'out' as const }];
  return base({
    type: 'out',
    outType: 'line_out',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    notation: opts.notation ?? '4',
    outsRecorded: opts.outsRecorded ?? mvs.filter(m => m.to === 'out').length,
    runnerMovements: mvs,
    rbi: 0,
    pitchSequence: [{ result: 'in_play' }],
  });
}

export function doublePlay(
  batterId: string,
  runnerMovements: RunnerMovement[],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    notation?: string;
  } = {},
): PlayEvent {
  return base({
    type: 'out',
    outType: 'double_play',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    notation: opts.notation ?? '6-4-3',
    outsRecorded: 2,
    runnerMovements,
    sacrifice: undefined,
    rbi: runnerMovements.filter(m => m.to === 'home').length,
    pitchSequence: [{ result: 'in_play' }],
  });
}

// ── Strikeouts ──

export function strikeout(
  batterId: string,
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    looking?: boolean;
  } = {},
): PlayEvent {
  return base({
    type: 'strikeout',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    looking: opts.looking ?? false,
    pitchSequence: [
      { result: 'strike_swinging' },
      { result: 'strike_swinging' },
      { result: 'strike_swinging' },
    ],
  });
}

// ── Walks ──

export function walk(
  batterId: string,
  runnerMovements: RunnerMovement[] = [],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    intentional?: boolean;
  } = {},
): PlayEvent {
  const mvs: RunnerMovement[] = [
    { runnerId: batterId, from: 'batter', to: 'first' },
    ...runnerMovements,
  ];
  return base({
    type: 'walk',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    intentional: opts.intentional ?? false,
    runnerMovements: mvs,
    rbi: mvs.filter(m => m.to === 'home').length,
    pitchSequence: [
      { result: 'ball' },
      { result: 'ball' },
      { result: 'ball' },
      { result: 'ball' },
    ],
  });
}

// ── HBP ──

export function hitByPitch(
  batterId: string,
  runnerMovements: RunnerMovement[] = [],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
  } = {},
): PlayEvent {
  const mvs: RunnerMovement[] = [
    { runnerId: batterId, from: 'batter', to: 'first' },
    ...runnerMovements,
  ];
  return base({
    type: 'hit_by_pitch',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    runnerMovements: mvs,
    rbi: mvs.filter(m => m.to === 'home').length,
    pitchSequence: [{ result: 'ball' }],
  });
}

// ── Between-AB events ──

export function wildPitch(
  runnerMovements: RunnerMovement[],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
  } = {},
): PlayEvent {
  return base({
    type: 'wild_pitch',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId: null,
    runnerMovements,
    pitchSequence: [],
  });
}

export function passedBall(
  runnerMovements: RunnerMovement[],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
  } = {},
): PlayEvent {
  return base({
    type: 'passed_ball',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId: null,
    runnerMovements,
    pitchSequence: [],
  });
}

export function stolenBase(
  runnerId: string,
  from: Base,
  to: Base,
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
  } = {},
): PlayEvent {
  return base({
    type: 'stolen_base',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId: null,
    runnerId,
    base: to,
    runnerMovements: [{ runnerId, from, to }],
    pitchSequence: [],
  });
}

export function caughtStealing(
  runnerId: string,
  from: Base,
  attemptedBase: Base,
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
  } = {},
): PlayEvent {
  return base({
    type: 'caught_stealing',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId: null,
    runnerId,
    base: attemptedBase,
    notation: '2-6',
    runnerMovements: [{ runnerId, from, to: 'out' }],
    pitchSequence: [],
  });
}

export function balk(
  runnerMovements: RunnerMovement[],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
  } = {},
): PlayEvent {
  return base({
    type: 'balk',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId: null,
    runnerMovements,
    pitchSequence: [],
  });
}

export function fieldersChoice(
  batterId: string,
  runnerMovements: RunnerMovement[],
  opts: {
    inning?: number;
    halfInning?: 'top' | 'bottom';
    outsBefore?: number;
    notation?: string;
  } = {},
): PlayEvent {
  return base({
    type: 'fielders_choice',
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: opts.outsBefore ?? 0,
    batterId,
    notation: opts.notation ?? '6-4',
    runnerMovements,
    rbi: runnerMovements.filter(m => m.to === 'home').length,
    pitchSequence: [{ result: 'in_play' }],
  });
}

// ── Helpers to advance to a specific game state ──

/** Generate 3 strikeouts to end a half-inning */
export function threeOuts(
  inning: number,
  halfInning: 'top' | 'bottom',
  batters: string[],
): PlayEvent[] {
  return [
    strikeout(batters[0], { inning, halfInning, outsBefore: 0 }),
    strikeout(batters[1], { inning, halfInning, outsBefore: 1 }),
    strikeout(batters[2], { inning, halfInning, outsBefore: 2 }),
  ];
}

/** Runner movement shorthand: runnerId moves from -> to */
export function mv(runnerId: string, from: Base | 'batter', to: Base | 'out'): RunnerMovement {
  return { runnerId, from, to };
}
