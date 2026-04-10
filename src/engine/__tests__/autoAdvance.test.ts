/**
 * Tests for src/engine/autoAdvance.ts
 *
 * Verifies every row in the smart-defaults matrix (§16 of common-scenarios.md).
 */
import { describe, it, expect } from 'vitest';
import { getDefaultRunnerStates } from '../autoAdvance';
import type { RunnerDefault, AutoAdvanceOutcome } from '../autoAdvance';

// Shorthand IDs
const B = 'batter-1';
const R1 = 'runner-1b';
const R2 = 'runner-2b';
const R3 = 'runner-3b';

/** Find runner by `from` position */
function r(runners: RunnerDefault[], from: string) {
  return runners.find(r => r.from === from);
}

// ─── Hits: Single ───────────────────────────────

describe('Auto-advance: Single', () => {
  const single: AutoAdvanceOutcome = { kind: 'hit', hitType: 'single' };

  it('empty bases — batter to 1B (deterministic)', () => {
    const res = getDefaultRunnerStates(single, { first: null, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'first', confidence: 'deterministic' });
    expect(res).toHaveLength(1);
  });

  it('runner on 1B — forced to 2B (deterministic)', () => {
    const res = getDefaultRunnerStates(single, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'deterministic' });
    expect(r(res, 'batter')).toMatchObject({ to: 'first', confidence: 'deterministic' });
  });

  it('runner on 2B (no 1B) — 2B→3B (high)', () => {
    const res = getDefaultRunnerStates(single, { first: null, second: R2, third: null }, 0, B);
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'high' });
  });

  it('runner on 3B (no 1B) — 3B→Home (high)', () => {
    const res = getDefaultRunnerStates(single, { first: null, second: null, third: R3 }, 0, B);
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('runners on 1B+2B — force chain: 1B→2B (det), 2B→3B (det)', () => {
    const res = getDefaultRunnerStates(single, { first: R1, second: R2, third: null }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'deterministic' });
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'deterministic' });
  });

  it('runners on 1B+3B — 1B→2B (det), 3B→Home (high, not forced)', () => {
    const res = getDefaultRunnerStates(single, { first: R1, second: null, third: R3 }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'deterministic' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('runners on 2B+3B (no 1B) — 2B→3B (high), 3B→Home (high)', () => {
    const res = getDefaultRunnerStates(single, { first: null, second: R2, third: R3 }, 0, B);
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'high' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('bases loaded — full force chain: all deterministic', () => {
    const res = getDefaultRunnerStates(single, { first: R1, second: R2, third: R3 }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'deterministic' });
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'deterministic' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'deterministic' });
    expect(r(res, 'batter')).toMatchObject({ to: 'first', confidence: 'deterministic' });
  });
});

// ─── Hits: Double ───────────────────────────────

