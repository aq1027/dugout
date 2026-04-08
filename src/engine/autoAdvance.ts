/**
 * Auto-advance defaults module.
 *
 * Implements the smart-defaults matrix from docs/common-scenarios.md §16.
 * Every runner gets a pre-filled destination + confidence level; the UI
 * shows the defaults pre-selected and lets the user override any of them.
 */
import type { Id, Base } from '../models/common';
import type { BaseState } from '../models/common';

// ─── Public types ───────────────────────────────

export type Confidence = 'deterministic' | 'high' | 'medium';

export interface RunnerDefault {
  runnerId: Id;
  from: Base | 'batter';
  to: Base | 'out' | null;   // null = no default, user must decide
  confidence: Confidence;
}

export type AutoAdvanceOutcome =
  | { kind: 'hit'; hitType: 'single' | 'double' | 'triple' | 'home_run' }
  | { kind: 'out'; outType: string; sacrifice?: 'fly' | 'bunt' }
  | { kind: 'fielders_choice' }
  | { kind: 'error' }
  | { kind: 'dropped_third_strike' }
  | { kind: 'wild_pitch' }
  | { kind: 'passed_ball' }
  | { kind: 'balk' };

// ─── Main function ──────────────────────────────

/**
 * Return pre-filled runner destinations for the given outcome.
 *
 * @param outcome  The play outcome type
 * @param bases    Current base occupancy
 * @param outs     Outs before this play
 * @param batterId Player ID of the current batter (omit for non-AB events like WP/PB/balk)
 */
export function getDefaultRunnerStates(
  outcome: AutoAdvanceOutcome,
  bases: BaseState,
  outs: number,
  batterId?: Id,
): RunnerDefault[] {
  const runners: RunnerDefault[] = [];

  // Build runner list: 3B → 2B → 1B → batter (front-to-back order)
  if (bases.third) runners.push({ runnerId: bases.third, from: 'third', to: null, confidence: 'medium' });
  if (bases.second) runners.push({ runnerId: bases.second, from: 'second', to: null, confidence: 'medium' });
  if (bases.first) runners.push({ runnerId: bases.first, from: 'first', to: null, confidence: 'medium' });
  if (batterId != null) runners.push({ runnerId: batterId, from: 'batter', to: null, confidence: 'medium' });

  switch (outcome.kind) {
    case 'hit':
      applyHitDefaults(runners, outcome.hitType, bases);
      break;
    case 'out':
      applyOutDefaults(runners, outcome.outType, outcome.sacrifice, bases, outs);
      break;
    case 'fielders_choice':
      applyFCDefaults(runners, bases);
      break;
    case 'error':
      applyErrorDefaults(runners);
      break;
    case 'dropped_third_strike':
      applyDroppedKDefaults(runners);
      break;
    case 'wild_pitch':
    case 'passed_ball':
      applyWPPBDefaults(runners);
      break;
    case 'balk':
      applyBalkDefaults(runners);
      break;
  }

  return runners;
}

// ─── Hit defaults ───────────────────────────────

function applyHitDefaults(
  runners: RunnerDefault[],
  hitType: 'single' | 'double' | 'triple' | 'home_run',
  bases: BaseState,
): void {
  const batter = find(runners, 'batter');

  switch (hitType) {
    case 'home_run':
      for (const r of runners) { r.to = 'home'; r.confidence = 'deterministic'; }
      return;

    case 'triple':
      if (batter) { batter.to = 'third'; batter.confidence = 'deterministic'; }
      for (const r of runners) {
        if (r.from !== 'batter') { r.to = 'home'; r.confidence = 'high'; }
      }
      return;

    case 'double':
      if (batter) { batter.to = 'second'; batter.confidence = 'deterministic'; }
      for (const r of runners) {
        if (r.from === 'first') { r.to = 'third'; r.confidence = 'high'; }
        else if (r.from === 'second') { r.to = 'home'; r.confidence = 'high'; }
        else if (r.from === 'third') { r.to = 'home'; r.confidence = 'high'; }
      }
      return;

    case 'single':
      if (batter) { batter.to = 'first'; batter.confidence = 'deterministic'; }
      // Force chain: if 1B occupied, 1B→2B is forced (deterministic)
      if (bases.first) {
        const on1 = find(runners, 'first');
        if (on1) { on1.to = 'second'; on1.confidence = 'deterministic'; }

        if (bases.second) {
          const on2 = find(runners, 'second');
          if (on2) { on2.to = 'third'; on2.confidence = 'deterministic'; }

          if (bases.third) {
            const on3 = find(runners, 'third');
            if (on3) { on3.to = 'home'; on3.confidence = 'deterministic'; }
          }
        }
      }
      // Non-forced runners get high-likelihood defaults
      if (!bases.first) {
        // 2B not forced
        const on2 = find(runners, 'second');
        if (on2 && on2.to === null) { on2.to = 'third'; on2.confidence = 'high'; }
      }
      if (!bases.first || !bases.second) {
        // 3B not forced (unless bases loaded, handled above)
        const on3 = find(runners, 'third');
        if (on3 && on3.to === null) { on3.to = 'home'; on3.confidence = 'high'; }
      }
      return;
  }
}

// ─── Out defaults ───────────────────────────────

