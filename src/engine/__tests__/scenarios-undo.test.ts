/**
 * Scenario tests: Undo (§14 of common-scenarios.md)
 *
 * Tests verify that undoLastEvent correctly restores prior state,
 * including count, bases, outs, score, and half-inning.
 */
import { describe, it, expect } from 'vitest';
import { deriveGameState, countFromPitches, pitchesToRestoreAfterUndo } from '../gameEngine';
import type { Pitch } from '../../models/play';
import type { PitchResult } from '../../models/common';
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

// ─── Count restoration (§14.1) ─────────────────
//
// Replaying the trimmed log can't bring the count back: a finished at-bat's
// pitches live on the event that undo removes. pitchesToRestoreAfterUndo()
// recovers them from that event before it is dropped.

const seq = (...results: PitchResult[]): Pitch[] => results.map(result => ({ result }));

/** The count the batter is handed back when the game's last event is undone */
function countAfterUndo(events: PlayEvent[]) {
  const pitches = pitchesToRestoreAfterUndo(makeGame({ events }));
  return pitches && countFromPitches(pitches);
}

describe('Scenario: Undo restores the count', () => {
  it('strikeout on a 1-2 count → back to 1-2', () => {
    const k = {
      ...strikeout(A[0]),
      pitchSequence: seq('strike_looking', 'ball', 'strike_swinging', 'strike_swinging'),
    } as PlayEvent;

    expect(countAfterUndo([k])).toEqual({ balls: 1, strikes: 2 });
  });

  it('walk on a 3-1 count → back to 3-1', () => {
    const bb = {
      ...walk(A[0]),
      pitchSequence: seq('ball', 'strike_looking', 'ball', 'ball', 'ball'),
    } as PlayEvent;

    expect(countAfterUndo([bb])).toEqual({ balls: 3, strikes: 1 });
  });

  it('ball in play on a 2-1 count → back to 2-1 with the same pitches', () => {
    const hit = {
      ...single(A[0]),
      pitchSequence: seq('ball', 'strike_swinging', 'ball', 'in_play'),
    } as PlayEvent;
    const pitches = pitchesToRestoreAfterUndo(makeGame({ events: [hit] }));

    expect(pitches).toEqual(seq('ball', 'strike_swinging', 'ball'));
    expect(countAfterUndo([hit])).toEqual({ balls: 2, strikes: 1 });
  });

  it('fouls with two strikes do not add a third', () => {
    const k = {
      ...strikeout(A[0]),
      pitchSequence: seq('foul', 'foul', 'foul', 'foul', 'strike_swinging'),
    } as PlayEvent;

    expect(countAfterUndo([k])).toEqual({ balls: 0, strikes: 2 });
  });

  it('first-pitch ball in play → back to 0-0', () => {
    expect(countAfterUndo([single(A[0])])).toEqual({ balls: 0, strikes: 0 });
  });

  it('restores from the last event only', () => {
    const first = { ...strikeout(A[0]), pitchSequence: seq('ball', 'ball', 'strike_looking', 'strike_looking', 'strike_looking') } as PlayEvent;
    const second = { ...walk(A[1]), pitchSequence: seq('ball', 'ball', 'ball', 'ball') } as PlayEvent;

    expect(countAfterUndo([first, second])).toEqual({ balls: 3, strikes: 0 });
  });

  it('undoing a between-at-bat event leaves the at-bat in progress alone', () => {
    const events: PlayEvent[] = [
      single(A[0]),
      wildPitch([mv(A[0], 'first', 'second')]),
    ];
    expect(pitchesToRestoreAfterUndo(makeGame({ events }))).toBeNull();
  });

  it('nothing to undo → nothing to restore', () => {
    expect(pitchesToRestoreAfterUndo(makeGame({ events: [] }))).toBeNull();
  });
});
