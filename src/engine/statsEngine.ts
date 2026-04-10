import type { PlayEvent } from '../models/play';
import type { Id } from '../models/common';
import type { BaseState } from '../models/common';
import { EMPTY_BASES } from '../models/common';

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

// ─── Situational stats ───────────────────────────────────

export interface SituationalBattingStats extends BattingStats {
  /** At-bats with runners in scoring position (2B/3B) */
  abRisp: number;
  /** Hits with RISP */
  hRisp: number;
  /** AVG with RISP */
  avgRisp: number;
  /** RBIs with 2 outs */
  twoOutRbi: number;
  /** Runners left on base when this batter makes an out */
  lob: number;
}

/**
 * Compute situational batting stats by replaying events to track base state.
 * Must receive ALL events for the game (not filtered by player).
 */
export function computeSituationalBattingStats(
  events: PlayEvent[],
  playerId: Id,
): SituationalBattingStats {
  const base = computeBattingStats(events, playerId);
  let abRisp = 0;
  let hRisp = 0;
  let twoOutRbi = 0;
  let lob = 0;

  // Replay events to track base state at each PA
  let bases: BaseState = { ...EMPTY_BASES };
  let outs = 0;
  let currentInning = 1;
  let currentHalf: 'top' | 'bottom' = 'top';

  for (const event of events) {
    // Detect half-inning change
    if (event.inning !== currentInning || event.halfInning !== currentHalf) {
      currentInning = event.inning;
      currentHalf = event.halfInning;
      bases = { ...EMPTY_BASES };
      outs = 0;
    }

    // Sync outs from event
    outs = event.outsBefore;

    const risp = bases.second !== null || bases.third !== null;

    if (event.batterId === playerId && isAtBatEvent(event)) {
      // RISP tracking
      if (risp) {
        // Count AB with RISP (same logic as regular AB)
        const isAb = event.type !== 'walk' && event.type !== 'hit_by_pitch'
          && !(event.type === 'out' && (event.sacrifice === 'fly' || event.sacrifice === 'bunt'));
        if (isAb) {
          abRisp++;
          if (event.type === 'hit') hRisp++;
        }
      }

      // 2-out RBI
      if (outs === 2 && 'rbi' in event) {
        twoOutRbi += (event as { rbi: number }).rbi;
      }

      // LOB: count runners still on base after this batter makes an out
      const isOut = event.type === 'out' || event.type === 'strikeout'
        || event.type === 'fielders_choice'
        || (event.type === 'dropped_third_strike' && !event.safe);
      if (isOut) {
        // Apply movements to a temp copy to get post-event base state
        const tempBases = { ...bases };
        applyMovements(tempBases, event);
        lob += countOnBase(tempBases);
      }
    }

    // Apply runner movements to keep base state current
    applyMovements(bases, event);

    // Update outs after event
    outs = event.outsBefore + getOutsFromEvent(event);
    if (outs >= 3) {
      bases = { ...EMPTY_BASES };
      outs = 0;
    }
  }

  return {
    ...base,
    abRisp,
    hRisp,
    avgRisp: abRisp > 0 ? hRisp / abRisp : 0,
    twoOutRbi,
    lob,
  };
}

function applyMovements(bases: BaseState, event: PlayEvent): void {
  for (const m of event.runnerMovements) {
    if (m.from === 'first') bases.first = null;
    if (m.from === 'second') bases.second = null;
    if (m.from === 'third') bases.third = null;
  }
  for (const m of event.runnerMovements) {
    if (m.to === 'first') bases.first = m.runnerId;
    if (m.to === 'second') bases.second = m.runnerId;
    if (m.to === 'third') bases.third = m.runnerId;
  }
}

function countOnBase(bases: BaseState): number {
  return (bases.first ? 1 : 0) + (bases.second ? 1 : 0) + (bases.third ? 1 : 0);
}

function getOutsFromEvent(event: PlayEvent): number {
  switch (event.type) {
    case 'out': return event.outsRecorded;
    case 'strikeout': return 1;
    case 'caught_stealing': return 1;
    case 'pickoff_attempt': return event.successful ? 1 : 0;
    case 'dropped_third_strike': return event.safe ? 0 : 1;
    default: return event.runnerMovements.filter(m => m.to === 'out').length;
  }
}
