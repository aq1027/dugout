import { useState, useCallback, useEffect } from 'react';
import type { Id, Base, PositionNumber, PitchResult } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';
import type { Pitch, RunnerMovement, PlayEvent } from '../../models/play';
import type { DerivedGameState, Game } from '../../models/game';
import type { Player } from '../../models/player';
import { displayPlayerName } from '../../models/player';
import { generateId } from '../../utils/id';
import { getDefaultRunnerStates } from '../../engine/autoAdvance';
import type { AutoAdvanceOutcome } from '../../engine/autoAdvance';
import { countFromPitches } from '../../engine/gameEngine';
import { analyzePlay, buildPlayEvent } from '../../engine/playBuilder';
import type { PlayInput, PlayOutcome, ResolvedRunner } from '../../engine/playBuilder';

// ─── Types ──────────────────────────────────────
type ScoringPhase = 'pitch' | 'outcome' | 'runners';
type OutcomeType = PlayOutcome;
type RunnerState = ResolvedRunner;

// ─── Props ──────────────────────────────────────
interface AtBatPanelProps {
  game: Game;
  state: DerivedGameState;
  players: Map<Id, Player>;
  onEvent: (event: PlayEvent) => void;
  /**
   * Pitches to resume with after an undo put this batter back at the plate.
   * Read once on mount — GamePage remounts the panel whenever the batter changes.
   */
  restoredPitches?: Pitch[] | null;
  onCountChange?: (count: { balls: number; strikes: number }) => void;
  onPitchCountChange?: (count: number) => void;
}

// ─── Helpers ────────────────────────────────────
function getCurrentBatter(game: Game, state: DerivedGameState): { playerId: Id; orderIndex: number } {
  const isAway = state.halfInning === 'top';
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const batterIndex = isAway ? state.awayBatterIndex : state.homeBatterIndex;
  const slot = lineup.startingOrder[batterIndex % lineup.startingOrder.length];
  return { playerId: slot.playerId, orderIndex: batterIndex };
}

function getPlayerDisplay(players: Map<Id, Player>, playerId: Id): string {
  const p = players.get(playerId);
  if (!p) return 'Unknown';
  return displayPlayerName(p);
}

function getPlayerShort(players: Map<Id, Player>, playerId: Id): string {
  const p = players.get(playerId);
  if (!p) return '??';
  return p.lastName || p.firstName || (p.number != null ? `#${p.number}` : '??');
}

function baseLabel(b: Base | 'batter'): string {
  if (b === 'batter') return 'Batter';
  if (b === 'first') return '1B';
  if (b === 'second') return '2B';
  if (b === 'third') return '3B';
  return b;
}

