import type { BaseState } from '../models/common';
import type { DerivedGameState, Game, GameRules } from '../models/game';
import type { PlayEvent, Pitch, RunnerMovement } from '../models/play';
import type { Substitution } from '../models/lineup';
import { EMPTY_BASES } from '../models/common';
import { thirdOutIsForce } from './forcePlay';

/**
 * Derives the full game state by replaying all events.
 * This is the core of the event-sourced architecture.
 */
export function deriveGameState(game: Game): DerivedGameState {
  const state: DerivedGameState = {
    inning: 1,
    halfInning: 'top',
    outs: 0,
    count: { balls: 0, strikes: 0 },
    bases: { ...EMPTY_BASES },
    awayBatterIndex: 0,
    homeBatterIndex: 0,
    awayScore: 0,
    homeScore: 0,
    awayHits: 0,
    homeHits: 0,
    awayErrors: 0,
    homeErrors: 0,
    isGameOver: false,
    awayLineScore: [],
    homeLineScore: [],
    awayMoundVisits: 0,
    homeMoundVisits: 0,
    awayTimeouts: 0,
    homeTimeouts: 0,
    currentAtBatPitches: [],
    awayLOB: 0,
    homeLOB: 0,
  };

  for (const event of game.events) {
    applyEvent(state, event, game);
  }

  return state;
}

/** Apply a single event to the mutable state */
function applyEvent(state: DerivedGameState, event: PlayEvent, game: Game): void {
  if (state.isGameOver) return;
  const rules = game.rules;

  // Ensure line score arrays are long enough
  while (state.awayLineScore.length < state.inning) state.awayLineScore.push(0);
  while (state.homeLineScore.length < state.inning) state.homeLineScore.push(0);

  const isAwayBatting = state.halfInning === 'top';
  const outsFromEvent = getOutsFromEvent(event);

  // MLB 5.08(a): no run scores on a play where the 3rd out is a force out,
  // even if a runner crossed the plate first. The scoring panel already drops
  // those runs, but an imported or hand-built event may still carry them — the
  // runner is treated as stranded instead.
  const runsWiped = state.outs + outsFromEvent >= 3 && thirdOutIsForce(event, state.bases);
  const movements = runsWiped
    ? event.runnerMovements.filter(m => m.to !== 'home')
    : event.runnerMovements;

  const runsScored = movements.filter(m => m.to === 'home').length;

  if (isAwayBatting) {
    state.awayScore += runsScored;
    state.awayLineScore[state.inning - 1] += runsScored;
  } else {
    state.homeScore += runsScored;
    state.homeLineScore[state.inning - 1] += runsScored;
  }

  state.outs += outsFromEvent;

  // Track hits
  if (event.type === 'hit') {
    if (isAwayBatting) state.awayHits++;
    else state.homeHits++;
  }

  // Track errors
  if (event.type === 'error') {
    if (isAwayBatting) state.homeErrors++; // fielding team gets the error
    else state.awayErrors++;
  }
  // Also track errors on hit plays (e.g., single + E9 allows extra advancement)
  if (event.type === 'hit' && event.error) {
    if (isAwayBatting) state.homeErrors++;
    else state.awayErrors++;
  }

  // Track mound visits
  if (event.type === 'mound_visit') {
    if (event.teamId === game.awayTeamId) state.awayMoundVisits++;
    else state.homeMoundVisits++;
  }

  // Track timeouts
  if (event.type === 'timeout') {
    if (event.teamId === game.awayTeamId) state.awayTimeouts++;
    else state.homeTimeouts++;
  }

  // A pinch runner takes over the base their predecessor occupied, so any run,
  // steal, or advance from here on is credited to the incoming player.
  if (event.type === 'substitution' && event.subType === 'pinch_runner') {
    const base = event.replacedRunnerBase;
    if (base && state.bases[base] === event.outPlayerId) {
      state.bases[base] = event.inPlayerId;
    }
  }

  // Apply base state from runner movements
  applyRunnerMovements(state.bases, movements);

  // Check if this event ends the at-bat and advances the batter
  if (isAtBatComplete(event)) {
    state.count = { balls: 0, strikes: 0 };
    state.currentAtBatPitches = [];
    if (isAwayBatting) {
      state.awayBatterIndex = (state.awayBatterIndex + 1) % getBattingOrderSize(rules, game.awayLineup.startingOrder.length);
    } else {
      state.homeBatterIndex = (state.homeBatterIndex + 1) % getBattingOrderSize(rules, game.homeLineup.startingOrder.length);
    }
  } else if (event.pitchSequence && event.pitchSequence.length > 0) {
    // Non-completing event carrying pitches. Nothing produces one yet — it is
    // reserved for a WP/PB-during-at-bat flow. Until then the in-progress count
    // lives in AtBatPanel, and undo restores it via pitchesToRestoreAfterUndo().
    state.currentAtBatPitches = [...event.pitchSequence];
    state.count = countFromPitches(event.pitchSequence);
  }

  // Check for half-inning change (3 outs)
  if (state.outs >= 3) {
    // Count runners left on base before clearing
    const lob = countRunnersOnBase(state.bases);
    if (isAwayBatting) state.awayLOB += lob;
    else state.homeLOB += lob;

    advanceHalfInning(state, rules);
  }

  // Check for walk-off
  if (
    state.halfInning === 'bottom' &&
    state.inning >= rules.innings &&
    state.homeScore > state.awayScore
  ) {
    state.isGameOver = true;
  }

  // Mercy rule, home team ahead: the game ends the moment the lead is reached
  // in the bottom half — or as soon as the top half ends, since the home team
  // need not bat. An away lead is checked when the inning completes (see
  // advanceHalfInning), because the home team is owed its turn.
  if (
    state.halfInning === 'bottom' &&
    mercyApplies(state.inning, rules) &&
    state.homeScore - state.awayScore >= rules.mercyRule!
  ) {
    state.isGameOver = true;
  }
}

