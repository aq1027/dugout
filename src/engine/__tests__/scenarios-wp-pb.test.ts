/**
 * Scenario tests: Wild Pitch & Passed Ball (§7 of common-scenarios.md)
 *
 * Tests verify WP/PB runner advancement with various configurations.
 * Each runner advances independently.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState } from '../gameEngine';
import {
  makeGame, A,
  single, double_, triple,
  wildPitch, passedBall,
  mv,
} from './scenario-helpers';

describe('Scenario: Wild Pitch / Passed Ball', () => {
  describe('Wild Pitch', () => {
    it('WP1: runner on 1B — advances to 2B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          wildPitch([mv(A[0], 'first', 'second')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBe(A[0]);
    });

    it('WP2: runner on 3B — scores', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          wildPitch([mv(A[0], 'third', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
    });

    it('WP3: runners on 1B+3B — 1B to 2B, 3B scores (independent)', () => {
      const game = makeGame({
        events: [
          triple(A[0]),      // A[0] on 3B
          single(A[1]),      // A[1] on 1B
          wildPitch([
            mv(A[1], 'first', 'second'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBe(A[1]);
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
    });

    it('WP3 (partial): runners on 1B+3B — 1B advances, 3B STAYS', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          single(A[1]),
          // Only 1B advances; 3B runner holds
          wildPitch([mv(A[1], 'first', 'second')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[1]);
      expect(state.bases.third).toBe(A[0]); // stayed!
      expect(state.awayScore).toBe(0);
    });

    it('WP5: runners on 1B+3B — ONLY 3B scores, 1B stays', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          single(A[1]),
          // Only 3B runner goes; 1B holds
          wildPitch([mv(A[0], 'third', 'home')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBe(A[1]); // stayed
      expect(state.bases.third).toBeNull();
      expect(state.awayScore).toBe(1);
    });

    it('WP7: bases loaded — all advance one base', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          single(A[1], [mv(A[0], 'first', 'second')]),
          single(A[2], [mv(A[1], 'first', 'second'), mv(A[0], 'second', 'third')]),
          wildPitch([
            mv(A[2], 'first', 'second'),
            mv(A[1], 'second', 'third'),
            mv(A[0], 'third', 'home'),
          ]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBe(A[2]);
      expect(state.bases.third).toBe(A[1]);
      expect(state.awayScore).toBe(1);
    });

    it('WP: runner on 2B — advances to 3B', () => {
      const game = makeGame({
        events: [
          double_(A[0]),
          wildPitch([mv(A[0], 'second', 'third')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBeNull();
      expect(state.bases.third).toBe(A[0]);
    });

    it('WP does not end at-bat (between-AB event)', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          wildPitch([mv(A[0], 'first', 'second')]),
        ],
      });
      const state = deriveGameState(game);
      // Batter index should be at 1 (A[1] from single), WP doesn't advance
      expect(state.awayBatterIndex).toBe(1);
    });

    it('WP: runner thrown out at next base', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          wildPitch([mv(A[0], 'first', 'out')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBeNull();
      expect(state.outs).toBe(1);
    });
  });

  describe('Passed Ball', () => {
    it('PB: runner on 1B — advances to 2B', () => {
      const game = makeGame({
        events: [
          single(A[0]),
          passedBall([mv(A[0], 'first', 'second')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.first).toBeNull();
      expect(state.bases.second).toBe(A[0]);
    });

    it('PB: partial advance, runners 1B+3B — only 1B advances, 3B stays', () => {
      const game = makeGame({
        events: [
          triple(A[0]),
          single(A[1]),
          passedBall([mv(A[1], 'first', 'second')]),
        ],
      });
      const state = deriveGameState(game);
      expect(state.bases.second).toBe(A[1]);
      expect(state.bases.third).toBe(A[0]); // stayed
      expect(state.awayScore).toBe(0);
    });
  });
});
