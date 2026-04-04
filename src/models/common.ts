/** Unique identifier type (nanoid or crypto.randomUUID) */
export type Id = string;

/** Sport type determines rule presets */
export type SportType = 'baseball' | 'softball';

/** Defensive position numbers (1-10) */
export type PositionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Position labels by number */
export const POSITION_LABELS: Record<PositionNumber, string> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
  10: 'DH',
};

/** Which half of the inning */
export type InningHalfType = 'top' | 'bottom';

/** Base identifiers */
export type Base = 'first' | 'second' | 'third' | 'home';

/** Pitch result for pitch-by-pitch tracking */
export type PitchResult =
  | 'ball'
  | 'strike_swinging'
  | 'strike_looking'
  | 'foul'
  | 'in_play';

/** Count state */
export interface Count {
  balls: number;
  strikes: number;
}

/** Base state — who is on each base (player IDs or null) */
export interface BaseState {
  first: Id | null;
  second: Id | null;
  third: Id | null;
}

export const EMPTY_BASES: BaseState = {
  first: null,
  second: null,
  third: null,
};
