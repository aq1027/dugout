/**
 * Scenario tests: Undo (§14 of common-scenarios.md)
 *
 * Tests verify that undoLastEvent correctly restores prior state,
 * including count, bases, outs, score, and half-inning.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState } from '../gameEngine';
import {
  makeGame, A,
  single, triple, homeRun,
  strikeout,
  walk, wildPitch,
  caughtStealing,
  mv,
} from './scenario-helpers';
import type { PlayEvent } from '../../models/play';
import { doublePlay } from './scenario-helpers';

/** Derive state from a game with the last N events removed (undo N times). */
function deriveUndone(events: PlayEvent[], removeCount = 1) {
  const trimmed = events.slice(0, events.length - removeCount);
  return deriveGameState(makeGame({ events: trimmed }));
}

describe('Scenario: Undo', () => {
  it('U1: Undo single — runner removed from bases', () => {
    const events: PlayEvent[] = [single(A[0])];
    const before = deriveGameState(makeGame({ events: [] }));
    const after = deriveGameState(makeGame({ events }));
    expect(after.bases.first).toBe(A[0]);

    const undone = deriveUndone(events);
    expect(undone.bases.first).toBeNull();
    expect(undone.bases).toEqual(before.bases);
  });

  it('U2: Undo home run — score decremented', () => {
    const events: PlayEvent[] = [
      single(A[0]),
      homeRun(A[1], [mv(A[0], 'first', 'home')]),
    ];
    const after = deriveGameState(makeGame({ events }));
    expect(after.awayScore).toBe(2);

    const undone = deriveUndone(events);
    expect(undone.awayScore).toBe(0);
    expect(undone.bases.first).toBe(A[0]); // A[0] back on 1B
  });

  it('U3: Undo strikeout — outs decremented', () => {
    const events: PlayEvent[] = [strikeout(A[0])];
    const after = deriveGameState(makeGame({ events }));
    expect(after.outs).toBe(1);

    const undone = deriveUndone(events);
    expect(undone.outs).toBe(0);
  });

  it('U4: Undo walk — runner removed from 1B', () => {
    const events: PlayEvent[] = [walk(A[0])];
    const after = deriveGameState(makeGame({ events }));
    expect(after.bases.first).toBe(A[0]);

    const undone = deriveUndone(events);
    expect(undone.bases.first).toBeNull();
  });

  it('U5: Undo wild pitch — runners return to prior bases', () => {
    const events: PlayEvent[] = [
      single(A[0]),                                      // A[0] on 1B
      wildPitch([mv(A[0], 'first', 'second')]),          // A[0] to 2B
    ];
    const after = deriveGameState(makeGame({ events }));
    expect(after.bases.first).toBeNull();
    expect(after.bases.second).toBe(A[0]);

    const undone = deriveUndone(events);
    expect(undone.bases.first).toBe(A[0]);
    expect(undone.bases.second).toBeNull();
  });

  it('U6: Undo CS that ended the inning — restores half-inning + bases', () => {
    const events: PlayEvent[] = [
      strikeout(A[0]),
      strikeout(A[1], { outsBefore: 1 }),
      single(A[2], [], { outsBefore: 2 }),   // A[2] on 1B
      caughtStealing(A[2], 'first', 'second', { outsBefore: 2 }), // 3rd out
    ];
    const after = deriveGameState(makeGame({ events }));
    expect(after.halfInning).toBe('bottom');

    const undone = deriveUndone(events);
    expect(undone.halfInning).toBe('top');
    expect(undone.outs).toBe(2);
    expect(undone.bases.first).toBe(A[2]);
  });

  it('U7: Undo double play — restores runners and outs', () => {
    const events: PlayEvent[] = [
      single(A[0]),   // A[0] on 1B
      doublePlay(A[1], [
        mv(A[0], 'first', 'out'),
        mv(A[1], 'batter', 'out'),
      ]),
    ];
    const after = deriveGameState(makeGame({ events }));
    expect(after.outs).toBe(2);
    expect(after.bases.first).toBeNull();

    const undone = deriveUndone(events);
    expect(undone.outs).toBe(0);
    expect(undone.bases.first).toBe(A[0]);
  });

  it('Undo restores score after run-scoring single', () => {
    const events: PlayEvent[] = [
      triple(A[0]),                                        // A[0] on 3B
      single(A[1], [mv(A[0], 'third', 'home')]),           // A[0] scores
    ];
    const state = deriveGameState(makeGame({ events }));
    expect(state.awayScore).toBe(1);

    const undone = deriveUndone(events);
    expect(undone.awayScore).toBe(0);
    expect(undone.bases.third).toBe(A[0]);
  });

  it('Multiple undos stack correctly', () => {
    const events: PlayEvent[] = [
      single(A[0]),
      single(A[1], [mv(A[0], 'first', 'second')]),
      homeRun(A[2], [mv(A[0], 'second', 'home'), mv(A[1], 'first', 'home')]),
    ];
    const afterAll = deriveGameState(makeGame({ events }));
    expect(afterAll.awayScore).toBe(3);

    // Undo HR
    const undo1 = deriveUndone(events, 1);
    expect(undo1.awayScore).toBe(0);
    expect(undo1.bases.first).toBe(A[1]);
    expect(undo1.bases.second).toBe(A[0]);

    // Undo second single
    const undo2 = deriveUndone(events, 2);
    expect(undo2.awayScore).toBe(0);
    expect(undo2.bases.first).toBe(A[0]);
    expect(undo2.bases.second).toBeNull();

    // Undo first single
    const undo3 = deriveUndone(events, 3);
    expect(undo3.bases.first).toBeNull();
  });
});
