import type { Id, Base, PitchResult, PositionNumber } from './common';

// ─── Pitch ────────────────────────────────────────────────
export interface Pitch {
  result: PitchResult;
  /** True if this pitch call was overturned (e.g., ABS challenge) */
  overturned?: boolean;
}

// ─── Baserunner movement ──────────────────────────────────
export interface RunnerMovement {
  runnerId: Id;
  from: Base | 'batter';
  to: Base | 'out';
  /** How the runner was put out, if applicable */
  outBy?: string; // e.g. "6-4" for SS to 2B
}

// ─── Play Event (discriminated union) ─────────────────────
export type PlayEvent =
  | HitEvent
  | OutEvent
  | WalkEvent
  | StrikeoutEvent
  | HitByPitchEvent
  | ErrorEvent
  | FieldersChoiceEvent
  | StolenBaseEvent
  | CaughtStealingEvent
  | WildPitchEvent
  | PassedBallEvent
  | BalkEvent
  | SubstitutionEvent
  | DroppedThirdStrikeEvent
  | MoundVisitEvent
  | TimeoutEvent
  | PickoffAttemptEvent;

interface BasePlayEvent {
  id: Id;
  /** Timestamp of the event */
  timestamp: string;
  /** Inning number (1-indexed) */
  inning: number;
  /** 'top' or 'bottom' */
  halfInning: 'top' | 'bottom';
  /** Outs before this event */
  outsBefore: number;
  /** Batter ID (null for between-AB events) */
  batterId: Id | null;
  /** Pitch sequence for this at-bat up to this event */
  pitchSequence: Pitch[];
  /** Resulting baserunner movements */
  runnerMovements: RunnerMovement[];
}

export interface HitEvent extends BasePlayEvent {
  type: 'hit';
  hitType: 'single' | 'double' | 'triple' | 'home_run';
  /** Optional field location, e.g. "7" for LF line drive */
  fieldLocation?: string;
  /** Runs batted in */
  rbi: number;
  /** Error on the play (fielder committed error allowing extra advancement) */
  error?: { fielderPosition: PositionNumber; description?: string };
}

export interface OutEvent extends BasePlayEvent {
  type: 'out';
  outType: 'ground_out' | 'fly_out' | 'line_out' | 'popup' | 'double_play' | 'triple_play';
  /** Fielding notation, e.g. "6-4-3" */
  notation: string;
  /** How many outs recorded on this play */
  outsRecorded: number;
  /** Sacrifice fly or bunt */
  sacrifice?: 'fly' | 'bunt';
  rbi: number;
}

export interface WalkEvent extends BasePlayEvent {
  type: 'walk';
  intentional: boolean;
  rbi: number;
}

export interface StrikeoutEvent extends BasePlayEvent {
  type: 'strikeout';
  looking: boolean;
}

export interface HitByPitchEvent extends BasePlayEvent {
  type: 'hit_by_pitch';
  rbi: number;
}

export interface ErrorEvent extends BasePlayEvent {
  type: 'error';
  /** Fielder who committed the error */
  fielderPosition: PositionNumber;
  /** Base the batter reached */
  baseReached: Base;
  rbi: number;
}

export interface FieldersChoiceEvent extends BasePlayEvent {
  type: 'fielders_choice';
  notation: string;
  rbi: number;
}

export interface StolenBaseEvent extends BasePlayEvent {
  type: 'stolen_base';
  /** Which base was stolen */
  base: Base;
  runnerId: Id;
}

export interface CaughtStealingEvent extends BasePlayEvent {
  type: 'caught_stealing';
  base: Base;
  runnerId: Id;
  notation: string;
}

export interface WildPitchEvent extends BasePlayEvent {
  type: 'wild_pitch';
}

export interface PassedBallEvent extends BasePlayEvent {
  type: 'passed_ball';
}

export interface BalkEvent extends BasePlayEvent {
  type: 'balk';
}

export interface SubstitutionEvent extends BasePlayEvent {
  type: 'substitution';
  subType: 'pinch_hitter' | 'pinch_runner' | 'defensive' | 'pitching_change';
  outPlayerId: Id;
  inPlayerId: Id;
  position: PositionNumber;
  orderSlot: number;
}

export interface DroppedThirdStrikeEvent extends BasePlayEvent {
  type: 'dropped_third_strike';
  safe: boolean;
}

export interface MoundVisitEvent extends BasePlayEvent {
  type: 'mound_visit';
  teamId: Id;
  visitNumber: number;
}

export interface TimeoutEvent extends BasePlayEvent {
  type: 'timeout';
  teamId: Id;
  timeoutType: 'offensive' | 'defensive';
}

export interface PickoffAttemptEvent extends BasePlayEvent {
  type: 'pickoff_attempt';
  pitcherId: Id;
  runnerId: Id;
  base: Base;
  successful: boolean;
}

// ─── Plate Appearance (derived, not stored) ───────────────
export interface PlateAppearance {
  batterId: Id;
  pitchSequence: Pitch[];
  result: PlayEvent;
  rbi: number;
}

// ─── Inning Half (derived) ────────────────────────────────
export interface InningHalf {
  inning: number;
  half: 'top' | 'bottom';
  events: PlayEvent[];
  runs: number;
  hits: number;
  errors: number;
  leftOnBase: number;
}
