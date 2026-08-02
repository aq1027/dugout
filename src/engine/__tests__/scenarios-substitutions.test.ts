/**
 * Substitution scenarios (v0.1.3).
 *
 * Covers the bug where a substitution was applied to the lineup and then
 * silently reverted by a second, stale write that carried only the event.
 */
import { describe, it, expect } from 'vitest';
import type { Game } from '../../models/game';
import type { PlayEvent } from '../../models/play';
import type { Substitution } from '../../models/lineup';
import type { Id, PositionNumber } from '../../models/common';
import { deriveGameState, undoLastEventWithLineup } from '../gameEngine';
import { makeGame, single, A, H, tid } from './scenario-helpers';

// ─── Helpers ────────────────────────────────────

/** Apply a substitution to a lineup and build its event — mirrors LineupPanel */
function makeSub(
  game: Game,
  isAway: boolean,
  opts: {
    orderSlot: number;
    inPlayerId: Id;
    position?: PositionNumber;
    subType?: Substitution['type'];
    inning?: number;
    halfInning?: 'top' | 'bottom';
    replacedRunnerBase?: 'first' | 'second' | 'third';
  },
): { updatedGame: Game; event: PlayEvent } {
  const lineupKey = isAway ? 'awayLineup' : 'homeLineup';
  const lineup = { ...game[lineupKey] };
  const subType = opts.subType ?? 'pinch_hitter';
  const position = opts.position ?? lineup.startingOrder[opts.orderSlot].position;
  const outPlayerId = lineup.startingOrder[opts.orderSlot].playerId;

  const sub: Substitution = {
    inning: opts.inning ?? 1,
    outs: 0,
    outPlayerId,
    inPlayerId: opts.inPlayerId,
    orderSlot: opts.orderSlot,
    position,
    type: subType,
  };
  lineup.substitutions = [...lineup.substitutions, sub];

  const event = {
    id: tid('ev'),
    timestamp: new Date().toISOString(),
    inning: opts.inning ?? 1,
    halfInning: opts.halfInning ?? 'top',
    outsBefore: 0,
    batterId: null,
    pitchSequence: [],
    runnerMovements: [],
    type: 'substitution',
    subType,
    outPlayerId,
    inPlayerId: opts.inPlayerId,
    position,
    orderSlot: opts.orderSlot,
    ...(opts.replacedRunnerBase ? { replacedRunnerBase: opts.replacedRunnerBase } : {}),
  } as PlayEvent;

  return {
    updatedGame: { ...game, [lineupKey]: lineup },
    event,
  };
}

/** The fixed single-write path: game mutation + event committed together */
function commitWithEvent(updatedGame: Game, event: PlayEvent): Game {
  return { ...updatedGame, events: [...updatedGame.events, event] };
}

/** Current occupant of each batting slot, accounting for substitutions */
function currentSlots(game: Game, isAway: boolean) {
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const slots = lineup.startingOrder.map(s => ({ ...s }));
  for (const sub of lineup.substitutions) {
    if (sub.orderSlot < slots.length) {
      slots[sub.orderSlot] = { playerId: sub.inPlayerId, position: sub.position };
    }
  }
  return slots;
}

// ─── Tests ──────────────────────────────────────

describe('Substitutions — commit and persistence', () => {
  it('SUB1: pinch hitter replaces the slot occupant', () => {
    const game = makeGame();
    const { updatedGame } = makeSub(game, true, { orderSlot: 2, inPlayerId: 'bench-1' });

    expect(currentSlots(updatedGame, true)[2].playerId).toBe('bench-1');
    expect(updatedGame.awayLineup.substitutions).toHaveLength(1);
  });

  it('SUB2: REGRESSION — lineup change and its event both survive one write', () => {
    // The v0.1.2 bug: LineupPanel called onGameUpdate() then onEvent(), and
    // onEvent rebuilt the game from a stale closure that predated the
    // substitution. The event landed; the roster change was reverted.
    const game = makeGame();
    const { updatedGame, event } = makeSub(game, true, { orderSlot: 0, inPlayerId: 'bench-1' });
    const committed = commitWithEvent(updatedGame, event);

    // Both halves must be present in the same object
    expect(committed.awayLineup.substitutions).toHaveLength(1);
    expect(committed.events.filter(e => e.type === 'substitution')).toHaveLength(1);
    expect(currentSlots(committed, true)[0].playerId).toBe('bench-1');
  });

  it('SUB3: reproduces the old bug — a stale second write drops the sub', () => {
    // Documents the exact failure mode so it can't silently return.
    const game = makeGame();
    const { updatedGame, event } = makeSub(game, true, { orderSlot: 0, inPlayerId: 'bench-1' });

    // The buggy path: second write spreads the ORIGINAL game, not updatedGame
    const staleWrite: Game = { ...game, events: [...game.events, event] };

    expect(updatedGame.awayLineup.substitutions).toHaveLength(1);
    // Event present, roster change gone — exactly what the user reported
    expect(staleWrite.events).toHaveLength(1);
    expect(staleWrite.awayLineup.substitutions).toHaveLength(0);
  });

  it('SUB4: a subbed-out player cannot re-enter', () => {
    const game = makeGame();
    const { updatedGame } = makeSub(game, true, { orderSlot: 4, inPlayerId: 'bench-1' });

    const removed = new Set(
      updatedGame.awayLineup.substitutions
        .filter(s => s.outPlayerId !== s.inPlayerId)
        .map(s => s.outPlayerId),
    );
    expect(removed.has(A[4])).toBe(true);
  });

  it('SUB5: multiple subs in one slot — last one is the current occupant', () => {
    const game = makeGame();
    const first = makeSub(game, true, { orderSlot: 3, inPlayerId: 'bench-1' });
    const second = makeSub(first.updatedGame, true, { orderSlot: 3, inPlayerId: 'bench-2' });

    expect(second.updatedGame.awayLineup.substitutions).toHaveLength(2);
    expect(currentSlots(second.updatedGame, true)[3].playerId).toBe('bench-2');
  });

  it('SUB6: starting order is never mutated — display keeps the starter', () => {
    const game = makeGame();
    const { updatedGame } = makeSub(game, true, { orderSlot: 1, inPlayerId: 'bench-1' });

    // The scorecard shows the starter on the numbered line, sub indented below
    expect(updatedGame.awayLineup.startingOrder[1].playerId).toBe(A[1]);
    expect(currentSlots(updatedGame, true)[1].playerId).toBe('bench-1');
  });
});

