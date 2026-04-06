import { useState } from 'react';
import type { PlayEvent, Pitch } from '../../models/play';
import type { Player } from '../../models/player';
import { displayPlayerName } from '../../models/player';
import type { Id } from '../../models/common';

interface GameLogProps {
  events: PlayEvent[];
  players: Map<Id, Player>;
}

function playerName(players: Map<Id, Player>, id: Id | null): string {
  if (!id) return '';
  const p = players.get(id);
  if (!p) return '??';
  return displayPlayerName(p);
}

function baseShort(b: string): string {
  switch (b) {
    case 'first': return '1B';
    case 'second': return '2B';
    case 'third': return '3B';
    case 'home': return 'home';
    default: return b;
  }
}

const DEFAULT_HIT_BASE: Record<string, string> = {
  single: 'first',
  double: 'second',
  triple: 'third',
  home_run: 'home',
};

/** Summarise notable runner movements (batter advancement beyond default, runners scoring) */
function runnerSuffix(e: PlayEvent, players: Map<Id, Player>): string {
  if (!('runnerMovements' in e) || e.runnerMovements.length === 0) return '';

  const parts: string[] = [];

  // Batter advancement beyond expected base (hits only)
  if (e.type === 'hit') {
    const batterMv = e.runnerMovements.find(m => m.from === 'batter');
    if (batterMv) {
      const expected = DEFAULT_HIT_BASE[e.hitType];
      if (batterMv.to !== expected && batterMv.to !== 'out') {
        parts.push(`to ${baseShort(batterMv.to)}`);
      }
    }
  }

  // Runners who scored (excluding batter on HR — already obvious)
  const scored = e.runnerMovements.filter(m =>
    m.to === 'home' && m.from !== 'batter'
  );
  if (scored.length > 0) {
    const names = scored.map(m => playerName(players, m.runnerId));
    parts.push(`${names.join(', ')} scored`);
  }

  return parts.length > 0 ? `; ${parts.join(', ')}` : '';
}

function describeEvent(e: PlayEvent, players: Map<Id, Player>): string {
  const batter = playerName(players, e.batterId);
  switch (e.type) {
    case 'hit': {
      const errorSuffix = e.error ? ` (E${e.error.fielderPosition})` : '';
      return `${batter} — ${e.hitType.replace('_', ' ')}${errorSuffix}${runnerSuffix(e, players)}`;
    }
    case 'out':
      return `${batter} — ${e.outType.replace('_', ' ')} (${e.notation})${runnerSuffix(e, players)}`;
    case 'strikeout':
      return e.looking ? `${batter} — ꓘ` : `${batter} — K`;
    case 'walk':
      return `${batter} — ${e.intentional ? 'IBB' : 'BB'}${runnerSuffix(e, players)}`;
    case 'hit_by_pitch':
      return `${batter} — HBP${runnerSuffix(e, players)}`;
    case 'error':
      return `${batter} — E${e.fielderPosition}${runnerSuffix(e, players)}`;
    case 'fielders_choice':
      return `${batter} — FC (${e.notation})${runnerSuffix(e, players)}`;
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
      return `${batter} — Dropped 3rd strike${e.safe ? ' (safe)' : ''}${runnerSuffix(e, players)}`;
    case 'mound_visit':
      return `Mound visit (#${e.visitNumber})`;
    case 'timeout':
      return `Timeout (${e.timeoutType})`;
    case 'pickoff_attempt':
      return `Pickoff attempt at ${e.base}${e.successful ? ' — OUT!' : ' — safe'}`;
  }
}

function describePitch(p: Pitch): string {
  if (p.overturned) {
    const original = pitchLabel(p.result);
    return `${original} (overturned)`;
  }
  return pitchLabel(p.result);
}

function pitchLabel(result: Pitch['result']): string {
  switch (result) {
    case 'ball': return 'Ball';
    case 'strike_swinging': return 'Strike (swinging)';
    case 'strike_looking': return 'Strike (looking)';
    case 'foul': return 'Foul';
    case 'in_play': return 'In play';
    case 'pitch_clock_ball': return '⏱ Clock violation (ball)';
    case 'pitch_clock_strike': return '⏱ Clock violation (strike)';
    default: return String(result);
  }
}

/** Whether this event type has a meaningful pitch sequence to show */
function hasAtBatPitches(e: PlayEvent): boolean {
  return e.pitchSequence.length > 0 && (
    e.type === 'hit' || e.type === 'out' || e.type === 'walk' ||
    e.type === 'strikeout' || e.type === 'hit_by_pitch' || e.type === 'error' ||
    e.type === 'fielders_choice' || e.type === 'dropped_third_strike'
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function inningLabel(inning: number, half: 'top' | 'bottom'): string {
  return `${half === 'top' ? '▲' : '▼'}${inning}`;
}

export function GameLog({ events, players }: GameLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No plays yet</p>;
  }

  return (
    <div className="game-log">
      {[...events].reverse().map(e => {
        const expandable = hasAtBatPitches(e);
        const isExpanded = expandedId === e.id;
        const halfClass = e.halfInning === 'top' ? 'log-entry--top' : 'log-entry--bottom';

        return (
          <div key={e.id} className={`log-entry ${halfClass}`}>
            <div
              className="log-entry-main"
              onClick={expandable ? () => setExpandedId(isExpanded ? null : e.id) : undefined}
              style={expandable ? { cursor: 'pointer' } : undefined}
            >
              <span className="log-time">{formatTime(e.timestamp)}</span>
              <span className="log-inning">{inningLabel(e.inning, e.halfInning)}</span>
              <span className="log-desc">
                {describeEvent(e, players)}
                {expandable && <span className="log-expand-hint">{isExpanded ? ' ▾' : ' ▸'}</span>}
              </span>
            </div>
            {isExpanded && (
              <div className="log-pitch-sequence">
                {e.pitchSequence.map((p, i) => {
                  const isLast = i === e.pitchSequence.length - 1;
                  const prefix = isLast ? '└' : '├';
                  return (
                    <div key={i} className="log-pitch-line">
                      <span className="log-pitch-prefix">{prefix}</span>
                      <span className="log-pitch-desc">{describePitch(p)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
