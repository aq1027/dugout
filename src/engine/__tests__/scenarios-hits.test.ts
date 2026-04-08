/**
 * Scenario tests: Hits (§1 of common-scenarios.md)
 *
 * Tests verify that deriveGameState correctly handles hit events
 * with various runner configurations.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState } from '../gameEngine';
import {
  makeGame, A,
  single, double_, triple, homeRun,
  mv,
} from './scenario-helpers';

describe('Scenario: Hits', () => {
  // ─── §1.1 Singles ────────────────────────────

  describe('Singles', () => {
    it('H-S1: single, no runners — batter to 1B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[0]);
      expect(state.bases.second).toBeNull();
      expect(state.bases.third).toBeNull();
      expect(state.awayHits).toBe(1);
      expect(state.awayScore).toBe(0);
    });

    it('H-S2: single, runner on 1B — forced advance to 2B', () => {
      const game = makeGame({
        events: [
          // Put A[0] on 1B
          single(A[0]),
          // A[1] singles, A[0] forced to 2B
          single(A[1], [mv(A[0], 'first', 'second')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[1]);
      expect(state.bases.second).toBe(A[0]);
      expect(state.bases.third).toBeNull();
    });

    it('H-S3: single, runner on 2B — runner advances to 3B (default)', () => {
      const game = makeGame({
        events: [
          // Put A[0] on 2B via double
          double_(A[0]),
          // A[1] singles, A[0] advances to 3B
          single(A[1], [mv(A[0], 'second', 'third')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[1]);
      expect(state.bases.second).toBeNull();
      expect(state.bases.third).toBe(A[0]);
    });

    it('H-S3 (stay): single, runner on 2B — runner stays at 2B', () => {
      const game = makeGame({
        events: [
          double_(A[0]),
          // A[1] singles, A[0] holds at 2B (no movement entry for A[0])
          single(A[1]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[1]);
      expect(state.bases.second).toBe(A[0]); // stayed
      expect(state.bases.third).toBeNull();
    });

    it('H-S4: single, runner on 3B — runner scores', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          single(A[1], [mv(A[0], 'third', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[1]);
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
    });

    it('H-S4 (stay): single, runner on 3B — runner holds', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          single(A[1]), // no movement for A[0]
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[1]);
      expect(state.bases.third).toBe(A[0]); // held
      expect(state.awayScore).toBe(0);
    });

    it('H-S5: single, runners on 1B+2B — 1B forced to 2B, 2B to 3B', () => {
      const game = makeGame({
        events: [
          single(A[0]),     // A[0] on 1B
          single(A[1], [mv(A[0], 'first', 'second')]),  // A[0] to 2B, A[1] on 1B
          // A[2] singles: A[1] (1B) forced to 2B, A[0] (2B) advances to 3B
          single(A[2], [
            mv(A[1], 'first', 'second'),
            mv(A[0], 'second', 'third'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[2]);
      expect(state.bases.second).toBe(A[1]);
      expect(state.bases.third).toBe(A[0]);
    });

    it('H-S6: single, runners on 1B+3B — 1B forced, 3B scores', () => {
      const game = makeGame({
        events: [
          triple(A[0]),     // A[0] on 3B
          single(A[1]),     // A[1] on 1B
          // A[2] singles: 1B forced to 2B, 3B scores
          single(A[2], [
            mv(A[1], 'first', 'second'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[2]);
      expect(state.bases.second).toBe(A[1]);
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
    });

    it('H-S7: single, runners on 2B+3B — both advance', () => {
      const game2 = makeGame({
        events: [
          // Put A[0] on 2B
          double_(A[0]),
          // Put A[1] on 3B via advancing A[0] to 3B on single, then another batter
          single(A[1], [mv(A[0], 'second', 'third')]),
          // Now: A[0] on 3B, A[1] on 1B
          // Get A[1] to 2B
          stolenBaseHelper(A[1]),
          // Now: A[0] on 3B, A[1] on 2B
          // A[2] singles: 2B→3B, 3B→Home
          single(A[2], [
            mv(A[1], 'second', 'third'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state2 = deriveGameState(game2);
      expect(state2.bases.first).toBe(A[2]);
      expect(state2.bases.third).toBe(A[1]);
      expect(state2.awayScore).toBe(1); // A[0] scored
    });

    it('H-S8: single, bases loaded — forced chain, 3B scores', () => {
      const game = makeGame({
        events: [
          single(A[0]),     // A[0] on 1B
          single(A[1], [mv(A[0], 'first', 'second')]),  // A[0] 2B, A[1] 1B
          single(A[2], [    // Bases loaded
            mv(A[1], 'first', 'second'),
            mv(A[0], 'second', 'third'),
          ]),
          // A[3] singles: full force chain
          single(A[3], [
            mv(A[2], 'first', 'second'),
            mv(A[1], 'second', 'third'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[3]);
      expect(state.bases.second).toBe(A[2]);
      expect(state.bases.third).toBe(A[1]);
      expect(state.awayScore).toBe(1); // A[0] scored
    });
  });

  // ─── §1.2 Doubles ────────────────────────────

  describe('Doubles', () => {
    it('H-D1: double, no runners — batter to 2B', () => {
      const game = makeGame({
        events: [double_(A[0])],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[0]);
      expect(state.bases.first).toBeNull();
      expect(state.awayHits).toBe(1);
    });

    it('H-D2: double, runner on 1B — runner to 3B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          double_(A[1], [mv(A[0], 'first', 'third')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[1]);
      expect(state.bases.third).toBe(A[0]);
    });

    it('H-D3: double, runner on 2B — runner scores', () => {
      const game = makeGame({
        events: [
          double_(A[0]),
          double_(A[1], [mv(A[0], 'second', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[1]);
      expect(state.awayScore).toBe(1);
    });

    it('H-D4: double, runner on 3B — runner scores', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          double_(A[1], [mv(A[0], 'third', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[1]);
      expect(state.awayScore).toBe(1);
    });

    it('H-D5: double, runners on 1B+2B — 1B to 3B, 2B scores', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          single(A[1], [mv(A[0], 'first', 'second')]),
          double_(A[2], [
            mv(A[1], 'first', 'third'),
            mv(A[0], 'second', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[2]);
      expect(state.bases.third).toBe(A[1]);
      expect(state.awayScore).toBe(1);
    });

    it('H-D8: double, bases loaded — 2B+3B score, 1B to 3B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          single(A[1], [mv(A[0], 'first', 'second')]),
          single(A[2], [
            mv(A[1], 'first', 'second'),
            mv(A[0], 'second', 'third'),
          ]),
          double_(A[3], [
            mv(A[2], 'first', 'third'),
            mv(A[1], 'second', 'home'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[3]);
      expect(state.bases.third).toBe(A[2]);
      expect(state.awayScore).toBe(2);
    });
  });

  // ─── §1.3 Triples ───────────────────────────

  describe('Triples', () => {
    it('H-T1: triple, no runners — batter to 3B', () => {
      const game = makeGame({
        events: [triple(A[0])],
      });
      const state = deriveGameState(game);
      expect(state.bases.third).toBe(A[0]);
      expect(state.awayHits).toBe(1);
    });

    it('H-T2: triple, runner on 1B — runner scores', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          triple(A[1], [mv(A[0], 'first', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.third).toBe(A[1]);
      expect(state.awayScore).toBe(1);
    });

    it('H-T5: triple, bases loaded — all runners score', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          single(A[1], [mv(A[0], 'first', 'second')]),
          single(A[2], [
            mv(A[1], 'first', 'second'),
            mv(A[0], 'second', 'third'),
          ]),
          triple(A[3], [
            mv(A[2], 'first', 'home'),
            mv(A[1], 'second', 'home'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.third).toBe(A[3]);
      expect(state.awayScore).toBe(3);
    });
  });

  // ─── §1.4 Home Runs ──────────────────────────

  describe('Home Runs', () => {
    it('H-HR1: solo home run', () => {
      const game = makeGame({
        events: [homeRun(A[0])],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBeNull();
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
      expect(state.awayHits).toBe(1);
    });

    it('H-HR2: 2-run HR, runner on 1B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          homeRun(A[1], [mv(A[0], 'first', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.awayScore).toBe(2);
      expect(state.bases.first).toBeNull();
    });

    it('H-HR5: grand slam — bases loaded, all score', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          single(A[1], [mv(A[0], 'first', 'second')]),
          single(A[2], [
            mv(A[1], 'first', 'second'),
            mv(A[0], 'second', 'third'),
          ]),
          homeRun(A[3], [
            mv(A[2], 'first', 'home'),
            mv(A[1], 'second', 'home'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.awayScore).toBe(4);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBeNull();
      expect(state.bases.third).toBeNull();
    });
  });
});

// Helper for stolen base (not imported from scenario-helpers to keep this test self-contained in concerns)
function stolenBaseHelper(runnerId: string) {
  return {
    id: `sb-${runnerId}`,
    timestamp: new Date().toISOString(),
    inning: 1,
    halfInning: 'top' as const,
    outsBefore: 0,
    batterId: null,
    pitchSequence: [],
    runnerMovements: [{ runnerId, from: 'first' as const, to: 'second' as const }],
    type: 'stolen_base' as const,
    base: 'second' as const,
    runnerId,
  };
}
