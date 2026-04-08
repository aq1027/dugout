/**
 * Scenario tests: Sacrifice Fly (§3 of common-scenarios.md)
 *
 * Tests verify sac fly behavior: batter out, runner scoring,
 * partial advancement, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState } from '../gameEngine';
import {
  makeGame, A,
  single, double_, triple,
  flyOut, strikeout,
  mv,
} from './scenario-helpers';

describe('Scenario: Sacrifice Fly', () => {
  it('SF1: 0 outs, runner on 3B — batter out, runner scores', () => {
    const game = makeGame({
      events: [
        triple(A[0]),
        flyOut(A[1], {
          sacrifice: 'fly',
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
    expect(state.awayScore).toBe(1);
    expect(state.bases.third).toBeNull();
  });

  it('SF2: 0 outs, runners 2B+3B — 3B scores, 2B stays', () => {
    const game = makeGame({
      events: [
        double_(A[0]),                                    // A[0] on 2B
        single(A[1], [mv(A[0], 'second', 'third')]),     // A[0] on 3B, A[1] on 1B
        // Need A[1] on 2B. Use SB.
        { id: 'sb1', timestamp: '2026-04-07T12:00:00Z',
          inning: 1, halfInning: 'top' as const, outsBefore: 0,
          batterId: null, pitchSequence: [],
          runnerMovements: [mv(A[1], 'first', 'second')],
          type: 'stolen_base' as const, base: 'second' as const, runnerId: A[1] },
        // Sac fly: 3B scores, 2B stays
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
    const state = deriveGameState(game);
    expect(state.outs).toBe(1);
    expect(state.awayScore).toBe(1);
    expect(state.bases.second).toBe(A[1]); // stayed
    expect(state.bases.third).toBeNull();
  });

  it('SF3: 1 out, runners 1B+3B — 3B scores, 1B stays', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),                                 // 1 out
        triple(A[1], [], { outsBefore: 1 }),             // A[1] on 3B
        single(A[2], [], { outsBefore: 1 }),             // A[2] on 1B
        flyOut(A[3], {
          outsBefore: 1,
          sacrifice: 'fly',
          runnerMovements: [
            mv(A[3], 'batter', 'out'),
            mv(A[1], 'third', 'home'),
          ],
          rbi: 1,
        }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.outs).toBe(2);
    expect(state.awayScore).toBe(1);
    expect(state.bases.first).toBe(A[2]); // stayed
    expect(state.bases.third).toBeNull();
  });

  it('SF4: 0 outs, bases loaded — 3B scores, 2B stays, 1B stays', () => {
    const game = makeGame({
      events: [
        single(A[0]),
        single(A[1], [mv(A[0], 'first', 'second')]),
        single(A[2], [mv(A[1], 'first', 'second'), mv(A[0], 'second', 'third')]),
        // Bases loaded: A[0] on 3B, A[1] on 2B, A[2] on 1B
        flyOut(A[3], {
          sacrifice: 'fly',
          runnerMovements: [
            mv(A[3], 'batter', 'out'),
            mv(A[0], 'third', 'home'),
            // A[1] and A[2] stay — no entries
          ],
          rbi: 1,
        }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.outs).toBe(1);
    expect(state.awayScore).toBe(1);
    expect(state.bases.first).toBe(A[2]); // stayed
    expect(state.bases.second).toBe(A[1]); // stayed
    expect(state.bases.third).toBeNull();
  });

  it('SF with tag up: 0 outs, runners 2B+3B — 3B scores, 2B advances to 3B on tag', () => {
    const game = makeGame({
      events: [
        double_(A[0]),
        single(A[1], [mv(A[0], 'second', 'third')]),
        { id: 'sb1', timestamp: '2026-04-07T12:00:00Z',
          inning: 1, halfInning: 'top' as const, outsBefore: 0,
          batterId: null, pitchSequence: [],
          runnerMovements: [mv(A[1], 'first', 'second')],
          type: 'stolen_base' as const, base: 'second' as const, runnerId: A[1] },
        flyOut(A[2], {
          sacrifice: 'fly',
          runnerMovements: [
            mv(A[2], 'batter', 'out'),
            mv(A[0], 'third', 'home'),
            mv(A[1], 'second', 'third'), // tags up and advances
          ],
          rbi: 1,
        }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.outs).toBe(1);
    expect(state.awayScore).toBe(1);
    expect(state.bases.third).toBe(A[1]); // advanced on tag
    expect(state.bases.second).toBeNull();
  });

  it('Sac fly not possible with 2 outs — becomes regular fly out, 3rd out, no run', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        triple(A[2], [], { outsBefore: 2 }),
        // With 2 outs, fly out = 3rd out. Runner on 3B stranded.
        flyOut(A[3], {
          outsBefore: 2,
          // NOT a sac fly — batter out makes 3 outs
          runnerMovements: [mv(A[3], 'batter', 'out')],
        }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.awayScore).toBe(0); // run does NOT score
  });
});