function applyOutDefaults(
  runners: RunnerDefault[],
  outType: string,
  sacrifice: 'fly' | 'bunt' | undefined,
  bases: BaseState,
  outs: number,
): void {
  const batter = find(runners, 'batter');

  // Sac fly: batter out (deterministic), lead runner scores (high), others stay
  if (sacrifice === 'fly') {
    if (batter) { batter.to = 'out'; batter.confidence = 'deterministic'; }
    const on3 = find(runners, 'third');
    if (on3 && outs < 2) { on3.to = 'home'; on3.confidence = 'high'; }
    // Other runners default to stay
    for (const r of runners) {
      if (r.to === null && r.from !== 'batter') { r.to = r.from; r.confidence = 'high'; }
    }
    return;
  }

  // Sac bunt: batter out, forced runners advance one
  if (sacrifice === 'bunt') {
    if (batter) { batter.to = 'out'; batter.confidence = 'deterministic'; }
    // Advance the lead forced runner(s) one base
    if (bases.first) {
      const on1 = find(runners, 'first');
      if (on1) { on1.to = 'second'; on1.confidence = 'high'; }
    }
    if (bases.second) {
      const on2 = find(runners, 'second');
      if (on2) { on2.to = 'third'; on2.confidence = 'high'; }
    }
    if (bases.third) {
      const on3 = find(runners, 'third');
      if (on3 && on3.to === null) { on3.to = 'home'; on3.confidence = 'medium'; }
    }
    // Remaining runners stay
    for (const r of runners) {
      if (r.to === null && r.from !== 'batter') { r.to = r.from; r.confidence = 'high'; }
    }
    return;
  }

  // Regular out: batter is out
  if (batter) { batter.to = 'out'; batter.confidence = 'deterministic'; }

  // Fly out / popup / line out: runners generally stay
  if (outType === 'fly_out' || outType === 'popup' || outType === 'line_out') {
    // Tag up: runner on 3B with < 2 outs may tag and score
    if (outType === 'fly_out' && outs < 2) {
      const on3 = find(runners, 'third');
      if (on3) { on3.to = 'home'; on3.confidence = 'medium'; }
    }
    // Others stay
    for (const r of runners) {
      if (r.to === null && r.from !== 'batter') { r.to = r.from; r.confidence = 'high'; }
    }
    return;
  }

  // Ground out: runners may advance
  if (outType === 'ground_out') {
    // Runner on 3B with < 2 outs: stays (generally doesn't risk on ground out)
    const on3 = find(runners, 'third');
    if (on3) { on3.to = 'third'; on3.confidence = 'high'; }

    // Runner on 2B: advances to 3B (medium)
    const on2 = find(runners, 'second');
    if (on2) { on2.to = 'third'; on2.confidence = 'medium'; }

    // Runner on 1B: advances to 2B (medium — could be DP)
    const on1 = find(runners, 'first');
    if (on1) { on1.to = 'second'; on1.confidence = 'medium'; }

    return;
  }

  // Default for any other out type: runners stay
  for (const r of runners) {
    if (r.to === null && r.from !== 'batter') { r.to = r.from; r.confidence = 'medium'; }
  }
}

// ─── Fielder's choice defaults ──────────────────

function applyFCDefaults(runners: RunnerDefault[], bases: BaseState): void {
  const batter = find(runners, 'batter');
  if (batter) { batter.to = 'first'; batter.confidence = 'high'; }

  // Lead forced runner is out
  if (bases.first) {
    const on1 = find(runners, 'first');
    if (on1) { on1.to = 'out'; on1.confidence = 'high'; }
  }
  // Other runners stay
  for (const r of runners) {
    if (r.to === null && r.from !== 'batter') { r.to = r.from; r.confidence = 'medium'; }
  }
}

// ─── Error defaults ─────────────────────────────

function applyErrorDefaults(runners: RunnerDefault[]): void {
  const batter = find(runners, 'batter');
  if (batter) { batter.to = 'first'; batter.confidence = 'high'; }
  // Runners: unclear without context, leave unresolved so user decides
}

// ─── Dropped third strike defaults ──────────────

function applyDroppedKDefaults(_runners: RunnerDefault[]): void {
  // Batter may be safe or out — unclear, leave for user
}

// ─── WP / PB defaults ──────────────────────────

function applyWPPBDefaults(runners: RunnerDefault[]): void {
  for (const r of runners) {
    if (r.from === 'batter') continue;
    const next = nextBase(r.from);
    if (next) { r.to = next; r.confidence = 'high'; }
  }
}

// ─── Balk defaults ──────────────────────────────

function applyBalkDefaults(runners: RunnerDefault[]): void {
  for (const r of runners) {
    if (r.from === 'batter') continue;
    const next = nextBase(r.from);
    if (next) { r.to = next; r.confidence = 'deterministic'; }
  }
}

// ─── Helpers ────────────────────────────────────

function find(runners: RunnerDefault[], from: Base | 'batter'): RunnerDefault | undefined {
  return runners.find(r => r.from === from);
}

function nextBase(from: Base | 'batter'): Base | null {
  switch (from) {
    case 'first': return 'second';
    case 'second': return 'third';
    case 'third': return 'home';
    default: return null;
  }
}
