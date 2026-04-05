import { useState, useCallback } from 'react';
import type { Id, Base, PositionNumber, PitchResult } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';
import type { Pitch, RunnerMovement, PlayEvent } from '../../models/play';
import type { DerivedGameState, Game } from '../../models/game';
import type { Player } from '../../models/player';
import { generateId } from '../../utils/id';

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
  const num = p.number != null ? `#${p.number} ` : '';
  return `${num}${p.firstName} ${p.lastName}`;
}

function getPlayerShort(players: Map<Id, Player>, playerId: Id): string {
  const p = players.get(playerId);
  if (!p) return '??';
  return p.lastName || p.firstName || '??';
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
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [count, setCount] = useState({ balls: 0, strikes: 0 });
  const [outcome, setOutcome] = useState<OutcomeType | null>(null);
  const [notation, setNotation] = useState('');
  const [runners, setRunners] = useState<RunnerState[]>([]);
  const [sacrifice, setSacrifice] = useState<'fly' | 'bunt' | undefined>(undefined);

  const batter = getCurrentBatter(game, state);

  const resetAtBat = useCallback(() => {
    setPhase('pitch');
    setPitches([]);
    setCount({ balls: 0, strikes: 0 });
    setOutcome(null);
    setNotation('');
    setRunners([]);
    setSacrifice(undefined);
    onCountChange?.({ balls: 0, strikes: 0 });
    onPitchCountChange?.(0);
  }, [onCountChange, onPitchCountChange]);

  // ─── Build runner states for resolution ─────
  const buildRunnerStates = useCallback((outcomeVal: OutcomeType): RunnerState[] => {
    const rs: RunnerState[] = [];

    // Runners on base
    if (state.bases.third) rs.push({ runnerId: state.bases.third, from: 'third', to: null });
    if (state.bases.second) rs.push({ runnerId: state.bases.second, from: 'second', to: null });
    if (state.bases.first) rs.push({ runnerId: state.bases.first, from: 'first', to: null });

    // Batter
    rs.push({ runnerId: batter.playerId, from: 'batter', to: null });

    // Auto-resolve some outcomes
    if (outcomeVal.kind === 'hit') {
      const batterRunner = rs.find(r => r.from === 'batter')!;
      switch (outcomeVal.hitType) {
        case 'single':
          batterRunner.to = 'first';
          break;
        case 'double':
          batterRunner.to = 'second';
          break;
        case 'triple':
          batterRunner.to = 'third';
          break;
        case 'home_run':
          // Everyone scores
          for (const r of rs) r.to = 'home';
          return rs;
      }
      // Auto-advance forced runners on singles
      if (outcomeVal.hitType === 'single') {
        autoAdvanceForced(rs);
      }
    }

    return rs;
  }, [state.bases, batter.playerId]);

  // ─── Pitch handler ──────────────────────────
  const handlePitch = useCallback((result: PitchResult) => {
    const pitch: Pitch = { result };
    const newPitches = [...pitches, pitch];
    setPitches(newPitches);
    onPitchCountChange?.(newPitches.length);

    if (result === 'ball') {
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
    } else if (result === 'strike_swinging' || result === 'strike_looking') {
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

    // If bases are empty and it's a simple hit (not HR, already handled above), 
    // auto-resolve the batter and skip runner resolution
    const rs = buildRunnerStates(o);
    const basesEmpty = !state.bases.first && !state.bases.second && !state.bases.third;
    if (basesEmpty && o.kind === 'hit') {
      // Only the batter, already placed by buildRunnerStates
      const mvs: RunnerMovement[] = rs.map(r => ({
        runnerId: r.runnerId,
        from: r.from,
        to: r.to!,
      }));
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
        hitType: o.hitType,
        rbi: 0,
      };
      onEvent(event);
      resetAtBat();
      return;
    }

    // Everything else goes to runner resolution
    setRunners(rs);
    setPhase('runners');
  }, [buildRunnerStates, state, batter.playerId, pitches, onEvent, resetAtBat]);

  // ─── Notation builder for outs ──────────────
  const handleNotationPosition = useCallback((pos: PositionNumber) => {
    setNotation(prev => prev ? `${prev}-${pos}` : `${pos}`);
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
    const activeRunners = runners.filter(r => r.to !== null);
    // Only check runners that existed on base + batter
    const mvs: RunnerMovement[] = activeRunners.map(r => ({
      runnerId: r.runnerId,
      from: r.from,
      to: r.to!,
    }));

    const rbi = mvs.filter(m => m.to === 'home').length;
    const outsRecorded = mvs.filter(m => m.to === 'out').length;

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
          rbi,
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
  }, [outcome, runners, state, batter, pitches, notation, sacrifice, onEvent, resetAtBat]);

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
      <div className="pitch-buttons">
        <button className="pitch-btn ball" onClick={() => handlePitch('ball')}>
          Ball ({count.balls})
        </button>
        <button className="pitch-btn strike" onClick={() => handlePitch('strike_swinging')}>
          Strike ✕ ({count.strikes})
        </button>
        <button className="pitch-btn foul" onClick={() => handlePitch('foul')}>
          Foul
        </button>
        <button className="pitch-btn strike" onClick={() => handlePitch('strike_looking')}>
          Strike 👀
        </button>
        <button className="pitch-btn in-play" onClick={() => handlePitch('in_play')}>
          In Play →
        </button>
        <button className="pitch-btn ball" onClick={handleHBP}>
          HBP
        </button>
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
          <button className="outcome-btn" onClick={() => { setPhase('pitch'); }}>← Back</button>
        </div>
      </div>
    </div>
  );

  // ─── Render: Runner resolution ──────────────
  const renderRunnerPhase = () => {
    const allResolved = runners.every(r => r.to !== null);
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
                  className="position-btn"
                  onClick={() => handleNotationPosition(pos)}
                >
                  {pos} {POSITION_LABELS[pos]}
                </button>
              ))}
              <button className="position-btn" onClick={() => setNotation('')}>Clear</button>
            </div>
            {outcome?.kind === 'out' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`outcome-btn${sacrifice === 'fly' ? ' selected' : ''}`}
                  onClick={() => setSacrifice(sacrifice === 'fly' ? undefined : 'fly')}
                >
                  Sac Fly
                </button>
                <button
                  className={`outcome-btn${sacrifice === 'bunt' ? ' selected' : ''}`}
                  onClick={() => setSacrifice(sacrifice === 'bunt' ? undefined : 'bunt')}
                >
                  Sac Bunt
                </button>
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
                  {pos} {POSITION_LABELS[pos]}
                </button>
              ))}
            </div>
          </div>
        )}

        <span className="outcome-section-label">Move Runners</span>
        {runners.map(r => {
          const possibleDests = getDestinations(r.from);

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
                  >
                    {dest === 'home' ? 'H' : dest === 'out' ? 'OUT' : baseLabel(dest)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="action-bar">
          <button onClick={() => { setPhase('outcome'); setRunners([]); setNotation(''); setSacrifice(undefined); }}>
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
    case 'first': return ['second', 'third', 'home', 'out'];
    case 'second': return ['third', 'home', 'out'];
    case 'third': return ['home', 'out'];
    default: return ['out'];
  }
}

function autoAdvanceForced(runners: RunnerState[]): void {
  // On a single, force advance runners from first
  const onFirst = runners.find(r => r.from === 'first');
  if (onFirst && onFirst.to === null) {
    onFirst.to = 'second';
    // If someone was on second, they may need to advance too
    const onSecond = runners.find(r => r.from === 'second');
    if (onSecond && onSecond.to === null) {
      onSecond.to = 'third';
      const onThird = runners.find(r => r.from === 'third');
      if (onThird && onThird.to === null) {
        onThird.to = 'home';
      }
    }
  }
}
