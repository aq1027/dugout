import { db } from './index';
import type { Game } from '../models/game';
import type { Team } from '../models/team';
import type { Player } from '../models/player';

// ─── Export format ────────────────────────────────────────

export interface DugoutExport {
  version: 1;
  exportedAt: string;
  games: Game[];
  teams: Team[];
  players: Player[];
}

// ─── Export ───────────────────────────────────────────────

export async function exportAllData(): Promise<DugoutExport> {
  const [games, teams, players] = await Promise.all([
    db.games.toArray(),
    db.teams.toArray(),
    db.players.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    games,
    teams,
    players,
  };
}

export async function exportGame(gameId: string): Promise<DugoutExport> {
  const game = await db.games.get(gameId);
  if (!game) throw new Error(`Game ${gameId} not found`);

  const teamIds = [game.awayTeamId, game.homeTeamId];
  const teams = await db.teams.where('id').anyOf(teamIds).toArray();
  const players = await db.players.where('teamId').anyOf(teamIds).toArray();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    games: [game],
    teams,
    players,
  };
}

export function downloadJson(data: DugoutExport, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import ───────────────────────────────────────────────

export async function importData(json: string): Promise<{ games: number; teams: number; players: number }> {
  const data: DugoutExport = JSON.parse(json);

  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  // Use bulkPut to upsert (overwrite existing records with same ID)
  await db.transaction('rw', [db.teams, db.players, db.games], async () => {
    if (data.teams?.length) await db.teams.bulkPut(data.teams);
    if (data.players?.length) await db.players.bulkPut(data.players);
    if (data.games?.length) await db.games.bulkPut(data.games);
  });

  return {
    games: data.games?.length ?? 0,
    teams: data.teams?.length ?? 0,
    players: data.players?.length ?? 0,
  };
}

export async function importFile(file: File): Promise<{ games: number; teams: number; players: number }> {
  const text = await file.text();
  return importData(text);
}
