import type { Id, PositionNumber } from './common';

export interface Player {
  id: Id;
  firstName: string;
  lastName: string;
  number?: number;
  positions: PositionNumber[];
  /** ID of the team this player belongs to */
  teamId: Id;
}
