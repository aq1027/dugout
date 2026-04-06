import type { Id, PositionNumber } from './common';

export interface Player {
  id: Id;
  firstName?: string;
  lastName?: string;
  number?: number;
  positions: PositionNumber[];
  /** ID of the team this player belongs to */
  teamId: Id;
}

/** Display name for a player: "#42 John Smith", "#42", or "John Smith" */
export function displayPlayerName(player: Player): string {
  const num = player.number != null ? `#${player.number}` : '';
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ');
  return [num, name].filter(Boolean).join(' ') || 'Unknown';
}