describe('Auto-advance: Double', () => {
  const double_: AutoAdvanceOutcome = { kind: 'hit', hitType: 'double' };

  it('empty bases — batter to 2B (deterministic)', () => {
    const res = getDefaultRunnerStates(double_, { first: null, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'second', confidence: 'deterministic' });
  });

  it('runner on 1B — 1B→3B (high)', () => {
    const res = getDefaultRunnerStates(double_, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'third', confidence: 'high' });
  });

  it('runner on 2B — 2B→Home (high)', () => {
    const res = getDefaultRunnerStates(double_, { first: null, second: R2, third: null }, 0, B);
    expect(r(res, 'second')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('runner on 3B — 3B→Home (high)', () => {
    const res = getDefaultRunnerStates(double_, { first: null, second: null, third: R3 }, 0, B);
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('bases loaded — 2B+3B score, 1B→3B', () => {
    const res = getDefaultRunnerStates(double_, { first: R1, second: R2, third: R3 }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'third', confidence: 'high' });
    expect(r(res, 'second')).toMatchObject({ to: 'home', confidence: 'high' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });
});

// ─── Hits: Triple ───────────────────────────────

describe('Auto-advance: Triple', () => {
  const triple: AutoAdvanceOutcome = { kind: 'hit', hitType: 'triple' };

  it('empty bases — batter to 3B', () => {
    const res = getDefaultRunnerStates(triple, { first: null, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'third', confidence: 'deterministic' });
  });

  it('all runners score (high)', () => {
    const res = getDefaultRunnerStates(triple, { first: R1, second: R2, third: R3 }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'home', confidence: 'high' });
    expect(r(res, 'second')).toMatchObject({ to: 'home', confidence: 'high' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });
});

// ─── Hits: Home Run ─────────────────────────────

describe('Auto-advance: Home Run', () => {
  it('everyone scores (deterministic)', () => {
    const hr: AutoAdvanceOutcome = { kind: 'hit', hitType: 'home_run' };
    const res = getDefaultRunnerStates(hr, { first: R1, second: R2, third: R3 }, 0, B);
    for (const runner of res) {
      expect(runner.to).toBe('home');
      expect(runner.confidence).toBe('deterministic');
    }
  });
});

// ─── Outs: Ground out ───────────────────────────

describe('Auto-advance: Ground Out', () => {
  const go: AutoAdvanceOutcome = { kind: 'out', outType: 'ground_out' };

  it('no runners — batter out', () => {
    const res = getDefaultRunnerStates(go, { first: null, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'out', confidence: 'deterministic' });
  });

  it('runner on 1B — 1B→2B (medium), batter out', () => {
    const res = getDefaultRunnerStates(go, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'out', confidence: 'deterministic' });
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'medium' });
  });

  it('runner on 2B — 2B→3B (medium)', () => {
    const res = getDefaultRunnerStates(go, { first: null, second: R2, third: null }, 0, B);
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'medium' });
  });

  it('runner on 3B — stays (high)', () => {
    const res = getDefaultRunnerStates(go, { first: null, second: null, third: R3 }, 0, B);
    expect(r(res, 'third')).toMatchObject({ to: 'third', confidence: 'high' });
  });
});

// ─── Outs: Fly out ──────────────────────────────

describe('Auto-advance: Fly Out', () => {
  const fo: AutoAdvanceOutcome = { kind: 'out', outType: 'fly_out' };

  it('no runners — batter out', () => {
    const res = getDefaultRunnerStates(fo, { first: null, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'out' });
  });

  it('runner on 3B, 0 outs — 3B→Home (medium, tag-up)', () => {
    const res = getDefaultRunnerStates(fo, { first: null, second: null, third: R3 }, 0, B);
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'medium' });
  });

  it('runner on 3B, 2 outs — stays (no tag-up with 2 outs = 3rd out)', () => {
    const res = getDefaultRunnerStates(fo, { first: null, second: null, third: R3 }, 2, B);
    expect(r(res, 'third')).toMatchObject({ to: 'third', confidence: 'high' });
  });

  it('runner on 1B, 0 outs — stays', () => {
    const res = getDefaultRunnerStates(fo, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'first', confidence: 'high' });
  });

  it('runners 2B+3B, 0 outs — 3B tags (medium), 2B stays (high)', () => {
    const res = getDefaultRunnerStates(fo, { first: null, second: R2, third: R3 }, 0, B);
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'medium' });
    expect(r(res, 'second')).toMatchObject({ to: 'second', confidence: 'high' });
  });
});

// ─── Outs: Sac Fly ──────────────────────────────

describe('Auto-advance: Sac Fly', () => {
  const sf: AutoAdvanceOutcome = { kind: 'out', outType: 'fly_out', sacrifice: 'fly' };

  it('runner on 3B — batter out (det), 3B→Home (high)', () => {
    const res = getDefaultRunnerStates(sf, { first: null, second: null, third: R3 }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'out', confidence: 'deterministic' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('runners 2B+3B — 3B scores, 2B stays', () => {
    const res = getDefaultRunnerStates(sf, { first: null, second: R2, third: R3 }, 0, B);
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
    expect(r(res, 'second')).toMatchObject({ to: 'second', confidence: 'high' });
  });

  it('bases loaded — 3B scores, others stay', () => {
    const res = getDefaultRunnerStates(sf, { first: R1, second: R2, third: R3 }, 1, B);
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
    expect(r(res, 'second')).toMatchObject({ to: 'second', confidence: 'high' });
    expect(r(res, 'first')).toMatchObject({ to: 'first', confidence: 'high' });
  });

  it('2 outs — no sac fly tag up (3B stays)', () => {
    const res = getDefaultRunnerStates(sf, { first: null, second: null, third: R3 }, 2, B);
    expect(r(res, 'third')).toMatchObject({ to: 'third', confidence: 'high' });
  });
});

// ─── Outs: Sac Bunt ────────────────────────────

describe('Auto-advance: Sac Bunt', () => {
  const sb: AutoAdvanceOutcome = { kind: 'out', outType: 'ground_out', sacrifice: 'bunt' };

  it('runner on 1B — batter out, 1B→2B', () => {
    const res = getDefaultRunnerStates(sb, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'out', confidence: 'deterministic' });
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'high' });
  });

  it('runners 1B+2B — both advance', () => {
    const res = getDefaultRunnerStates(sb, { first: R1, second: R2, third: null }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'high' });
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'high' });
  });
});

