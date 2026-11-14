/**
 * Force-play classification.
 *
 * Two scoring rules hinge on whether an out was a force out:
 *  - MLB 5.08(a): no run scores on a play where the 3rd out is a force out
 *    (or the batter-runner is out before reaching first base).
 *  - MLB 9.04(b)(1): no RBI when the batter grounds into a force or
 *    reverse-force double play.
 *
 * Events don't record the order outs were made in, so "forced" here means
 * forced at the time of the pitch.
 */
import type { BaseState, OccupiableBase } from '../models/common';
import type { PlayEvent, RunnerMovement } from '../models/play';

/** A runner is forced when every base behind them is occupied. */
export function isRunnerForced(from: OccupiableBase, bases: BaseState): boolean {
  if (from === 'first') return true;
  if (from === 'second') return bases.first !== null;
  return bases.first !== null && bases.second !== null;
}

/**
 * Does the batter become a runner on this play, putting the force on?
 * A ball caught in the air removes every force, so a runner doubled off after
 * a fly/line out is a tag (appeal) out, never a force out.
 *
 * Legacy `double_play` / `triple_play` out types (written before v0.1.4, which
 * overwrote the scorer's choice) can't tell a ground ball from a line drive,
 * so they are treated as non-force and their recorded runs are left alone.
 */
function batterPutsForceOn(event: PlayEvent): boolean {
  switch (event.type) {
    case 'hit':
    case 'error':
    case 'fielders_choice':
    case 'walk':
    case 'hit_by_pitch':
    case 'dropped_third_strike':
      return true;
    case 'out':
      return event.outType === 'ground_out' || event.sacrifice === 'bunt';
    default:
      return false;
  }
}

function isForcedRunnerOut(m: RunnerMovement, event: PlayEvent, basesBefore: BaseState): boolean {
  if (m.from === 'batter' || m.from === 'home') return false;
  return batterPutsForceOn(event) && isRunnerForced(m.from, basesBefore);
}

/**
 * A batter put out on a hit or error had already reached base and was thrown
 * out advancing — a tag play. Any other batter out happens before first base.
 */
function batterOutIsBeforeFirst(event: PlayEvent): boolean {
  return event.type !== 'hit' && event.type !== 'error';
}

/** Is the batter out on this event, whether or not a movement says so? */
function isBatterOut(event: PlayEvent): boolean {
  const outs = event.runnerMovements.filter(m => m.to === 'out');
  if (outs.some(m => m.from === 'batter')) return true;
  if (event.type === 'strikeout') return true;
  if (event.type === 'dropped_third_strike') return !event.safe;
  // An out event that lists fewer out movements than it recorded — the
  // unlisted out is the batter's
  if (event.type === 'out') return outs.length < event.outsRecorded;
  return false;
}

/**
 * MLB 9.04(b)(1): did the batter ground into a force (or reverse-force) double
 * play? True when the play records 2+ outs and every one of them is the batter
 * before first base or a runner who was forced.
 *
 * A line drive caught with a runner doubled off is a *tag* double play — an
 * RBI is still credited there if another runner scores.
 */
export function isForceDoublePlay(event: PlayEvent, basesBefore: BaseState): boolean {
  if (event.type !== 'out') return false;
  const outs = event.runnerMovements.filter(m => m.to === 'out');
  if (outs.length < 2) return false;
  return outs.every(m => m.from === 'batter' || isForcedRunnerOut(m, event, basesBefore));
}

/**
 * Is a double play that mixes the batter's out with a forced runner's out —
 * the one shape where the *order* of the outs decides whether a run counts?
 *
 * 6-4-3: the batter at first is the last out, so no run scores. 3-6 (step on
 * first, then tag the runner): the force is gone, so it's a timing play and a
 * run that crossed first counts. The event can't tell these apart.
 */
export function isOrderDependentForcePlay(event: PlayEvent, basesBefore: BaseState): boolean {
  if (!isBatterOut(event) || !batterOutIsBeforeFirst(event)) return false;
  const runnerOuts = event.runnerMovements.filter(m => m.to === 'out' && m.from !== 'batter');
  return runnerOuts.length > 0 && runnerOuts.every(m => isForcedRunnerOut(m, event, basesBefore));
}

/**
 * MLB 5.08(a): if this event makes the 3rd out, is that out certainly a force
 * out (or the batter before first base) — meaning no run can score on the play?
 *
 * Returns false for anything that might be a timing play: a tag out, a batter
 * thrown out stretching a hit, or an order-dependent double play (see
 * `isOrderDependentForcePlay`). Those are left to the scorer.
 */
export function thirdOutIsForce(event: PlayEvent, basesBefore: BaseState): boolean {
  const batterOut = isBatterOut(event);
  const runnerOuts = event.runnerMovements.filter(m => m.to === 'out' && m.from !== 'batter');

  if (!batterOut && runnerOuts.length === 0) return false;
  if (batterOut && !batterOutIsBeforeFirst(event)) return false;
  if (batterOut && runnerOuts.length > 0) return false;
  return runnerOuts.every(m => isForcedRunnerOut(m, event, basesBefore));
}
