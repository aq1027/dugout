/**
 * Scenario tests: Outs (§2 of common-scenarios.md)
 *
 * Tests verify that deriveGameState correctly handles out events
 * with various runner configurations and out counts.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState } from '../gameEngine';
import {
  makeGame, A,
  single, double_, triple,
  groundOut, flyOut, lineOut, doublePlay,
  strikeout,
  mv,
} from './scenario-helpers';

describe('Scenario: Outs', () => {
  // ─── §2.1 Ground Outs ───────────────────────

  describe('Ground Outs', () => {
    it('O-G1: ground out, no runners — simple out', () => {
      const game = makeGame({
        events: [groundOut(A[0])],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.awayBatterIndex).toBe(1);
      expect(state.bases.first).toBeNull();
    });

    it('O-G2: ground out, runner on 1B with 0 outs — runner advances to 2B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          groundOut(A[1], {
            notation: '4-3',
            runnerMovements: [
              mv(A[1], 'batter', 'out'),
              mv(A[0], 'first', 'second'),
            ],
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBe(A[0]);
    });

    it('O-G4: ground out with 2 outs, runner on 1B — 3rd out, inning over', () => {
      const game = makeGame({
        events: [
          strikeout(A[0]),
          single(A[1], [], { outsBefore: 1 }),
          strikeout(A[2], { outsBefore: 1 }),
          // 2 outs, A[1] on 1B. Batter grounds out for 3rd out.
          groundOut(A[3], {
            outsBefore: 2,
            runnerMovements: [mv(A[3], 'batter', 'out')],
            // Runner on 1B is stranded — no movement entry needed
          }),
        ],
      });
      const state = deriveGameState(game);
      // Should have advanced half-inning
      expect(state.halfInning).toBe('bottom');
      expect(state.outs).toBe(0);
      expect(state.bases.first).toBeNull();
    });

    it('O-G5: ground out with 2 outs, multiple runners — all stranded', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          single(A[1], [mv(A[0], 'first', 'second')]),
          strikeout(A[2], { outsBefore: 0 }),
          strikeout(A[3], { outsBefore: 1 }),
          // 2 outs, runners on 1B and 2B
          groundOut(A[4], {
            outsBefore: 2,
            runnerMovements: [mv(A[4], 'batter', 'out')],
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.halfInning).toBe('bottom');
      expect(state.outs).toBe(0);
    });

    it('O-G6: ground out, runner on 2B — runner advances to 3B', () => {
      const game = makeGame({
        events: [
          double_(A[0]),
          groundOut(A[1], {
            runnerMovements: [
              mv(A[1], 'batter', 'out'),
              mv(A[0], 'second', 'third'),
            ],
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.bases.third).toBe(A[0]);
      expect(state.bases.second).toBeNull();
    });

    it('O-G7: ground out, runner on 3B — runner stays (default for ground out)', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          groundOut(A[1], {
            runnerMovements: [mv(A[1], 'batter', 'out')],
            // Runner on 3B stays — no movement
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.bases.third).toBe(A[0]); // stayed
      expect(state.awayScore).toBe(0);
    });
  });

  // ─── §2.2 Fly Outs ──────────────────────────

  describe('Fly Outs', () => {
    it('O-F1: fly out, no runners', () => {
      const game = makeGame({
        events: [flyOut(A[0])],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
    });

    it('O-F2: fly out, runner on 3B with 0 outs — runner tags and scores (sac fly)', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          flyOut(A[1], {
            sacrifice: 'fly',
            notation: '8',
            runnerMovements: [
              mv(A[1], 'batter', 'out'),
              mv(A[0], 'third', 'home'),
            ],
            rbi: 1,
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
    });

    it('O-F3: fly out, runner on 2B — runner stays', () => {
      const game = makeGame({
        events: [
          double_(A[0]),
          flyOut(A[1], {
            runnerMovements: [mv(A[1], 'batter', 'out')],
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.bases.second).toBe(A[0]); // stays
    });

    it('O-F5: fly out, runners 2B+3B — 3B scores, 2B stays', () => {
      const game2 = makeGame({
        events: [
          double_(A[0]),                      // A[0] on 2B
          single(A[1], [mv(A[0], 'second', 'third')]),  // A[0] on 3B, A[1] on 1B
          // advance A[1] to 2B using stolen base
          {
            id: 'sb1', timestamp: '2026-04-07T12:00:00Z',
            inning: 1, halfInning: 'top' as const, outsBefore: 0,
            batterId: null, pitchSequence: [],
            runnerMovements: [mv(A[1], 'first', 'second')],
            type: 'stolen_base' as const, base: 'second' as const, runnerId: A[1],
          },
          // Fly out: 3B tags and scores, 2B stays
          flyOut(A[2], {
            sacrifice: 'fly',
            runnerMovements: [
              mv(A[2], 'batter', 'out'),
              mv(A[0], 'third', 'home'),
            ],
            rbi: 1,
          }),
        ],
      });
      const state2 = deriveGameState(game2);
      expect(state2.outs).toBe(1);
      expect(state2.awayScore).toBe(1);
      expect(state2.bases.second).toBe(A[1]); // stayed
      expect(state2.bases.third).toBeNull();
    });

    it('O-F7: fly out with 2 outs — 3rd out, inning over, runners stranded', () => {
      const game = makeGame({
        events: [
          strikeout(A[0]),
          strikeout(A[1], { outsBefore: 1 }),
          triple(A[2], [], { outsBefore: 2 }),
          flyOut(A[3], {
            outsBefore: 2,
            runnerMovements: [mv(A[3], 'batter', 'out')],
            // Runner on 3B stranded
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.halfInning).toBe('bottom');
      expect(state.outs).toBe(0);
      expect(state.awayScore).toBe(0); // runner did NOT score
    });
  });

  // ─── §2.3 Line Outs ─────────────────────────

  describe('Line Outs', () => {
    it('O-L1: line out, no runners', () => {
      const game = makeGame({
        events: [lineOut(A[0])],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
    });

    it('O-L2: line out, runner on 1B — runner stays', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          lineOut(A[1], {
            runnerMovements: [mv(A[1], 'batter', 'out')],
          }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(1);
      expect(state.bases.first).toBe(A[0]); // stays
    });
  });

  // ─── §6 Double Plays ────────────────────────

  describe('Double Plays', () => {
    it('DP1: 0 outs, runner on 1B — 6-4-3 DP, 2 outs recorded', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          doublePlay(A[1], [
            mv(A[0], 'first', 'out'),
            mv(A[1], 'batter', 'out'),
          ], { notation: '6-4-3' }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.outs).toBe(2);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBeNull();
    });

    it('DP4: 1 out, runner on 1B — 6-4-3 DP makes 3 outs, inning over', () => {
      const game = makeGame({
        events: [
          strikeout(A[0]),
          single(A[1], [], { outsBefore: 1 }),
          doublePlay(A[2], [
            mv(A[1], 'first', 'out'),
            mv(A[2], 'batter', 'out'),
          ], { outsBefore: 1, notation: '6-4-3' }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.halfInning).toBe('bottom');
      expect(state.outs).toBe(0);
    });

    it('DP5: 1 out, runners 1B+3B — DP ends inning, run does NOT score (force out)', () => {
      const game = makeGame({
        events: [
          strikeout(A[0]),                         // 1 out
          triple(A[1], [], { outsBefore: 1 }),     // A[1] on 3B
          single(A[2], [], { outsBefore: 1 }),     // A[2] on 1B
          // DP: force out at 2B on A[2], relay to 1B for A[3]
          // 3rd out is force out on batter at 1B — no run scores
          doublePlay(A[3], [
            mv(A[2], 'first', 'out'),
            mv(A[3], 'batter', 'out'),
            // A[1] on 3B crosses plate, but it doesn't count — 3rd out is force
          ], { outsBefore: 1, notation: '6-4-3' }),
        ],
      });
      const state = deriveGameState(game);
      expect(state.halfInning).toBe('bottom');
      expect(state.outs).toBe(0);
      // Run should NOT score — 3rd out is a force out
      // NOTE: Current engine counts runs from runnerMovements. Since we didn't
      // include A[1] going home in movements (because the run doesn't count),
      // the score should be 0.
      expect(state.awayScore).toBe(0);
    });
  });
});
