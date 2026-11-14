/**
 * Event construction: the rules that turn the scorer's taps into a PlayEvent.
 *
 * The scenario suites replay hand-built, already-correct events, so they can't
 * catch a mistake made while *building* one. These tests cover that step —
 * RBI credit, out classification, and whether a marked run counts.
 */
import { describe, it, expect } from 'vitest';
import { analyzePlay, buildPlayEvent } from '../playBuilder';
import type { PlayInput, PlayOutcome, ResolvedRunner } from '../playBuilder';
import type { BaseState } from '../../models/common';
import type { OutEvent, ErrorEvent } from '../../models/play';

const META = { id: 'ev-1', timestamp: '2026-04-07T12:00:00Z' };
const BATTER = 'bat';

function input(
  outcome: PlayOutcome,
  runners: ResolvedRunner[],
  opts: { outs?: number; bases?: Partial<BaseState> } & Partial<PlayInput> = {},
): PlayInput {
  const { outs = 0, bases = {}, ...rest } = opts;
  return {
    outcome,
    runners,
    state: {
      inning: 1,
      halfInning: 'top',
      outs,
      bases: { first: null, second: null, third: null, ...bases },
    },
    batterId: BATTER,
    pitches: [{ result: 'in_play' }],
    notation: '',
    ...rest,
  };
}

const r = (runnerId: string, from: ResolvedRunner['from'], to: ResolvedRunner['to']): ResolvedRunner =>
  ({ runnerId, from, to });

const GROUND: PlayOutcome = { kind: 'out', outType: 'ground_out' };
const FLY: PlayOutcome = { kind: 'out', outType: 'fly_out' };
const LINE: PlayOutcome = { kind: 'out', outType: 'line_out' };
const ERROR: PlayOutcome = { kind: 'error', position: 6 };

