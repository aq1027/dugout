import type { Id, SportType, BaseState, Count, InningHalfType } from './common';
import type { Lineup } from './lineup';
import type { PlayEvent } from './play';

/** Top-level game record persisted to IndexedDB */
export interface Game {
  id: Id;
  /** Baseball or softball */
  sport: SportType;
  /** Game date in ISO format */
  date: string;
  location?: string;
  /** Regulation innings (9 for baseball, 7 for softball, or custom) */
  innings: number;

  /** Team references */
  awayTeamId: Id;
  homeTeamId: Id;
  awayTeamName: string;
  homeTeamName: string;

  /** Lineups */
  awayLineup: Lineup;
  homeLineup: Lineup;

  /** The complete event log (event-sourced) */
  events: PlayEvent[];

  /** Game status */
  status: 'setup' | 'in_progress' | 'final' | 'suspended';

  createdAt: string;
  updatedAt: string;

  /** Optional season reference */
  seasonId?: Id;

  /** Rule overrides */
  rules: GameRules;
}

export interface GameRules {
  innings: number;
  playersPerSide: number;
  useDH: boolean;
  /** Softball DP/FLEX rule */
  dpFlex: boolean;
  /** Mercy rule: lead required to end game early (null = no mercy) */
  mercyRule: number | null;
  /** Mercy inning: the inning after which mercy applies */
  mercyInning: number | null;
  /** Extra-inning auto-runner on 2B */
  extraInningAutoRunner: boolean;
  /** Continuous batting order — entire roster bats */
  everyoneBats: boolean;
  /** Max mound visits per team per game (null = unlimited) */
  moundVisitsPerGame: number | null;
  /** Max timeouts per team per game (null = unlimited) */
  timeoutsPerGame: number | null;
  /** Which league preset these rules are based on */
  preset?: string;
}

// ─── Derived game state (computed from events, never stored) ────

export interface DerivedGameState {
  /** Current inning (1-indexed) */
  inning: number;
  /** Top or bottom */
  halfInning: InningHalfType;
  /** Outs in current half-inning */
  outs: number;
  /** Current count */
  count: Count;
  /** Runners on base */
  bases: BaseState;
  /** Current batter index in the lineup (0-indexed) */
  awayBatterIndex: number;
  homeBatterIndex: number;
  /** Score */
  awayScore: number;
  homeScore: number;
  /** Hits */
  awayHits: number;
  homeHits: number;
  /** Errors */
  awayErrors: number;
  homeErrors: number;
  /** Is the game over? */
  isGameOver: boolean;
  /** Line score per inning */
  awayLineScore: number[];
  homeLineScore: number[];
  /** Mound visit counts */
  awayMoundVisits: number;
  homeMoundVisits: number;
  /** Timeout counts */
  awayTimeouts: number;
  homeTimeouts: number;
}
