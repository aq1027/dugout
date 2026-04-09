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

// ─── Types ──────────────────────────────────────
type ScoringPhase = 'pitch' | 'outcome' | 'runners';

type OutcomeType =
  | { kind: 'hit'; hitType: 'single' | 'double' | 'triple' | 'home_run' }
  | { kind: 'out'; outType: 'ground_out' | 'fly_out' | 'line_out' | 'popup' }
  | { kind: 'error'; position: PositionNumber }
  | { kind: 'fielders_choice' }
  | { kind: 'dropped_third_strike' };

interface RunnerState {
  runnerId: Id;
  from: Base | 'batter';
  to: Base | 'out' | null;
}

// ─── Props ──────────────────────────────────────
interface AtBatPanelProps {
  game: Game;
  state: DerivedGameState;
  players: Map<Id, Player>;
  onEvent: (event: PlayEvent) => void;
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

export function AtBatPanel({ game, state, players, onEvent, onCountChange, onPitchCountChange }: AtBatPanelProps) {
  const [phase, setPhase] = useState<ScoringPhase>('pitch');
  const [pitches, setPitches] = useState<Pitch[]>(() => state.currentAtBatPitches ?? []);
  const [count, setCount] = useState(() => state.count ?? { balls: 0, strikes: 0 });
  const [outcome, setOutcome] = useState<OutcomeType | null>(null);
  const [notationPositions, setNotationPositions] = useState<PositionNumber[]>([]);
  const [runners, setRunners] = useState<RunnerState[]>([]);
  const [sacrifice, setSacrifice] = useState<'fly' | 'bunt' | undefined>(undefined);
  const [hitError, setHitError] = useState<{ fielderPosition: PositionNumber } | null>(null);

  const batter = getCurrentBatter(game, state);

  // On mount (key change), sync parent with initial count (may be restored from undo)
  useEffect(() => {
    const initialCount = state.count ?? { balls: 0, strikes: 0 };
    const initialPitches = state.currentAtBatPitches ?? [];
    onCountChange?.(initialCount);
    onPitchCountChange?.(initialPitches.length);
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
    onCountChange?.({ balls: 0, strikes: 0 });
    onPitchCountChange?.(0);
  }, [onCountChange, onPitchCountChange]);

  // ─── Pitch undo handler ────────────────────
  const handleUndoPitch = useCallback(() => {
    if (pitches.length === 0) return;
    const newPitches = pitches.slice(0, -1);
    setPitches(newPitches);
    onPitchCountChange?.(newPitches.length);

    // Recalculate count from scratch
    let balls = 0;
    let strikes = 0;
    for (const p of newPitches) {
      if (p.result === 'ball' || p.result === 'pitch_clock_ball') {
        balls++;
      } else if (p.result === 'strike_swinging' || p.result === 'strike_looking' || p.result === 'pitch_clock_strike') {
        strikes++;
      } else if (p.result === 'foul' && strikes < 2) {
        strikes++;
      }
    }
    setCount({ balls, strikes });
    onCountChange?.({ balls, strikes });
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

  // ─── Runner destination ─────────────────────
  const handleRunnerDest = useCallback((runnerId: Id, dest: Base | 'out') => {
    setRunners(prev => prev.map(r =>
      r.runnerId === runnerId ? { ...r, to: dest } : r
    ));
  }, []);

  // ─── Submit play ────────────────────────────
  const handleSubmitPlay = useCallback(() => {
    if (!outcome) return;

    // Validate all runners have destinations
    // Filter out runners who stay put (to === from) — no movement needed
    const activeRunners = runners.filter(r => r.to !== null && r.to !== r.from);
    const mvs: RunnerMovement[] = activeRunners.map(r => ({
      runnerId: r.runnerId,
      from: r.from,
      to: r.to!,
    }));

    const rbi = mvs.filter(m => m.to === 'home').length;
    const outsRecorded = mvs.filter(m => m.to === 'out').length;

    // MLB 9.04(b)(1): No RBI on force double play
    const isForceDP = outcome.kind === 'out' && outsRecorded >= 2 &&
      (outcome.outType === 'ground_out' || outsRecorded >= 2);
    const adjustedRbi = isForceDP ? 0 : rbi;

    let event: PlayEvent;

    switch (outcome.kind) {
      case 'hit':
        event = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: pitches,
          runnerMovements: mvs,
          type: 'hit',
          hitType: outcome.hitType,
          rbi,
          ...(hitError ? { error: hitError } : {}),
        };
        break;
      case 'out':
        event = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: pitches,
          runnerMovements: mvs,
          type: 'out',
          outType: outsRecorded >= 3 ? 'triple_play' : outsRecorded >= 2 ? 'double_play' : outcome.outType,
          notation: notation || '?',
          outsRecorded: Math.max(outsRecorded, 1),
          sacrifice,
          rbi: adjustedRbi,
        };
        break;
      case 'error':
        event = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: pitches,
          runnerMovements: mvs,
          type: 'error',
          fielderPosition: outcome.position,
          baseReached: (mvs.find(m => m.from === 'batter')?.to as Base) ?? 'first',
          rbi,
        };
        break;
      case 'fielders_choice':
        event = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: pitches,
          runnerMovements: mvs,
          type: 'fielders_choice',
          notation: notation || 'FC',
          rbi,
        };
        break;
      case 'dropped_third_strike':
        event = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          inning: state.inning,
          halfInning: state.halfInning,
          outsBefore: state.outs,
          batterId: batter.playerId,
          pitchSequence: pitches,
          runnerMovements: mvs,
          type: 'dropped_third_strike',
          safe: !mvs.some(m => m.from === 'batter' && m.to === 'out'),
        };
        break;
    }

