import type { PlayEvent } from '../../models/play';
import type { Player } from '../../models/player';
import type { Id } from '../../models/common';

interface GameLogProps {
  events: PlayEvent[];
  players: Map<Id, Player>;
}

function playerName(players: Map<Id, Player>, id: Id | null): string {
  if (!id) return '';
  const p = players.get(id);
  if (!p) return '??';
  return p.lastName || p.firstName || '??';
}

function describeEvent(e: PlayEvent, players: Map<Id, Player>): string {
  const batter = playerName(players, e.batterId);
  switch (e.type) {
    case 'hit':
      return `${batter} — ${e.hitType.replace('_', ' ')}`;
    case 'out':
      return `${batter} — ${e.outType.replace('_', ' ')} (${e.notation})`;
    case 'strikeout':
      return `${batter} — ${e.looking ? 'Ꝁ' : 'K'}`;
    case 'walk':
      return `${batter} — ${e.intentional ? 'IBB' : 'BB'}`;
    case 'hit_by_pitch':
      return `${batter} — HBP`;
    case 'error':
      return `${batter} — E${e.fielderPosition}`;
    case 'fielders_choice':
      return `${batter} — FC (${e.notation})`;
    case 'stolen_base':
      return `${playerName(players, e.runnerId)} — SB ${e.base}`;
    case 'caught_stealing':
      return `${playerName(players, e.runnerId)} — CS ${e.base}`;
    case 'wild_pitch':
      return 'Wild pitch';
    case 'passed_ball':
      return 'Passed ball';
    case 'balk':
      return 'Balk';
    case 'substitution': {
      const label = e.subType === 'pitching_change' ? 'Pitching change'
        : e.subType === 'pinch_hitter' ? 'PH'
        : e.subType === 'pinch_runner' ? 'PR'
        : 'Sub';
      return `${label}: ${playerName(players, e.inPlayerId)} for ${playerName(players, e.outPlayerId)}`;
    }
    case 'dropped_third_strike':
      return `${batter} — Dropped 3rd strike${e.safe ? ' (safe)' : ''}`;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function inningLabel(inning: number, half: 'top' | 'bottom'): string {
  return `${half === 'top' ? '▲' : '▼'}${inning}`;
}

export function GameLog({ events, players }: GameLogProps) {
  if (events.length === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No plays yet</p>;
  }

  return (
    <div className="game-log">
      {[...events].reverse().map(e => (
        <div key={e.id} className="log-entry">
          <span className="log-time">{formatTime(e.timestamp)}</span>
          <span className="log-inning">{inningLabel(e.inning, e.halfInning)}</span>
          <span className="log-desc">{describeEvent(e, players)}</span>
        </div>
      ))}
    </div>
  );
}