/** Has the game reached the inning from which the mercy rule can end it? */
function mercyApplies(inning: number, rules: GameRules): boolean {
  return rules.mercyRule !== null && rules.mercyInning !== null && inning >= rules.mercyInning;
}

/** Advance from top → bottom, or bottom → next inning top */
function advanceHalfInning(state: DerivedGameState, rules: GameRules): void {
  state.outs = 0;
  state.bases = { ...EMPTY_BASES };
  state.count = { balls: 0, strikes: 0 };
  state.currentAtBatPitches = [];

  if (state.halfInning === 'top') {
    state.halfInning = 'bottom';

    // If home team is ahead after top of last inning, game over
    if (state.inning >= rules.innings && state.homeScore > state.awayScore) {
      state.isGameOver = true;
    }
  } else {
    // End of full inning
    const lead = Math.abs(state.awayScore - state.homeScore);
    const mercy = mercyApplies(state.inning, rules) && lead >= rules.mercyRule!;
    if (mercy || (state.inning >= rules.innings && lead > 0)) {
      state.isGameOver = true;
    } else {
      state.inning++;
      state.halfInning = 'top';
    }
  }
}

/** Derive balls/strikes count from a pitch sequence */
export function countFromPitches(pitches: Pitch[]): { balls: number; strikes: number } {
  let balls = 0;
  let strikes = 0;
  for (const p of pitches) {
    if (p.result === 'ball' || p.result === 'pitch_clock_ball') {
      balls++;
    } else if (p.result === 'strike_swinging' || p.result === 'strike_looking' || p.result === 'pitch_clock_strike') {
      strikes++;
    } else if (p.result === 'foul' && strikes < 2) {
      strikes++;
    }
    // 'in_play' doesn't change the count
  }
  return { balls, strikes };
}

/**
 * Outs produced by an event.
 *
 * Strikeouts and caught-stealings carry an implicit out, but any further
 * runner marked out on the same event counts too — a strike-'em-out,
 * throw-'em-out double play, or both runners caught on a double steal.
 */
export function getOutsFromEvent(event: PlayEvent): number {
  const outMovements = event.runnerMovements.filter(m => m.to === 'out');
  const runnerOuts = outMovements.filter(m => m.from !== 'batter').length;

  switch (event.type) {
    case 'out':
      return event.outsRecorded;
    case 'strikeout':
      // The batter's out is implicit — a movement that also lists it must not
      // count twice
      return 1 + runnerOuts;
    case 'dropped_third_strike':
      return (event.safe ? 0 : 1) + runnerOuts;
    case 'caught_stealing':
      // The caught runner is already among the movements
      return Math.max(1, outMovements.length);
    case 'pickoff_attempt':
      return event.successful ? 1 : 0;
    default:
      return outMovements.length;
  }
}

