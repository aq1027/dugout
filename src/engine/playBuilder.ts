/**
 * Builds the PlayEvent for a ball put in play.
 *
 * Pure — no React, no clock, no id generation — so the scoring rules that
 * decide RBI, out type, and whether a run counts can be unit-tested directly
 * rather than only through the scoring panel.
 */
import type { Id, Base, BaseState, InningHalfType, PositionNumber } from '../models/common';
import type { Pitch, PlayEvent, RunnerMovement } from '../models/play';
import { isForceDoublePlay, isOrderDependentForcePlay, thirdOutIsForce } from './forcePlay';

export type PlayOutcome =
  | { kind: 'hit'; hitType: 'single' | 'double' | 'triple' | 'home_run' }
  | { kind: 'out'; outType: 'ground_out' | 'fly_out' | 'line_out' | 'popup' }
  | { kind: 'error'; position: PositionNumber }
  | { kind: 'fielders_choice' }
  | { kind: 'dropped_third_strike' };

/** A runner (or the batter) and where the scorer sent them. `null` = unresolved. */
export interface ResolvedRunner {
  runnerId: Id;
  from: Base | 'batter';
  to: Base | 'out' | null;
}

export interface PlayInput {
  outcome: PlayOutcome;
  runners: ResolvedRunner[];
  /** Game state before the play */
  state: { inning: number; halfInning: InningHalfType; outs: number; bases: BaseState };
  batterId: Id;
  pitches: Pitch[];
  /** Fielding notation, e.g. "6-4-3" */
  notation?: string;
  sacrifice?: 'fly' | 'bunt';
  /** Error charged on a hit play */
  hitError?: { fielderPosition: PositionNumber } | null;
  /** Scorer's RBI judgment, replacing the computed default */
  rbiOverride?: number | null;
}

export interface PlayAnalysis {
  /** Movements to record — stay-put and unresolved runners dropped, wiped runs removed */
  movements: RunnerMovement[];
  /** Runners put out on the play */
  outs: number;
  /** Runs that count */
  runsScored: number;
  /** Runners marked as scoring whose run is wiped because the 3rd out is a force out */
  runsWiped: number;
  /** Batter grounded into a force / reverse-force double play (no RBI) */
  isForceDP: boolean;
  /**
   * The play ends the inning on a batter-plus-forced-runner double play with a
   * run marked. Whether the run counts depends on the order of the outs, which
   * only the scorer knows.
   */
  runDependsOnOutOrder: boolean;
  /** RBI credited before any scorer override */
  defaultRbi: number;
  /** RBI credited after the override */
  rbi: number;
}

interface EventMeta {
  id: Id;
  timestamp: string;
}

function toMovements(runners: ResolvedRunner[]): RunnerMovement[] {
  return runners
    .filter(r => r.to !== null && r.to !== r.from)
    .map(r => ({ runnerId: r.runnerId, from: r.from, to: r.to! }));
}

function makeEvent(input: PlayInput, movements: RunnerMovement[], rbi: number, meta: EventMeta): PlayEvent {
  const { outcome, state } = input;
  const common = {
    id: meta.id,
    timestamp: meta.timestamp,
    inning: state.inning,
    halfInning: state.halfInning,
    outsBefore: state.outs,
    batterId: input.batterId,
    pitchSequence: input.pitches,
    runnerMovements: movements,
  };

  switch (outcome.kind) {
    case 'hit':
      return {
        ...common,
        type: 'hit',
        hitType: outcome.hitType,
        rbi,
        ...(input.hitError ? { error: input.hitError } : {}),
      };
    case 'out':
      return {
        ...common,
        type: 'out',
        // The scorer's classification stands. A double or triple play is read
        // off `outsRecorded`, not written over the type — a sac fly with a
        // runner thrown out at the plate is still a fly out.
        outType: outcome.outType,
        notation: input.notation || '?',
        outsRecorded: Math.max(movements.filter(m => m.to === 'out').length, 1),
        sacrifice: input.sacrifice,
        rbi,
      };
    case 'error':
      return {
        ...common,
        type: 'error',
        fielderPosition: outcome.position,
        baseReached: (movements.find(m => m.from === 'batter')?.to as Base) ?? 'first',
        rbi,
      };
    case 'fielders_choice':
      return {
        ...common,
        type: 'fielders_choice',
        notation: input.notation || 'FC',
        rbi,
      };
    case 'dropped_third_strike':
      return {
        ...common,
        type: 'dropped_third_strike',
        safe: !movements.some(m => m.from === 'batter' && m.to === 'out'),
      };
  }
}

/**
 * Work out what a play scores: which movements stand, how many runs count,
 * and how many RBI the batter is credited with.
 */
export function analyzePlay(input: PlayInput): PlayAnalysis {
  const { outcome, state } = input;
  const marked = toMovements(input.runners);
  const draft = makeEvent(input, marked, 0, { id: '', timestamp: '' });

  // An out always retires at least the batter, even if no movement says so
  const outsMarked = marked.filter(m => m.to === 'out').length;
  const outs = outcome.kind === 'out' ? Math.max(outsMarked, 1) : outsMarked;
  const endsInning = state.outs + outs >= 3;
  const runsMarked = marked.filter(m => m.to === 'home').length;

  // MLB 5.08(a): nothing scores when the 3rd out is a force out. The runner is
  // stranded, so their movement is dropped rather than recorded as a run.
  const wipeRuns = endsInning && runsMarked > 0 && thirdOutIsForce(draft, state.bases);
  const movements = wipeRuns ? marked.filter(m => m.to !== 'home') : marked;
  const runsScored = wipeRuns ? 0 : runsMarked;

  const isForceDP = isForceDoublePlay(draft, state.bases);

  let defaultRbi: number;
  if (outcome.kind === 'dropped_third_strike') {
    defaultRbi = 0;
  } else if (outcome.kind === 'error') {
    // MLB 9.04(b)(2): no RBI when the run scores because of the error.
    // 9.04(a)(3) excepts a runner on third with fewer than two out, who would
    // ordinarily have scored anyway.
    const runnerFromThirdScored = movements.some(m => m.from === 'third' && m.to === 'home');
    defaultRbi = runnerFromThirdScored && state.outs < 2 ? 1 : 0;
  } else if (isForceDP) {
    // MLB 9.04(b)(1)
    defaultRbi = 0;
  } else {
    defaultRbi = runsScored;
  }

  const override = input.rbiOverride;
  const rbi = override == null ? defaultRbi : Math.max(0, Math.min(override, runsScored));

  return {
    movements,
    outs,
    runsScored,
    runsWiped: wipeRuns ? runsMarked : 0,
    isForceDP,
    runDependsOnOutOrder: endsInning && runsMarked > 0 && isOrderDependentForcePlay(draft, state.bases),
    defaultRbi,
    rbi,
  };
}

/** Build the event to record for a ball put in play. */
export function buildPlayEvent(input: PlayInput, meta: EventMeta): PlayEvent {
  const analysis = analyzePlay(input);
  return makeEvent(input, analysis.movements, analysis.rbi, meta);
}