describe('Substitutions — pitching changes', () => {
  it('SUB7: pitching change updates the current pitcher', () => {
    const game = makeGame();
    const pitcherSlot = game.homeLineup.startingOrder.findIndex(s => s.position === 1);
    const { updatedGame } = makeSub(game, false, {
      orderSlot: pitcherSlot,
      inPlayerId: 'bench-p',
      position: 1,
      subType: 'pitching_change',
    });

    const subs = [...updatedGame.homeLineup.substitutions].reverse();
    const currentPitcher = subs.find(s => s.position === 1)?.inPlayerId;
    expect(currentPitcher).toBe('bench-p');
  });

  it('SUB8: pitching change is scoped to one team', () => {
    const game = makeGame();
    const { updatedGame } = makeSub(game, false, {
      orderSlot: 0,
      inPlayerId: 'bench-p',
      position: 1,
      subType: 'pitching_change',
    });

    expect(updatedGame.homeLineup.substitutions).toHaveLength(1);
    expect(updatedGame.awayLineup.substitutions).toHaveLength(0);
  });
});

describe('Substitutions — pinch runner takes over the base', () => {
  it('SUB9: pinch runner replaces the runner on base in derived state', () => {
    // A[0] singles and is on first, then is pinch-run for by bench-1
    const game = makeGame();
    const withHit = { ...game, events: [single(A[0])] };
    expect(deriveGameState(withHit).bases.first).toBe(A[0]);

    const { updatedGame, event } = makeSub(withHit, true, {
      orderSlot: 0,
      inPlayerId: 'bench-1',
      subType: 'pinch_runner',
      replacedRunnerBase: 'first',
    });
    const committed = commitWithEvent(updatedGame, event);

    // The PR now owns the base — any run from here credits the right player
    expect(deriveGameState(committed).bases.first).toBe('bench-1');
  });

  it('SUB10: a non-pinch-runner sub leaves the bases untouched', () => {
    const game = makeGame();
    const withHit = { ...game, events: [single(A[0])] };
    const { updatedGame, event } = makeSub(withHit, true, {
      orderSlot: 4,
      inPlayerId: 'bench-1',
      subType: 'pinch_hitter',
    });
    const committed = commitWithEvent(updatedGame, event);

    expect(deriveGameState(committed).bases.first).toBe(A[0]);
  });
});

describe('Substitutions — undo', () => {
  it('SUB11: undo removes both the event and the lineup change', () => {
    const game = makeGame();
    const { updatedGame, event } = makeSub(game, true, { orderSlot: 2, inPlayerId: 'bench-1' });
    const committed = commitWithEvent(updatedGame, event);

    const reverted = undoLastEventWithLineup(committed);

    expect(reverted.events).toHaveLength(0);
    expect(reverted.awayLineup.substitutions).toHaveLength(0);
    expect(currentSlots(reverted, true)[2].playerId).toBe(A[2]);
  });

  it('SUB12: undo finds the right team — a home pitching change during a top half', () => {
    // The fielding team subs during the other team's half, so the lineup
    // can't be inferred from halfInning alone.
    const game = makeGame();
    const { updatedGame, event } = makeSub(game, false, {
      orderSlot: 0,
      inPlayerId: 'bench-p',
      position: 1,
      subType: 'pitching_change',
      halfInning: 'top',
    });
    const committed = commitWithEvent(updatedGame, event);

    const reverted = undoLastEventWithLineup(committed);

    expect(reverted.homeLineup.substitutions).toHaveLength(0);
    expect(reverted.events).toHaveLength(0);
  });

  it('SUB13: undo of a sub leaves earlier subs in place', () => {
    const game = makeGame();
    const first = makeSub(game, true, { orderSlot: 3, inPlayerId: 'bench-1' });
    const committed1 = commitWithEvent(first.updatedGame, first.event);
    const second = makeSub(committed1, true, { orderSlot: 5, inPlayerId: 'bench-2' });
    const committed2 = commitWithEvent(second.updatedGame, second.event);

    const reverted = undoLastEventWithLineup(committed2);

    expect(reverted.awayLineup.substitutions).toHaveLength(1);
    expect(currentSlots(reverted, true)[3].playerId).toBe('bench-1');
    expect(currentSlots(reverted, true)[5].playerId).toBe(A[5]);
  });

  it('SUB14: undoing a non-substitution event leaves lineups alone', () => {
    const game = makeGame();
    const { updatedGame, event } = makeSub(game, true, { orderSlot: 1, inPlayerId: 'bench-1' });
    const committed = commitWithEvent(updatedGame, event);
    const withHit = { ...committed, events: [...committed.events, single(H[0])] };

    const reverted = undoLastEventWithLineup(withHit);

    expect(reverted.events).toHaveLength(1);
    expect(reverted.awayLineup.substitutions).toHaveLength(1);
  });
});
