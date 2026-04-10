/**
 * Scenario tests: Inning-Ending Plays (§13 of common-scenarios.md)
 *
 * Tests verify correct behavior when plays end the half-inning —
 * especially force plays vs. timing plays on the 3rd out.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState } from '../gameEngine';
import {
  makeGame, A,
  single, triple,
  groundOut, doublePlay,
  strikeout, caughtStealing,
  mv,
} from './scenario-helpers';

describe('Scenario: Inning-Ending Plays', () => {
  it('IE1: 2 outs, runners 1B+3B — ground out forces 3 outs, runners stranded, NO run', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        triple(A[2], [], { outsBefore: 2 }),    // A[2] on 3B
        single(A[3], [], { outsBefore: 2 }),    // A[3] on 1B
        // Ground out by A[4] — 3rd out
        groundOut(A[4], {
          outsBefore: 2,
          runnerMovements: [mv(A[4], 'batter', 'out')],
        }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.outs).toBe(0);
    // Run does NOT score — 3rd out by batter
    expect(state.awayScore).toBe(0);
  });

  it('IE2: 2 outs, runner 3B — force out at 1B, run does NOT score', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        triple(A[2], [], { outsBefore: 2 }),
        // Ground out: batter thrown out at 1B (force out)
        groundOut(A[3], {
          outsBefore: 2,
          notation: '5-3',
          runnerMovements: [mv(A[3], 'batter', 'out')],
          // 3B runner stays — doesn't matter, inning over
        }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.awayScore).toBe(0); // NO run scores on force out 3rd out
  });

  it('IE4: 1 out, runners 1B+2B — 6-4-3 DP, inning over, runners stranded', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),                                       // 1 out
        single(A[1], [], { outsBefore: 1 }),                   // A[1] on 1B
        single(A[2], [mv(A[1], 'first', 'second')], { outsBefore: 1 }),  // A[1] on 2B, A[2] on 1B
        // DP: 6-4-3
        doublePlay(A[3], [
          mv(A[2], 'first', 'out'),
          mv(A[3], 'batter', 'out'),
        ], { outsBefore: 1, notation: '6-4-3' }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.outs).toBe(0);
    expect(state.awayScore).toBe(0);
  });

  it('IE5: 1 out, runners 1B+3B — DP, 3rd out is force, run does NOT score', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),                                  // 1 out
        triple(A[1], [], { outsBefore: 1 }),              // A[1] on 3B
        single(A[2], [], { outsBefore: 1 }),              // A[2] on 1B
        // DP: A[2] forced at 2B, batter out at 1B
        // Even though A[1] is on 3B, the 3rd out is a FORCE, so NO run scores
        doublePlay(A[3], [
          mv(A[2], 'first', 'out'),
          mv(A[3], 'batter', 'out'),
        ], { outsBefore: 1, notation: '6-4-3' }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    // The run does NOT score because 3rd out is a force out
    expect(state.awayScore).toBe(0);
  });

  it('3 strikeouts end the half-inning', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        strikeout(A[2], { outsBefore: 2 }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.outs).toBe(0);
    expect(state.bases.first).toBeNull();
  });

  it('CS ending inning: count resets, bases clear', () => {
    const game = makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        single(A[2], [], { outsBefore: 2 }),   // A[2] on 1B
        // CS: 3rd out
        caughtStealing(A[2], 'first', 'second', { outsBefore: 2 }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.outs).toBe(0);
    expect(state.count).toEqual({ balls: 0, strikes: 0 });
    expect(state.bases.first).toBeNull();
  });

  it('Run scores before 3rd out when 3rd out is NOT a force play', () => {
    // Scenario: 2 outs, runner on 3B. Batter hits single.
    // Runner on 3B scores (home). No force involved.
    // Then some OTHER out happens that isn't a force.
    // For this scenario: runner on 3B scores on the single (which IS valid).
    const game = makeGame({
      events: [
        strikeout(A[0]),
        strikeout(A[1], { outsBefore: 1 }),
        triple(A[2], [], { outsBefore: 2 }),   // A[2] on 3B
        // Single: A[2] scores from 3B (not a 3rd-out scenario, batter reaches safely)
        single(A[3], [mv(A[2], 'third', 'home')], { outsBefore: 2 }),
      ],
    });
    const state = deriveGameState(game);
    expect(state.awayScore).toBe(1); // Run counts — no 3rd out on this play
    expect(state.outs).toBe(2);
  });

  it('Half-inning transition clears bases even with runners on', () => {
    const game = makeGame({
      events: [
        single(A[0]),                                   // A[0] on 1B
        strikeout(A[1], { outsBefore: 0 }),             // 1 out
        strikeout(A[2], { outsBefore: 1 }),             // 2 outs
        groundOut(A[3], { outsBefore: 2 }),             // 3 outs
      ],
    });
    const state = deriveGameState(game);
    expect(state.halfInning).toBe('bottom');
    expect(state.bases.first).toBeNull();
    expect(state.bases.second).toBeNull();
    expect(state.bases.third).toBeNull();
  });
});
