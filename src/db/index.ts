import Dexie, { type EntityTable } from 'dexie';
import type { Game } from '../models/game';
import type { Team } from '../models/team';
import type { Player } from '../models/player';
import type { Season } from '../models/team';

class DugoutDB extends Dexie {
  games!: EntityTable<Game, 'id'>;
  teams!: EntityTable<Team, 'id'>;
  players!: EntityTable<Player, 'id'>;
  seasons!: EntityTable<Season, 'id'>;

  constructor() {
    super('dugout');

    this.version(1).stores({
      games: 'id, date, status, awayTeamId, homeTeamId, seasonId',
      teams: 'id, name',
      players: 'id, teamId, lastName',
      seasons: 'id, name',
    });
  }
}

export const db = new DugoutDB();
