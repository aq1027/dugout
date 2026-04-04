import type { Id, PositionNumber } from './common';

/** A single slot in the batting order */
export interface LineupSlot {
  playerId: Id;
  position: PositionNumber;
}

/** Substitution event recorded in the lineup history */
export interface Substitution {
  /** Inning when the sub happened */
  inning: number;
  /** Number of outs when the sub happened */
  outs: number;
  /** Player leaving */
  outPlayerId: Id;
  /** Player entering */
  inPlayerId: Id;
  /** Batting order slot (0-indexed) */
  orderSlot: number;
  /** New defensive position */
  position: PositionNumber;
  type: 'pinch_hitter' | 'pinch_runner' | 'defensive' | 'pitching_change';
}

/** Complete lineup state for one team in one game */
export interface Lineup {
  /** Starting batting order */
  startingOrder: LineupSlot[];
  /** All substitutions in chronological order */
  substitutions: Substitution[];
  /** Whether a DH is used */
  useDH: boolean;
}