export function AtBatPanel({ game, state, players, onEvent, restoredPitches, onCountChange, onPitchCountChange }: AtBatPanelProps) {
  const [phase, setPhase] = useState<ScoringPhase>('pitch');
  const [pitches, setPitches] = useState<Pitch[]>(() => restoredPitches ?? state.currentAtBatPitches ?? []);
  const [count, setCount] = useState(() => countFromPitches(restoredPitches ?? state.currentAtBatPitches ?? []));
  const [outcome, setOutcome] = useState<OutcomeType | null>(null);
  const [notationPositions, setNotationPositions] = useState<PositionNumber[]>([]);
  const [runners, setRunners] = useState<RunnerState[]>([]);
  const [sacrifice, setSacrifice] = useState<'fly' | 'bunt' | undefined>(undefined);
  const [hitError, setHitError] = useState<{ fielderPosition: PositionNumber } | null>(null);
  // Scorer's RBI call on an error play; null = use the rule-based default
  const [rbiOverride, setRbiOverride] = useState<number | null>(null);

  const batter = getCurrentBatter(game, state);

  // On mount (key change), sync parent with initial count (may be restored from undo)
  useEffect(() => {
    onCountChange?.(count);
    onPitchCountChange?.(pitches.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAtBat = useCallback(() => {
    setPhase('pitch');
    setPitches([]);
    setCount({ balls: 0, strikes: 0 });
    setOutcome(null);
    setNotationPositions([]);
    setRunners([]);
    setSacrifice(undefined);
    setHitError(null);
    setRbiOverride(null);
    onCountChange?.({ balls: 0, strikes: 0 });
    onPitchCountChange?.(0);
  }, [onCountChange, onPitchCountChange]);

  // ─── Pitch undo handler ────────────────────
  const handleUndoPitch = useCallback(() => {
    if (pitches.length === 0) return;
    const newPitches = pitches.slice(0, -1);
    setPitches(newPitches);
    onPitchCountChange?.(newPitches.length);

    const newCount = countFromPitches(newPitches);
    setCount(newCount);
    onCountChange?.(newCount);
  }, [pitches, onCountChange, onPitchCountChange]);

  // ─── Build runner states for resolution ─────
  const buildRunnerStates = useCallback((outcomeVal: OutcomeType): RunnerState[] => {
    // Map AtBatPanel OutcomeType → AutoAdvanceOutcome
    const aaOutcome: AutoAdvanceOutcome =
      outcomeVal.kind === 'hit' ? { kind: 'hit', hitType: outcomeVal.hitType } :
      outcomeVal.kind === 'out' ? { kind: 'out', outType: outcomeVal.outType } :
      outcomeVal.kind === 'error' ? { kind: 'error' } :
      outcomeVal.kind === 'fielders_choice' ? { kind: 'fielders_choice' } :
      { kind: 'dropped_third_strike' };

    const defaults = getDefaultRunnerStates(aaOutcome, state.bases, state.outs, batter.playerId);
    return defaults.map(d => ({ runnerId: d.runnerId, from: d.from, to: d.to }));
  }, [state.bases, batter.playerId]);

  // ─── Pitch handler ──────────────────────────
  const handlePitch = useCallback((result: PitchResult) => {
    const pitch: Pitch = { result };
    const newPitches = [...pitches, pitch];
    setPitches(newPitches);
    onPitchCountChange?.(newPitches.length);

    if (result === 'ball' || result === 'pitch_clock_ball') {
      const newBalls = count.balls + 1;
      if (newBalls >= 4) {
        // Walk — auto-resolve
        const mvs: RunnerMovement[] = [];
        mvs.push({ runnerId: batter.playerId, from: 'batter', to: 'first' });
        // Force advance runners
        if (state.bases.first) {
          mvs.push({ runnerId: state.bases.first, from: 'first', to: 'second' });
          if (state.bases.second) {
            mvs.push({ runnerId: state.bases.second, from: 'second', to: 'third' });
            if (state.bases.third) {
              mvs.push({ runnerId: state.bases.third, from: 'third', to: 'home' });
            }
          }
        }
        const rbi = mvs.filter(m => m.to === 'home').length;
        const event: PlayEvent = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: newPitches,
          runnerMovements: mvs,
          type: 'walk',
          intentional: false,
          rbi,
        };
        onEvent(event);
        resetAtBat();
        return;
      }
      setCount({ ...count, balls: newBalls });
      onCountChange?.({ ...count, balls: newBalls });
    } else if (result === 'strike_swinging' || result === 'strike_looking' || result === 'pitch_clock_strike') {
      const newStrikes = count.strikes + 1;
      if (newStrikes >= 3) {
        // Strikeout
        const event: PlayEvent = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: newPitches,
          runnerMovements: [],
          type: 'strikeout',
          looking: result === 'strike_looking',
        };
        onEvent(event);
        resetAtBat();
        return;
      }
      setCount({ ...count, strikes: newStrikes });
      onCountChange?.({ ...count, strikes: newStrikes });
    } else if (result === 'foul') {
      // Foul only adds strike if less than 2 strikes
      if (count.strikes < 2) {
        const newCount = { ...count, strikes: count.strikes + 1 };
        setCount(newCount);
        onCountChange?.(newCount);
      }
    } else if (result === 'in_play') {
      setPhase('outcome');
    }
  }, [pitches, count, state, batter, onEvent, resetAtBat, onCountChange, onPitchCountChange]);

  // ─── HBP handler ────────────────────────────
  const handleHBP = useCallback(() => {
    const newPitches = [...pitches, { result: 'ball' as PitchResult }];
    const mvs: RunnerMovement[] = [];
    mvs.push({ runnerId: batter.playerId, from: 'batter', to: 'first' });
    // Force advance runners
    if (state.bases.first) {
      mvs.push({ runnerId: state.bases.first, from: 'first', to: 'second' });
      if (state.bases.second) {
        mvs.push({ runnerId: state.bases.second, from: 'second', to: 'third' });
        if (state.bases.third) {
          mvs.push({ runnerId: state.bases.third, from: 'third', to: 'home' });
        }
      }
    }
    const rbi = mvs.filter(m => m.to === 'home').length;
    const event: PlayEvent = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      inning: state.inning,
      halfInning: state.halfInning,
      outsBefore: state.outs,
      batterId: batter.playerId,
      pitchSequence: newPitches,
      runnerMovements: mvs,
      type: 'hit_by_pitch',
      rbi,
    };
    onEvent(event);
    resetAtBat();
  }, [pitches, state, batter, onEvent, resetAtBat]);

  // ─── Outcome selection ──────────────────────
  const handleOutcome = useCallback((o: OutcomeType) => {
    setOutcome(o);
    setRbiOverride(null);
    if (o.kind === 'hit' && o.hitType === 'home_run') {
      // HR — auto-resolve all runners to home, dispatch immediately
      const rs = buildRunnerStates(o);
      const mvs: RunnerMovement[] = rs.map(r => ({
        runnerId: r.runnerId,
        from: r.from,
        to: r.to as Base,
      }));
      const rbi = mvs.filter(m => m.to === 'home').length;
      const event: PlayEvent = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        inning: state.inning,
        halfInning: state.halfInning,
        outsBefore: state.outs,
        batterId: batter.playerId,
        pitchSequence: pitches,
        runnerMovements: mvs,
        type: 'hit',
        hitType: 'home_run',
        rbi,
      };
      onEvent(event);
      resetAtBat();
      return;
    }

    // Everything else goes to runner resolution
    const rs = buildRunnerStates(o);
    setRunners(rs);
    setPhase('runners');
  }, [buildRunnerStates, state, batter.playerId, pitches, onEvent, resetAtBat]);

  // ─── Notation builder for outs ──────────────
  const notation = notationPositions.join('-');
  const handleNotationPosition = useCallback((pos: PositionNumber) => {
    setNotationPositions(prev => [...prev, pos]);
  }, []);

  // Pop the last tap. Positions repeat legitimately (1-3-1 rundown), so the
  // buttons must not toggle — this is the only way to correct a mis-tap.
  const handleNotationBackspace = useCallback(() => {
    setNotationPositions(prev => prev.slice(0, -1));
  }, []);

  // ─── Runner destination ─────────────────────
  const handleRunnerDest = useCallback((runnerId: Id, dest: Base | 'out') => {
    setRunners(prev => prev.map(r =>
      r.runnerId === runnerId ? { ...r, to: dest } : r
    ));
  }, []);

  // ─── Submit play ────────────────────────────
  // The rules that turn the scorer's taps into an event (RBI, out type, whether
  // a run counts) live in engine/playBuilder so they can be unit-tested.
  const playInput = (o: OutcomeType): PlayInput => ({
    outcome: o,
    runners,
    state,
    batterId: batter.playerId,
    pitches,
    notation,
    sacrifice,
    hitError,
    rbiOverride,
  });

  const handleSubmitPlay = () => {
    if (!outcome) return;
    onEvent(buildPlayEvent(playInput(outcome), {
      id: generateId(),
      timestamp: new Date().toISOString(),
    }));
    resetAtBat();
  };

  // ─── Render: Batter info ────────────────────
  const renderBatterInfo = () => (
    <div className="batter-info">
      <span className="at-the-plate-label">At the Plate</span>
      <span className="batter-order">#{batter.orderIndex + 1}</span>
      <span className="batter-name">{getPlayerDisplay(players, batter.playerId)}</span>
    </div>
  );

  // ─── Render: Pitch phase ────────────────────
  const renderPitchPhase = () => (
    <div className="pitch-layout">
      {/* Left — Ball (tall) */}
      <button className="pitch-btn pitch-tall ball" onClick={() => handlePitch('ball')}>
        <span className="pitch-tall-label">Ball</span>
        <span className="pitch-tall-count">{count.balls}</span>
      </button>

      {/* Center column */}
      <div className="pitch-center">
        <div className="count-display">{count.balls}-{count.strikes}</div>
        <button className="pitch-btn foul" onClick={() => handlePitch('foul')}>Foul</button>
        <button className="pitch-btn in-play" onClick={() => handlePitch('in_play')}>In Play →</button>
        <button className="pitch-btn hbp" onClick={handleHBP}>HBP</button>
        <div className="pitch-center-row">
          <button className="pitch-btn clock" onClick={() => handlePitch('pitch_clock_ball')}>⏱ B</button>
          <button className="pitch-btn clock" onClick={() => handlePitch('pitch_clock_strike')}>⏱ K</button>
        </div>
        <button
          className="pitch-btn undo"
          onClick={handleUndoPitch}
          style={pitches.length === 0 ? { visibility: 'hidden' } : undefined}
        >
          ↩ Undo Pitch
        </button>
      </div>

      {/* Right — Strike (split: Swing top, Looking bottom) */}
      <div className="pitch-tall-split">
        <button className="pitch-btn pitch-tall-half strike" onClick={() => handlePitch('strike_swinging')}>
          <span className="pitch-tall-label">Swing</span>
          <span className="pitch-tall-count">{count.strikes}</span>
        </button>
        <button className="pitch-btn pitch-tall-half strike looking" onClick={() => handlePitch('strike_looking')}>
          <span className="pitch-tall-label">Looking</span>
          <span className="pitch-tall-label">👀</span>
        </button>
      </div>
    </div>
  );

  // ─── Render: Outcome phase ──────────────────
  const renderOutcomePhase = () => (
    <div className="outcome-panel">
      <div className="outcome-section">
        <span className="outcome-section-label">Hits</span>
        <div className="outcome-grid">
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'hit', hitType: 'single' })}>1B</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'hit', hitType: 'double' })}>2B</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'hit', hitType: 'triple' })}>3B</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'hit', hitType: 'home_run' })}>HR</button>
        </div>
      </div>

      <div className="outcome-section">
        <span className="outcome-section-label">Outs</span>
        <div className="outcome-grid">
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'out', outType: 'ground_out' })}>Ground</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'out', outType: 'fly_out' })}>Fly</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'out', outType: 'line_out' })}>Line</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'out', outType: 'popup' })}>Popup</button>
        </div>
      </div>

      <div className="outcome-section">
        <span className="outcome-section-label">Other</span>
        <div className="outcome-grid">
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'fielders_choice' })}>FC</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'error', position: 1 })}>Error</button>
          <button className="outcome-btn" onClick={() => handleOutcome({ kind: 'dropped_third_strike' })}>Drop K</button>
          <button className="outcome-btn" onClick={() => {
            // Remove the in_play pitch that was added when entering outcome phase
            setPitches(prev => {
              const updated = prev.filter((_, i) => i !== prev.length - 1 || prev[prev.length - 1].result !== 'in_play'
                ? true : false);
              onPitchCountChange?.(updated.length);
              return updated;
            });
            setPhase('pitch');
          }}>← Back</button>
        </div>
      </div>
    </div>
  );

  // ─── Render: Runner resolution ──────────────
  const renderRunnerPhase = () => {
    // Count outs already marked in runner resolution
    const outsMarked = runners.filter(r => r.to === 'out').length;
    const totalOuts = state.outs + outsMarked;
    const inningOver = totalOuts >= 3;

    // All resolved when either:
    // (a) every runner has a destination, OR
    // (b) the inning is over (3+ outs) — unresolved runners are stranded
    const allResolved = inningOver
      ? runners.some(r => r.to === 'out')  // at least one out recorded
      : runners.every(r => r.to !== null);

    const showNotation = outcome?.kind === 'out' || outcome?.kind === 'fielders_choice';
    const analysis = outcome ? analyzePlay(playInput(outcome)) : null;

    return (
      <div className="runner-panel">
        <div className="runner-panel-header">
          <span className="outcome-section-label">Move Runners</span>
          <span className={`outs-pill${inningOver ? ' inning-over' : ''}`}>
            <span className="outs-dots">
              {[0, 1, 2].map(i => (
                <span key={i} className={`outs-dot${i < Math.min(totalOuts, 3) ? ' filled' : ''}`} />
              ))}
            </span>
            {inningOver ? '3 OUTS' : `${totalOuts} OUT${totalOuts === 1 ? '' : 'S'}`}
          </span>
        </div>

        {showNotation && (
          <div className="notation-builder">
            <div className="notation-display">{notation || 'Tap positions for fielding notation'}</div>
            <div className="position-grid">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9] as PositionNumber[]).map(pos => {
                // Every tap index for this position — a rundown like 1-3-1 repeats one
                const order = notationPositions
                  .map((p, idx) => (p === pos ? idx + 1 : null))
                  .filter((n): n is number => n !== null);
                return (
                  <button
                    key={pos}
                    className={`position-btn${order.length > 0 ? ' selected' : ''}`}
                    onClick={() => handleNotationPosition(pos)}
                  >
                    {order.length > 0 && (
                      <span className="position-btn-order">{order.join(',')}</span>
                    )}
                    {POSITION_LABELS[pos]} ({pos})
                  </button>
                );
              })}
              <button
                className="position-btn"
                onClick={handleNotationBackspace}
                disabled={notationPositions.length === 0}
                aria-label="Undo last position tap"
              >
                ⌫
              </button>
              <button
                className="position-btn"
                onClick={() => setNotationPositions([])}
                disabled={notationPositions.length === 0}
              >
                Clear
              </button>
            </div>
            {outcome?.kind === 'out' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`outcome-btn${sacrifice === 'fly' ? ' selected' : ''}`}
                  onClick={() => {
                    const newSac = sacrifice === 'fly' ? undefined : 'fly' as const;
                    setSacrifice(newSac);
                    // Rebuild runner defaults with sacrifice info
                    const aaOutcome: AutoAdvanceOutcome = { kind: 'out', outType: outcome.outType, sacrifice: newSac };
                    const defaults = getDefaultRunnerStates(aaOutcome, state.bases, state.outs, batter.playerId);
                    setRunners(defaults.map(d => ({ runnerId: d.runnerId, from: d.from, to: d.to })));
                  }}
                >
                  Sac Fly
                </button>
                <button
                  className={`outcome-btn${sacrifice === 'bunt' ? ' selected' : ''}`}
                  onClick={() => {
                    const newSac = sacrifice === 'bunt' ? undefined : 'bunt' as const;
                    setSacrifice(newSac);
                    // Rebuild runner defaults with sacrifice info
                    const aaOutcome: AutoAdvanceOutcome = { kind: 'out', outType: outcome.outType, sacrifice: newSac };
                    const defaults = getDefaultRunnerStates(aaOutcome, state.bases, state.outs, batter.playerId);
                    setRunners(defaults.map(d => ({ runnerId: d.runnerId, from: d.from, to: d.to })));
                  }}
                >
                  Sac Bunt
                </button>
              </div>
            )}
            {sacrifice === 'bunt' && (
              <div className="helper-hint">
                Batter out at 1B, runner(s) advance. If batter is safe, use FC instead.
              </div>
            )}
            {sacrifice === 'fly' && (
              <div className="helper-hint">
                Batter out on fly ball, runner tags and scores. Requires {'<'} 2 outs.
              </div>
            )}
          </div>
        )}

        {outcome?.kind === 'error' && (
          <div className="notation-builder">
            <span className="outcome-section-label">Error by position</span>
            <div className="position-grid">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9] as PositionNumber[]).map(pos => (
                <button
                  key={pos}
                  className={`position-btn${outcome.position === pos ? ' selected' : ''}`}
                  onClick={() => setOutcome({ kind: 'error', position: pos })}
                >
                  {POSITION_LABELS[pos]} ({pos})
                </button>
              ))}
            </div>
          </div>
        )}

        {runners.map(r => {
          const possibleDests = getDestinations(r.from);
          const isBatterLocked = r.from === 'batter' && sacrifice != null;

          return (
            <div className="runner-row" key={r.runnerId}>
              <span className="runner-from">{baseLabel(r.from)}</span>
              <span className="runner-name">{getPlayerShort(players, r.runnerId)}</span>
              <div className="runner-destinations">
                {possibleDests.map(dest => (
                  <button
                    key={dest}
                    className={`runner-dest-btn${
                      r.to === dest
                        ? dest === 'out'
                          ? ' out-selected'
                          : dest === 'home'
                            ? ' home-selected'
                            : ' selected'
                        : ''
                    }`}
                    onClick={() => handleRunnerDest(r.runnerId, dest)}
                    disabled={isBatterLocked}
                  >
                    {dest === r.from ? 'Stay' : dest === 'home' ? 'Scored' : dest === 'out' ? 'OUT' : baseLabel(dest)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* 3rd out is a force — MLB 5.08(a) */}
        {analysis && analysis.runsWiped > 0 && (
          <div className="helper-hint warning">
            No run scores — the 3rd out is a force out. {analysis.runsWiped === 1 ? 'That runner is' : 'Those runners are'} left on base.
          </div>
        )}
        {analysis?.runDependsOnOutOrder && (
          <div className="helper-hint warning">
            If the force was the last out (e.g. 6-4-3), the run does not count — set that runner to Stay.
            It scores only if the batter was retired first and the runner was then tagged.
          </div>
        )}

        {/* GIDP RBI — MLB 9.04(b)(1) */}
        {analysis?.isForceDP && analysis.runsScored > 0 && (
          <div className="helper-hint">
            No RBI is credited on a force double play, even if a run scores (MLB 9.04(b)).
          </div>
        )}

        {/* RBI on an error is the scorer's call — MLB 9.04(a)(3), 9.04(b)(2) */}
        {outcome?.kind === 'error' && analysis && analysis.runsScored > 0 && (
          <>
            <div className="runner-row">
              <span className="runner-from">RBI</span>
              <span className="runner-name">Credited</span>
              <div className="runner-destinations">
                {Array.from({ length: analysis.runsScored + 1 }, (_, n) => (
                  <button
                    key={n}
                    className={`runner-dest-btn${analysis.rbi === n ? ' selected' : ''}`}
                    onClick={() => setRbiOverride(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="helper-hint">
              A run that scores on an error earns no RBI — unless a runner on 3B would have scored anyway with fewer than 2 outs.
            </div>
          </>
        )}

        {/* Error on play — only for hits */}
        {outcome?.kind === 'hit' && (
          <div className="notation-builder">
            <span className="outcome-section-label">Error on play?</span>
            <div className="position-grid">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9] as PositionNumber[]).map(pos => (
                <button
                  key={pos}
                  className={`position-btn${hitError?.fielderPosition === pos ? ' selected' : ''}`}
                  onClick={() => setHitError(hitError?.fielderPosition === pos ? null : { fielderPosition: pos })}
                >
                  {POSITION_LABELS[pos]} ({pos})
                </button>
              ))}
              {hitError && (
                <button className="position-btn" onClick={() => setHitError(null)}>Clear</button>
              )}
            </div>
          </div>
        )}

        {/* Outs status lives in the panel header (.outs-pill) — keeping it out of
            the action bar stops it squeezing "Record Play" on narrow screens. */}
        <div className="action-bar">
          <button onClick={() => { setPhase('outcome'); setRunners([]); setNotationPositions([]); setSacrifice(undefined); setHitError(null); setRbiOverride(null); }}>
            ← Back
          </button>
          <button className="primary" disabled={!allResolved} onClick={handleSubmitPlay}>
            Record Play ✓
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {renderBatterInfo()}
      {phase === 'pitch' && renderPitchPhase()}
      {phase === 'outcome' && renderOutcomePhase()}
      {phase === 'runners' && renderRunnerPhase()}
    </div>
  );
}

// ─── Utility ────────────────────────────────────
function getDestinations(from: Base | 'batter'): (Base | 'out')[] {
  switch (from) {
    case 'batter': return ['first', 'second', 'third', 'home', 'out'];
    case 'first': return ['first', 'second', 'third', 'home', 'out'];
    case 'second': return ['second', 'third', 'home', 'out'];
    case 'third': return ['third', 'home', 'out'];
    default: return ['out'];
  }
}