/** Determine if this event completes the plate appearance */
function isAtBatComplete(event: PlayEvent): boolean {
  switch (event.type) {
    case 'hit':
    case 'out':
    case 'walk':
    case 'strikeout':
    case 'hit_by_pitch':
    case 'error':
    case 'fielders_choice':
    case 'dropped_third_strike':
      return true;
    case 'stolen_base':
    case 'caught_stealing':
    case 'wild_pitch':
    case 'passed_ball':
    case 'balk':
    case 'substitution':
    case 'mound_visit':
    case 'timeout':
    case 'pickoff_attempt':
      return false;
    default:
      return false;
  }
}

/** Apply runner movements to the base state */
function applyRunnerMovements(bases: BaseState, movements: RunnerMovement[]): void {
  // First, clear bases for runners who moved
  for (const movement of movements) {
    if (movement.from === 'first') bases.first = null;
    if (movement.from === 'second') bases.second = null;
    if (movement.from === 'third') bases.third = null;
  }

  // Then, place runners at their destinations
  for (const movement of movements) {
    if (movement.to === 'first') bases.first = movement.runnerId;
    if (movement.to === 'second') bases.second = movement.runnerId;
    if (movement.to === 'third') bases.third = movement.runnerId;
    // 'home' and 'out' — runner is no longer on base
  }
}

function getBattingOrderSize(rules: GameRules, lineupLength?: number): number {
  if (rules.everyoneBats && lineupLength) return lineupLength;
  return rules.playersPerSide;
}

/** Count runners currently on base */
function countRunnersOnBase(bases: BaseState): number {
  return (bases.first ? 1 : 0) + (bases.second ? 1 : 0) + (bases.third ? 1 : 0);
}

// ─── Undo support ─────────────────────────────────────────

/**
 * Undo the last event: removes it from the event list and re-derives state.
 * Returns the new events array (immutable — original game is not mutated).
 */
export function undoLastEvent(game: Game): PlayEvent[] {
  if (game.events.length === 0) return [];
  return game.events.slice(0, -1);
}

/**
 * Undo the last event, including any lineup change it carried.
 *
 * Substitutions live on `game.awayLineup`/`homeLineup` rather than being
 * derived from the event log, so dropping the event alone would leave the
 * roster change behind and desync the two.
 */
export function undoLastEventWithLineup(game: Game): Game {
  if (game.events.length === 0) return game;
  const undone = game.events[game.events.length - 1];
  const next: Game = { ...game, events: game.events.slice(0, -1) };

  if (undone.type === 'substitution') {
    // The team can't be read off `halfInning` — a pitching change belongs to
    // the fielding team, a pinch hitter to the batting team. Find the lineup
    // that actually holds the matching substitution instead.
    const matches = (s: Substitution) =>
      s.orderSlot === undone.orderSlot &&
      s.inPlayerId === undone.inPlayerId &&
      s.outPlayerId === undone.outPlayerId;

    for (const lineupKey of ['awayLineup', 'homeLineup'] as const) {
      const lineup = next[lineupKey];
      // Last match wins if the same slot was subbed more than once
      const idx = findLastIndex(lineup.substitutions, matches);
      if (idx >= 0) {
        next[lineupKey] = {
          ...lineup,
          substitutions: [
            ...lineup.substitutions.slice(0, idx),
            ...lineup.substitutions.slice(idx + 1),
          ],
        };
        break;
      }
    }
  }

  return next;
}

/**
 * The pitches to put back in front of the batter when the last event is undone.
 *
 * Replay alone can't recover them: a completed at-bat's pitches live on the
 * event being removed, so once it is gone the derived count is 0-0. Dropping
 * the final pitch (strike three, ball four, the HBP, or the ball put in play)
 * returns the batter to the count they faced before it.
 *
 * Returns null when the last event didn't end an at-bat — the at-bat in
 * progress is untouched by undoing a steal or a substitution.
 */
export function pitchesToRestoreAfterUndo(game: Game): Pitch[] | null {
  const undone = game.events[game.events.length - 1];
  if (!undone || !isAtBatComplete(undone)) return null;
  return undone.pitchSequence.slice(0, -1);
}

function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}
