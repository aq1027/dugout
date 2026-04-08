import { useState, useCallback } from 'react';
import type { Id, Base } from '../../models/common';
import type { RunnerMovement, PlayEvent } from '../../models/play';
import type { DerivedGameState, Game } from '../../models/game';
import type { Player } from '../../models/player';
import { generateId } from '../../utils/id';
import { getDefaultRunnerStates } from '../../engine/autoAdvance';
import type { AutoAdvanceOutcome } from '../../engine/autoAdvance';

interface BetweenABPanelProps {
  game: Game;
  state: DerivedGameState;
  players: Map<Id, Player>;
  onEvent: (event: PlayEvent) => void;
}

type BetweenAction = 'stolen_base' | 'caught_stealing' | 'wild_pitch' | 'passed_ball' | 'balk' | 'mound_visit' | 'timeout' | 'pickoff' | null;

export function BetweenABPanel({ game, state, players, onEvent }: BetweenABPanelProps) {
  const [action, setAction] = useState<BetweenAction>(null);
  const [selectedRunner, setSelectedRunner] = useState<Id | null>(null);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [pickoffBase, setPickoffBase] = useState<Base | null>(null);
  const [wpPbRunners, setWpPbRunners] = useState<{ runnerId: Id; from: Base; to: Base | 'out' | null }[]>([]);

  const runnersOnBase: { id: Id; base: Base }[] = [];
  if (state.bases.first) runnersOnBase.push({ id: state.bases.first, base: 'first' });
  if (state.bases.second) runnersOnBase.push({ id: state.bases.second, base: 'second' });
  if (state.bases.third) runnersOnBase.push({ id: state.bases.third, base: 'third' });

  const hasRunners = runnersOnBase.length > 0;

  const getPlayerName = (id: Id) => {
    const p = players.get(id);
    if (!p) return '??';
    return p.lastName || p.firstName || (p.number != null ? `#${p.number}` : '??');
  };

  const reset = useCallback(() => {
    setAction(null);
    setSelectedRunner(null);
    setSelectedBase(null);
    setPickoffBase(null);
    setWpPbRunners([]);
  }, []);

  const makeBaseEvent = useCallback(() => {
    const makeCommon = () => ({
      id: generateId(),
      timestamp: new Date().toISOString(),
      inning: state.inning,
      halfInning: state.halfInning,
      outsBefore: state.outs,
      batterId: null,
      pitchSequence: [],
    });

    if (action === 'stolen_base' && selectedRunner && selectedBase) {
      const runner = runnersOnBase.find(r => r.id === selectedRunner);
      if (!runner) return;
      const mvs: RunnerMovement[] = [{ runnerId: selectedRunner, from: runner.base, to: selectedBase }];
      const event: PlayEvent = {
        ...makeCommon(),
        runnerMovements: mvs,
        type: 'stolen_base',
        base: selectedBase,
        runnerId: selectedRunner,
      };
      onEvent(event);
      reset();
    }

    if (action === 'caught_stealing' && selectedRunner && selectedBase) {
      const runner = runnersOnBase.find(r => r.id === selectedRunner);
      if (!runner) return;
      const mvs: RunnerMovement[] = [{ runnerId: selectedRunner, from: runner.base, to: 'out' }];
      const event: PlayEvent = {
        ...makeCommon(),
        runnerMovements: mvs,
        type: 'caught_stealing',
        base: selectedBase,
        runnerId: selectedRunner,
        notation: 'CS',
      };
      onEvent(event);
      reset();
    }

    if (action === 'wild_pitch' || action === 'passed_ball') {
      // Use per-runner resolved destinations (stay-put runners excluded)
      const mvs: RunnerMovement[] = wpPbRunners
        .filter(r => r.to !== null && r.to !== r.from)
        .map(r => ({ runnerId: r.runnerId, from: r.from, to: r.to! }));
      const event: PlayEvent = {
        ...makeCommon(),
        runnerMovements: mvs,
        type: action,
      };
      onEvent(event);
      reset();
    }

    if (action === 'balk') {
      const mvs: RunnerMovement[] = [];
      if (state.bases.third) mvs.push({ runnerId: state.bases.third, from: 'third', to: 'home' });
      if (state.bases.second) mvs.push({ runnerId: state.bases.second, from: 'second', to: 'third' });
      if (state.bases.first) mvs.push({ runnerId: state.bases.first, from: 'first', to: 'second' });
      const event: PlayEvent = {
        ...makeCommon(),
        runnerMovements: mvs,
        type: 'balk',
      };
      onEvent(event);
      reset();
    }

    if (action === 'mound_visit') {
      const isAwayBatting = state.halfInning === 'top';
      // Defensive team makes the mound visit
      const teamId = isAwayBatting ? game.homeTeamId : game.awayTeamId;
      const currentCount = isAwayBatting ? state.homeMoundVisits : state.awayMoundVisits;
      const event: PlayEvent = {
        ...makeCommon(),
        runnerMovements: [],
        type: 'mound_visit',
        teamId,
        visitNumber: currentCount + 1,
      };
      onEvent(event);
      reset();
    }

    if (action === 'timeout') {
      const isAwayBatting = state.halfInning === 'top';
      // Offensive timeout = batting team, defensive = fielding team
      // Default to offensive (batting team)
      const teamId = isAwayBatting ? game.awayTeamId : game.homeTeamId;
      const event: PlayEvent = {
        ...makeCommon(),
        runnerMovements: [],
        type: 'timeout',
        teamId,
        timeoutType: 'offensive',
      };
      onEvent(event);
      reset();
    }

    if (action === 'pickoff' && selectedRunner && pickoffBase) {
      const runner = runnersOnBase.find(r => r.id === selectedRunner);
      if (!runner) return;
      // We'll ask user if successful — for now default to unsuccessful
      // The UI will handle success/failure selection
    }
  }, [action, selectedRunner, selectedBase, pickoffBase, wpPbRunners, state, runnersOnBase, game, onEvent, reset]);

  const handlePickoff = useCallback((successful: boolean) => {
    if (!selectedRunner || !pickoffBase) return;
    const runner = runnersOnBase.find(r => r.id === selectedRunner);
    if (!runner) return;

    const makeCommon = () => ({
      id: generateId(),
      timestamp: new Date().toISOString(),
      inning: state.inning,
      halfInning: state.halfInning,
      outsBefore: state.outs,
      batterId: null,
      pitchSequence: [],
    });

    // Get current pitcher
    const isAwayBatting = state.halfInning === 'top';
    const pitcherLineup = isAwayBatting ? game.homeLineup : game.awayLineup;
    const pitcherSlot = pitcherLineup.startingOrder.find((_, i) => {
      const defSlot = pitcherLineup.startingOrder[i];
      return defSlot.position === 1;
    });
    const pitcherId = pitcherSlot?.playerId ?? '';

    const mvs: RunnerMovement[] = successful
      ? [{ runnerId: selectedRunner, from: runner.base, to: 'out' }]
      : [];

    const event: PlayEvent = {
      ...makeCommon(),
      runnerMovements: mvs,
      type: 'pickoff_attempt',
      pitcherId,
      runnerId: selectedRunner,
      base: pickoffBase,
      successful,
    };
    onEvent(event);
    reset();
  }, [selectedRunner, pickoffBase, runnersOnBase, state, game, onEvent, reset]);

  // Mound visit warning
  const isAwayBatting = state.halfInning === 'top';
  const defensiveVisits = isAwayBatting ? state.homeMoundVisits : state.awayMoundVisits;
  const visitLimit = game.rules.moundVisitsPerGame;
  const visitWarning = visitLimit !== null && defensiveVisits >= visitLimit - 1 && defensiveVisits < visitLimit;
  const visitLimitReached = visitLimit !== null && defensiveVisits >= visitLimit;

  if (!action) {
    return (
      <div className="between-ab-bar">
        {hasRunners && (
          <>
            <button onClick={() => setAction('stolen_base')}>SB</button>
            <button onClick={() => setAction('caught_stealing')}>CS</button>
          </>
        )}
        {hasRunners && (
          <>
            <button onClick={() => {
              setAction('wild_pitch');
              const defaults = getDefaultRunnerStates({ kind: 'wild_pitch' }, state.bases, state.outs);
              setWpPbRunners(defaults.map(d => ({ runnerId: d.runnerId, from: d.from as Base, to: d.to })));
            }}>WP</button>
            <button onClick={() => {
              setAction('passed_ball');
              const defaults = getDefaultRunnerStates({ kind: 'passed_ball' }, state.bases, state.outs);
              setWpPbRunners(defaults.map(d => ({ runnerId: d.runnerId, from: d.from as Base, to: d.to })));
            }}>PB</button>
            <button onClick={() => setAction('balk')}>Balk</button>
          </>
        )}
        {hasRunners && (
          <button onClick={() => setAction('pickoff')}>Pickoff</button>
        )}
        <button onClick={() => setAction('mound_visit')} style={visitWarning ? { color: 'orange' } : visitLimitReached ? { color: 'red' } : undefined}>
          Mound Visit{visitLimit !== null ? ` (${defensiveVisits}/${visitLimit})` : ''}
        </button>
        <button onClick={() => setAction('timeout')}>Timeout</button>
      </div>
    );
  }

  // SB / CS need runner + base selection
  if (action === 'stolen_base' || action === 'caught_stealing') {
    return (
      <div className="runner-panel">
        <span className="outcome-section-label">
          {action === 'stolen_base' ? 'Stolen Base' : 'Caught Stealing'} — Select runner
        </span>
        {runnersOnBase.map(r => (
          <button
            key={r.id}
            className={`outcome-btn${selectedRunner === r.id ? ' selected' : ''}`}
            onClick={() => {
              setSelectedRunner(r.id);
              // Auto-select next base
              const nextBase = r.base === 'first' ? 'second' : r.base === 'second' ? 'third' : 'home';
              setSelectedBase(nextBase);
            }}
          >
            {getPlayerName(r.id)} ({r.base === 'first' ? '1B' : r.base === 'second' ? '2B' : '3B'})
          </button>
        ))}

        <div className="action-bar">
          <button onClick={reset}>Cancel</button>
          <button
            className="primary"
            disabled={!selectedRunner || !selectedBase}
            onClick={makeBaseEvent}
          >
            Record {action === 'stolen_base' ? 'SB' : 'CS'} ✓
          </button>
        </div>
      </div>
    );
  }

  // WP / PB — per-runner resolution
  if (action === 'wild_pitch' || action === 'passed_ball') {
    const allResolved = wpPbRunners.every(r => r.to !== null);
    const baseLabel = (b: Base) => b === 'first' ? '1B' : b === 'second' ? '2B' : b === 'third' ? '3B' : 'H';

    return (
      <div className="runner-panel">
        <span className="outcome-section-label">
          {action === 'wild_pitch' ? 'Wild Pitch' : 'Passed Ball'} — Move Runners
        </span>
        {wpPbRunners.map(r => {
          // Possible destinations: stay (current base), advance bases, home, out
          const dests: (Base | 'out')[] = [];
          dests.push(r.from); // stay
          if (r.from === 'first') dests.push('second', 'third', 'home', 'out');
          else if (r.from === 'second') dests.push('third', 'home', 'out');
          else if (r.from === 'third') dests.push('home', 'out');

          return (
            <div className="runner-row" key={r.runnerId}>
              <span className="runner-from">{baseLabel(r.from)}</span>
              <span className="runner-name">{getPlayerName(r.runnerId)}</span>
              <div className="runner-destinations">
                {dests.map(dest => (
                  <button
                    key={dest}
                    className={`runner-dest-btn${r.to === dest ? (dest === 'out' ? ' out-selected' : ' selected') : ''}`}
                    onClick={() => setWpPbRunners(prev => prev.map(
                      pr => pr.runnerId === r.runnerId ? { ...pr, to: dest } : pr
                    ))}
                  >
                    {dest === r.from ? 'Stay' : dest === 'home' ? 'Scored' : dest === 'out' ? 'OUT' : baseLabel(dest)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="action-bar">
          <button onClick={reset}>Cancel</button>
          <button className="primary" disabled={!allResolved} onClick={makeBaseEvent}>
            Confirm ✓
          </button>
        </div>
      </div>
    );
  }

  // Balk — deterministic, just confirm
  if (action === 'balk') {
    return (
      <div className="runner-panel">
        <span className="outcome-section-label">
          Balk — runners advance one base
        </span>
        <div className="action-bar">
          <button onClick={reset}>Cancel</button>
          <button className="primary" onClick={makeBaseEvent}>
            Confirm ✓
          </button>
        </div>
      </div>
    );
  }

  // Mound visit — confirm
  if (action === 'mound_visit') {
    return (
      <div className="runner-panel">
        <span className="outcome-section-label">
          Mound Visit — {isAwayBatting ? game.homeTeamName : game.awayTeamName} (defensive)
        </span>
        {visitLimitReached && (
          <span style={{ color: 'red', fontSize: 12 }}>⚠ Mound visit limit reached!</span>
        )}
        {visitWarning && (
          <span style={{ color: 'orange', fontSize: 12 }}>⚠ Last mound visit before limit</span>
        )}
        <div className="action-bar">
          <button onClick={reset}>Cancel</button>
          <button className="primary" onClick={makeBaseEvent}>
            Record Visit ✓
          </button>
        </div>
      </div>
    );
  }

  // Timeout — confirm
  if (action === 'timeout') {
    return (
      <div className="runner-panel">
        <span className="outcome-section-label">Timeout</span>
        <div className="action-bar">
          <button onClick={reset}>Cancel</button>
          <button className="primary" onClick={makeBaseEvent}>
            Record Timeout ✓
          </button>
        </div>
      </div>
    );
  }

  // Pickoff — select runner, then success/failure
  if (action === 'pickoff') {
    return (
      <div className="runner-panel">
        <span className="outcome-section-label">Pickoff Attempt — Select runner</span>
        {runnersOnBase.map(r => (
          <button
            key={r.id}
            className={`outcome-btn${selectedRunner === r.id ? ' selected' : ''}`}
            onClick={() => {
              setSelectedRunner(r.id);
              setPickoffBase(r.base);
            }}
          >
            {getPlayerName(r.id)} ({r.base === 'first' ? '1B' : r.base === 'second' ? '2B' : '3B'})
          </button>
        ))}
        {selectedRunner && (
          <div className="action-bar">
            <button onClick={reset}>Cancel</button>
            <button onClick={() => handlePickoff(false)}>
              Safe (Attempt)
            </button>
            <button className="primary" onClick={() => handlePickoff(true)}>
              Out! ✓
            </button>
          </div>
        )}
        {!selectedRunner && (
          <div className="action-bar">
            <button onClick={reset}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