describe('RBI on double plays — MLB 9.04(b)(1)', () => {
  it('force DP: no RBI even though a run scores', () => {
    // Runners 1B+3B, 0 outs, 6-4-3 — runner from third scores
    const ev = buildPlayEvent(input(GROUND, [
      r('r3', 'third', 'home'),
      r('r1', 'first', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { bases: { first: 'r1', third: 'r3' } }), META) as OutEvent;

    expect(ev.outsRecorded).toBe(2);
    expect(ev.rbi).toBe(0);
    expect(ev.runnerMovements.some(m => m.to === 'home')).toBe(true); // the run still counts
  });

  it('tag DP (line out, runner doubled off): RBI is kept', () => {
    // Runners 1B+3B, 0 outs — liner caught, R1 doubled off, R3 tags and scores
    const ev = buildPlayEvent(input(LINE, [
      r('r3', 'third', 'home'),
      r('r1', 'first', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { bases: { first: 'r1', third: 'r3' } }), META) as OutEvent;

    expect(ev.outsRecorded).toBe(2);
    expect(ev.rbi).toBe(1);
  });

  it('ground ball, unforced runner thrown out: not a force DP, RBI is kept', () => {
    // Runners 2B+3B (1B empty) — batter out at first, R2 tagged out at third
    const a = analyzePlay(input(GROUND, [
      r('r3', 'third', 'home'),
      r('r2', 'second', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { bases: { second: 'r2', third: 'r3' } }));

    expect(a.isForceDP).toBe(false);
    expect(a.rbi).toBe(1);
  });

  it('ordinary ground out with a run scoring credits the RBI', () => {
    const ev = buildPlayEvent(input(GROUND, [
      r('r3', 'third', 'home'),
      r(BATTER, 'batter', 'out'),
    ], { bases: { third: 'r3' } }), META) as OutEvent;

    expect(ev.rbi).toBe(1);
  });
});

describe('out classification', () => {
  it("keeps the scorer's out type on a double play", () => {
    const ev = buildPlayEvent(input(GROUND, [
      r('r1', 'first', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { bases: { first: 'r1' }, notation: '6-4-3' }), META) as OutEvent;

    expect(ev.outType).toBe('ground_out');
    expect(ev.outsRecorded).toBe(2);
    expect(ev.notation).toBe('6-4-3');
  });

  it('sac fly with a runner thrown out at the plate stays a fly out', () => {
    // Runners 2B+3B, 0 outs — R3 scores on the fly, R2 thrown out advancing
    const ev = buildPlayEvent(input(FLY, [
      r('r3', 'third', 'home'),
      r('r2', 'second', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { bases: { second: 'r2', third: 'r3' }, sacrifice: 'fly' }), META) as OutEvent;

    expect(ev.outType).toBe('fly_out');
    expect(ev.sacrifice).toBe('fly');
    expect(ev.outsRecorded).toBe(2);
    expect(ev.rbi).toBe(1);
  });

  it('records one out when only the batter is retired', () => {
    const ev = buildPlayEvent(input(FLY, [r(BATTER, 'batter', 'out')]), META) as OutEvent;
    expect(ev.outsRecorded).toBe(1);
    expect(ev.notation).toBe('?');
  });
});

describe('RBI on errors — MLB 9.04(a)(3), 9.04(b)(2)', () => {
  it('runner on 3B, 0 outs: RBI credited (would have scored anyway)', () => {
    const ev = buildPlayEvent(input(ERROR, [
      r('r3', 'third', 'home'),
      r(BATTER, 'batter', 'first'),
    ], { bases: { third: 'r3' } }), META) as ErrorEvent;

    expect(ev.rbi).toBe(1);
  });

  it('runner on 3B, 2 outs: no RBI (the error extended the inning)', () => {
    const ev = buildPlayEvent(input(ERROR, [
      r('r3', 'third', 'home'),
      r(BATTER, 'batter', 'first'),
    ], { outs: 2, bases: { third: 'r3' } }), META) as ErrorEvent;

    expect(ev.rbi).toBe(0);
  });

  it('runner scoring from 2B on the error: no RBI', () => {
    const ev = buildPlayEvent(input(ERROR, [
      r('r2', 'second', 'home'),
      r(BATTER, 'batter', 'second'),
    ], { bases: { second: 'r2' } }), META) as ErrorEvent;

    expect(ev.rbi).toBe(0);
    expect(ev.baseReached).toBe('second');
  });

  it('two runs score, only the runner from 3B earns the RBI', () => {
    const ev = buildPlayEvent(input(ERROR, [
      r('r3', 'third', 'home'),
      r('r2', 'second', 'home'),
      r(BATTER, 'batter', 'first'),
    ], { bases: { second: 'r2', third: 'r3' } }), META) as ErrorEvent;

    expect(ev.rbi).toBe(1);
  });

  it("the scorer's override wins, capped at the runs that scored", () => {
    const play = [r('r3', 'third', 'home'), r(BATTER, 'batter', 'first')];
    const bases = { third: 'r3' };

    expect(analyzePlay(input(ERROR, play, { bases, rbiOverride: 0 })).rbi).toBe(0);
    expect(analyzePlay(input(ERROR, play, { outs: 2, bases, rbiOverride: 1 })).rbi).toBe(1);
    expect(analyzePlay(input(ERROR, play, { bases, rbiOverride: 5 })).rbi).toBe(1);
  });
});

describe('3rd out on a force — MLB 5.08(a)', () => {
  it('batter makes the 3rd out: a runner marked as scoring is stranded', () => {
    // 2 outs, runner on 3B, ground out
    const a = analyzePlay(input(GROUND, [
      r('r3', 'third', 'home'),
      r(BATTER, 'batter', 'out'),
    ], { outs: 2, bases: { third: 'r3' } }));

    expect(a.runsWiped).toBe(1);
    expect(a.runsScored).toBe(0);
    expect(a.rbi).toBe(0);
    expect(a.movements).toEqual([{ runnerId: BATTER, from: 'batter', to: 'out' }]);
  });

  it("fielder's choice, forced runner is the 3rd out: no run", () => {
    // 2 outs, runners 1B+3B — force at second
    const ev = buildPlayEvent(input({ kind: 'fielders_choice' }, [
      r('r3', 'third', 'home'),
      r('r1', 'first', 'out'),
      r(BATTER, 'batter', 'first'),
    ], { outs: 2, bases: { first: 'r1', third: 'r3' } }), META);

    expect(ev.runnerMovements.some(m => m.to === 'home')).toBe(false);
    expect('rbi' in ev && ev.rbi).toBe(0);
  });

  it('unforced runner tagged for the 3rd out: timing play, the run stands', () => {
    // 2 outs, runners 2B+3B (1B empty) — R2 tagged going to third
    const a = analyzePlay(input({ kind: 'fielders_choice' }, [
      r('r3', 'third', 'home'),
      r('r2', 'second', 'out'),
      r(BATTER, 'batter', 'first'),
    ], { outs: 2, bases: { second: 'r2', third: 'r3' } }));

    expect(a.runsWiped).toBe(0);
    expect(a.runsScored).toBe(1);
  });

  it('batter thrown out stretching a hit for the 3rd out: the run stands', () => {
    const a = analyzePlay(input({ kind: 'hit', hitType: 'single' }, [
      r('r2', 'second', 'home'),
      r(BATTER, 'batter', 'out'),
    ], { outs: 2, bases: { second: 'r2' } }));

    expect(a.runsWiped).toBe(0);
    expect(a.rbi).toBe(1);
  });

  it('inning-ending ground-ball DP with a run marked: left to the scorer, and flagged', () => {
    // 1 out, runners 1B+3B. 6-4-3 wipes the run; 3-6 (reverse force) is a
    // timing play. The order isn't recorded, so the run is kept but flagged.
    const a = analyzePlay(input(GROUND, [
      r('r3', 'third', 'home'),
      r('r1', 'first', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { outs: 1, bases: { first: 'r1', third: 'r3' } }));

    expect(a.runDependsOnOutOrder).toBe(true);
    expect(a.runsWiped).toBe(0);
    expect(a.runsScored).toBe(1);
    expect(a.rbi).toBe(0); // force or reverse-force — no RBI either way
  });

  it('does not flag a double play that leaves the inning alive', () => {
    const a = analyzePlay(input(GROUND, [
      r('r3', 'third', 'home'),
      r('r1', 'first', 'out'),
      r(BATTER, 'batter', 'out'),
    ], { outs: 0, bases: { first: 'r1', third: 'r3' } }));

    expect(a.runDependsOnOutOrder).toBe(false);
  });
});

describe('runner movements', () => {
  it('omits runners who stay put and runners left unresolved', () => {
    const ev = buildPlayEvent(input({ kind: 'hit', hitType: 'single' }, [
      r('r3', 'third', 'third'),
      r('r2', 'second', null),
      r(BATTER, 'batter', 'first'),
    ], { bases: { second: 'r2', third: 'r3' } }), META);

    expect(ev.runnerMovements).toEqual([{ runnerId: BATTER, from: 'batter', to: 'first' }]);
  });

  it('carries the error charged on a hit', () => {
    const ev = buildPlayEvent(input({ kind: 'hit', hitType: 'single' }, [
      r(BATTER, 'batter', 'second'),
    ], { hitError: { fielderPosition: 9 } }), META);

    expect(ev.type === 'hit' && ev.error).toEqual({ fielderPosition: 9 });
  });

  it('dropped third strike: safe unless the batter is put out', () => {
    const safe = buildPlayEvent(input({ kind: 'dropped_third_strike' }, [r(BATTER, 'batter', 'first')]), META);
    const out = buildPlayEvent(input({ kind: 'dropped_third_strike' }, [r(BATTER, 'batter', 'out')]), META);

    expect(safe.type === 'dropped_third_strike' && safe.safe).toBe(true);
    expect(out.type === 'dropped_third_strike' && out.safe).toBe(false);
  });

  it('stamps the event with the state it was recorded in', () => {
    const ev = buildPlayEvent(input(FLY, [r(BATTER, 'batter', 'out')], { outs: 1 }), META);
    expect(ev).toMatchObject({ id: 'ev-1', inning: 1, halfInning: 'top', outsBefore: 1, batterId: BATTER });
  });
});