    onEvent(event!);
    resetAtBat();
  }, [outcome, runners, state, batter, pitches, notation, sacrifice, hitError, onEvent, resetAtBat]);

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
    <>
      <div className="count-display" style={{ textAlign: 'center', fontSize: '1.3em', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
        {count.balls}-{count.strikes}
      </div>
      <div className="pitch-buttons">
        <button className="pitch-btn ball" onClick={() => handlePitch('ball')}>
          Ball ({count.balls})
        </button>
        <button className="pitch-btn strike" onClick={() => handlePitch('strike_swinging')}>
          Swing ({count.strikes})
        </button>
        <button className="pitch-btn foul" onClick={() => handlePitch('foul')}>
          Foul
        </button>
        <button className="pitch-btn strike" onClick={() => handlePitch('strike_looking')}>
          Looking 👀
        </button>
        <button className="pitch-btn in-play" onClick={() => handlePitch('in_play')}>
          In Play →
        </button>
        <button className="pitch-btn ball" onClick={handleHBP}>
          HBP
        </button>
      </div>
      <div className="pitch-buttons" style={{ marginTop: 6 }}>
        <button className="pitch-btn ball" onClick={() => handlePitch('pitch_clock_ball')} style={{ fontSize: '0.8em' }}>
          ⏱ Clock (Ball)
        </button>
        <button className="pitch-btn strike" onClick={() => handlePitch('pitch_clock_strike')} style={{ fontSize: '0.8em' }}>
          ⏱ Clock (Strike)
        </button>
        {pitches.length > 0 && (
          <button className="pitch-btn" onClick={handleUndoPitch} style={{ fontSize: '0.8em' }}>
            ↩ Undo Pitch
          </button>
        )}
      </div>
    </>
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

    return (
      <div className="runner-panel">
        {showNotation && (
          <div className="notation-builder">
            <div className="notation-display">{notation || 'Tap positions for fielding notation'}</div>
            <div className="position-grid">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9] as PositionNumber[]).map(pos => (
                <button
                  key={pos}
                  className={`position-btn${notationPositions.includes(pos) ? ' selected' : ''}`}
                  onClick={() => handleNotationPosition(pos)}
                >
                  {POSITION_LABELS[pos]} ({pos})
                </button>
              ))}
              <button className="position-btn" onClick={() => setNotationPositions([])}>Clear</button>
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

        <span className="outcome-section-label">Move Runners</span>
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
                    className={`runner-dest-btn${r.to === dest ? (dest === 'out' ? ' out-selected' : ' selected') : ''}`}
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

        {/* GIDP RBI warning — MLB 9.04(b)(1) */}
        {outcome?.kind === 'out' && outsMarked >= 2 && runners.some(r => r.to === 'home') && (
          <div className="helper-hint">
            No RBI is credited on a force double play, even if a run scores (MLB 9.04(b)).
          </div>
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

        <div className="action-bar">
          <button onClick={() => { setPhase('outcome'); setRunners([]); setNotationPositions([]); setSacrifice(undefined); setHitError(null); }}>
            ← Back
          </button>
          {inningOver && (
            <span style={{ fontSize: '0.85em', color: 'var(--color-warning, #b58900)' }}>
              Inning over — remaining runners stranded
            </span>
          )}
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
