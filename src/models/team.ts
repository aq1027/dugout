import type { Id } from './common';

export interface Team {
  id: Id;
  name: string;
  shortName?: string;
  /** Player IDs in the roster */
  playerIds: Id[];
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: Id;
  name: string;
  sport: 'baseball' | 'softball';
  teamIds: Id[];
  gameIds: Id[];
  createdAt: string;
}
