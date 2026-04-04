import type { BaseState } from '../models/common';
import type { DerivedGameState, Game, GameRules } from '../models/game';
import type { PlayEvent } from '../models/play';
import { EMPTY_BASES } from '../models/common';

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

  // Count runs from runner movements
  const runsScored = event.runnerMovements.filter(m => m.to === 'home').length;
  const isAwayBatting = state.halfInning === 'top';

  if (isAwayBatting) {
    state.awayScore += runsScored;
    state.awayLineScore[state.inning - 1] += runsScored;
  } else {
    state.homeScore += runsScored;
    state.homeLineScore[state.inning - 1] += runsScored;
  }

  // Apply outs
  const outsFromEvent = getOutsFromEvent(event);
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

  // Apply base state from runner movements
  applyRunnerMovements(state.bases, event);

  // Check if this event ends the at-bat and advances the batter
  if (isAtBatComplete(event)) {
    state.count = { balls: 0, strikes: 0 };
    if (isAwayBatting) {
      state.awayBatterIndex = (state.awayBatterIndex + 1) % getBattingOrderSize(rules, game.awayLineup.startingOrder.length);
    } else {
      state.homeBatterIndex = (state.homeBatterIndex + 1) % getBattingOrderSize(rules, game.homeLineup.startingOrder.length);
    }
  }

  // Check for half-inning change (3 outs)
  if (state.outs >= 3) {
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

  // Check mercy rule
  if (rules.mercyRule !== null && rules.mercyInning !== null) {
    if (state.inning >= rules.mercyInning) {
      const lead = Math.abs(state.homeScore - state.awayScore);
      if (lead >= rules.mercyRule && state.outs === 0 && state.halfInning === 'top') {
        state.isGameOver = true;
      }
    }
  }
}

/** Advance from top → bottom, or bottom → next inning top */
function advanceHalfInning(state: DerivedGameState, rules: GameRules): void {
  state.outs = 0;
  state.bases = { ...EMPTY_BASES };
  state.count = { balls: 0, strikes: 0 };

  if (state.halfInning === 'top') {
    state.halfInning = 'bottom';

    // If home team is ahead after top of last inning, game over
    if (state.inning >= rules.innings && state.homeScore > state.awayScore) {
      state.isGameOver = true;
    }
  } else {
    // End of full inning
    if (state.inning >= rules.innings && state.awayScore !== state.homeScore) {
      state.isGameOver = true;
    } else {
      state.inning++;
      state.halfInning = 'top';
    }
  }
}

/** Calculate outs produced by an event */
function getOutsFromEvent(event: PlayEvent): number {
  switch (event.type) {
    case 'out':
      return event.outsRecorded;
    case 'strikeout':
      return 1;
    case 'caught_stealing':
      return 1;
    case 'dropped_third_strike':
      return event.safe ? 0 : 1;
    default: {
      // Count runner movements that result in outs
      return event.runnerMovements.filter(m => m.to === 'out').length;
    }
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
      return false;
    default:
      return false;
  }
}

/** Apply runner movements to the base state */
function applyRunnerMovements(bases: BaseState, event: PlayEvent): void {
  // First, clear bases for runners who moved
  for (const movement of event.runnerMovements) {
    if (movement.from === 'first') bases.first = null;
    if (movement.from === 'second') bases.second = null;
    if (movement.from === 'third') bases.third = null;
  }

  // Then, place runners at their destinations
  for (const movement of event.runnerMovements) {
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

// ─── Undo support ─────────────────────────────────────────

/**
 * Undo the last event: removes it from the event list and re-derives state.
 * Returns the new events array (immutable — original game is not mutated).
 */
export function undoLastEvent(game: Game): PlayEvent[] {
  if (game.events.length === 0) return [];
  return game.events.slice(0, -1);
}