// ─── Fielder's Choice ───────────────────────────

describe('Auto-advance: Fielder\'s Choice', () => {
  const fc: AutoAdvanceOutcome = { kind: 'fielders_choice' };

  it('runner on 1B — batter to 1B, 1B out', () => {
    const res = getDefaultRunnerStates(fc, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'first', confidence: 'high' });
    expect(r(res, 'first')).toMatchObject({ to: 'out', confidence: 'high' });
  });

  it('runners 1B+3B — 1B out, 3B stays (medium)', () => {
    const res = getDefaultRunnerStates(fc, { first: R1, second: null, third: R3 }, 0, B);
    expect(r(res, 'first')).toMatchObject({ to: 'out', confidence: 'high' });
    expect(r(res, 'third')).toMatchObject({ to: 'third', confidence: 'medium' });
  });
});

// ─── Error ──────────────────────────────────────

describe('Auto-advance: Error', () => {
  it('batter to 1B (high), runners unresolved', () => {
    const err: AutoAdvanceOutcome = { kind: 'error' };
    const res = getDefaultRunnerStates(err, { first: R1, second: null, third: null }, 0, B);
    expect(r(res, 'batter')).toMatchObject({ to: 'first', confidence: 'high' });
    expect(r(res, 'first')?.to).toBeNull(); // user decides
  });
});

// ─── Wild Pitch / Passed Ball ───────────────────

describe('Auto-advance: WP/PB', () => {
  it('WP: each runner +1 base (high)', () => {
    const wp: AutoAdvanceOutcome = { kind: 'wild_pitch' };
    const res = getDefaultRunnerStates(wp, { first: R1, second: R2, third: R3 }, 0);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'high' });
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'high' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'high' });
  });

  it('PB: works same as WP', () => {
    const pb: AutoAdvanceOutcome = { kind: 'passed_ball' };
    const res = getDefaultRunnerStates(pb, { first: R1, second: null, third: null }, 0);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'high' });
  });

  it('WP: no batter in results', () => {
    const wp: AutoAdvanceOutcome = { kind: 'wild_pitch' };
    const res = getDefaultRunnerStates(wp, { first: R1, second: null, third: null }, 0);
    expect(r(res, 'batter')).toBeUndefined();
  });
});

// ─── Balk ───────────────────────────────────────

describe('Auto-advance: Balk', () => {
  it('each runner +1 base (deterministic)', () => {
    const balk: AutoAdvanceOutcome = { kind: 'balk' };
    const res = getDefaultRunnerStates(balk, { first: R1, second: R2, third: R3 }, 0);
    expect(r(res, 'first')).toMatchObject({ to: 'second', confidence: 'deterministic' });
    expect(r(res, 'second')).toMatchObject({ to: 'third', confidence: 'deterministic' });
    expect(r(res, 'third')).toMatchObject({ to: 'home', confidence: 'deterministic' });
  });
});

// ─── Dropped Third Strike ───────────────────────

describe('Auto-advance: Dropped Third Strike', () => {
  it('batter left unresolved (user decides safe/out)', () => {
    const dk: AutoAdvanceOutcome = { kind: 'dropped_third_strike' };
    const res = getDefaultRunnerStates(dk, { first: null, second: null, third: null }, 0, B);
    expect(r(res, 'batter')?.to).toBeNull();
  });
});
