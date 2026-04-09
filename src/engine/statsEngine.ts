import type { PlayEvent } from '../models/play';
import type { Id } from '../models/common';

// ─── Batting stats ────────────────────────────────────────

export interface BattingStats {
  playerId: Id;
  pa: number;   // plate appearances
  ab: number;   // at-bats
  h: number;    // hits
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;   // walks
  so: number;   // strikeouts
  hbp: number;
  sf: number;   // sacrifice flies
  sh: number;   // sacrifice bunts
  sb: number;
  cs: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
}

// ─── Pitching stats ───────────────────────────────────────

export interface PitchingStats {
  playerId: Id;
  ip: number;      // innings pitched (as a decimal, e.g. 6.1 = 6 and 1/3)
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  pitchCount: number;
  era: number;
  whip: number;
}

// ─── Computation (Phase 5 — stubs for now) ────────────────

export function computeBattingStats(events: PlayEvent[], playerId: Id): BattingStats {
  const stats: BattingStats = {
    playerId,
    pa: 0, ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0,
    rbi: 0, bb: 0, so: 0, hbp: 0, sf: 0, sh: 0, sb: 0, cs: 0,
    avg: 0, obp: 0, slg: 0, ops: 0,
  };

  for (const event of events) {
    if (event.batterId !== playerId) {
      // Check for SB/CS even if not the batter
      if (event.type === 'stolen_base' && event.runnerId === playerId) stats.sb++;
      if (event.type === 'caught_stealing' && event.runnerId === playerId) stats.cs++;
      continue;
    }

    // Plate appearance events
    if (!isAtBatEvent(event)) continue;

    stats.pa++;

    switch (event.type) {
      case 'hit':
        stats.ab++;
        stats.h++;
        stats.rbi += event.rbi;
        switch (event.hitType) {
          case 'single': stats.singles++; break;
          case 'double': stats.doubles++; break;
          case 'triple': stats.triples++; break;
          case 'home_run': stats.hr++; break;
        }
        break;
      case 'out':
        if (event.sacrifice === 'fly') {
          stats.sf++;
        } else if (event.sacrifice === 'bunt') {
          stats.sh++;
        } else {
          stats.ab++;
        }
        stats.rbi += event.rbi;
        break;
      case 'error':
        stats.ab++;
        stats.rbi += event.rbi;
        break;
      case 'fielders_choice':
        stats.ab++;
        stats.rbi += event.rbi;
        break;
      case 'strikeout':
        stats.ab++;
        stats.so++;
        break;
      case 'walk':
        stats.bb++;
        stats.rbi += event.rbi;
        break;
      case 'hit_by_pitch':
        stats.hbp++;
        stats.rbi += event.rbi;
        break;
      case 'dropped_third_strike':
        stats.ab++;
        if (!event.safe) stats.so++;
        break;
    }
  }

  // Compute rate stats
  stats.avg = stats.ab > 0 ? stats.h / stats.ab : 0;
  const obpDenom = stats.ab + stats.bb + stats.hbp + stats.sf;
  stats.obp = obpDenom > 0 ? (stats.h + stats.bb + stats.hbp) / obpDenom : 0;
  const totalBases = stats.singles + stats.doubles * 2 + stats.triples * 3 + stats.hr * 4;
  stats.slg = stats.ab > 0 ? totalBases / stats.ab : 0;
  stats.ops = stats.obp + stats.slg;

  return stats;
}

function isAtBatEvent(event: PlayEvent): boolean {
  switch (event.type) {
    case 'hit':
    case 'out':
    case 'walk':
    case 'strikeout':
    case 'hit_by_pitch':
    case 'error':
    case 'fielders_choice':
    case 'dropped_third_strike':
      return true;
    default:
      return false;
  }
}

/**
 * Placeholder for pitching stats — will be fully implemented in Phase 5.
 * Needs pitcher tracking per at-bat which requires lineup + substitution context.
 */
export function computePitchingStats(
  _events: PlayEvent[],
  playerId: Id,
): PitchingStats {
  return {
    playerId,
    ip: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, pitchCount: 0,
    era: 0, whip: 0,
  };
}
