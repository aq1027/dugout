import { useState, useCallback } from 'react';
import type { Id, Base } from '../../models/common';
import type { RunnerMovement, PlayEvent } from '../../models/play';
import type { DerivedGameState } from '../../models/game';
import type { Player } from '../../models/player';
import { generateId } from '../../utils/id';

interface BetweenABPanelProps {
  state: DerivedGameState;
  players: Map<Id, Player>;
  onEvent: (event: PlayEvent) => void;
}

type BetweenAction = 'stolen_base' | 'caught_stealing' | 'wild_pitch' | 'passed_ball' | 'balk' | null;

export function BetweenABPanel({ state, players, onEvent }: BetweenABPanelProps) {
  const [action, setAction] = useState<BetweenAction>(null);
  const [selectedRunner, setSelectedRunner] = useState<Id | null>(null);
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);

  const runnersOnBase: { id: Id; base: Base }[] = [];
  if (state.bases.first) runnersOnBase.push({ id: state.bases.first, base: 'first' });
  if (state.bases.second) runnersOnBase.push({ id: state.bases.second, base: 'second' });
  if (state.bases.third) runnersOnBase.push({ id: state.bases.third, base: 'third' });

  const hasRunners = runnersOnBase.length > 0;

  const getPlayerName = (id: Id) => {
    const p = players.get(id);
    return p ? `${p.lastName || p.firstName}` : '??';
  };

  const reset = useCallback(() => {
    setAction(null);
    setSelectedRunner(null);
    setSelectedBase(null);
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
      // Advance each runner one base
      const mvs: RunnerMovement[] = [];
      if (state.bases.third) mvs.push({ runnerId: state.bases.third, from: 'third', to: 'home' });
      if (state.bases.second) mvs.push({ runnerId: state.bases.second, from: 'second', to: 'third' });
      if (state.bases.first) mvs.push({ runnerId: state.bases.first, from: 'first', to: 'second' });
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
  }, [action, selectedRunner, selectedBase, state, runnersOnBase, onEvent, reset]);

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
            <button onClick={() => setAction('wild_pitch')}>WP</button>
            <button onClick={() => setAction('passed_ball')}>PB</button>
            <button onClick={() => setAction('balk')}>Balk</button>
          </>
        )}
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

  // WP / PB / Balk — just confirm  
  return (
    <div className="runner-panel">
      <span className="outcome-section-label">
        {action === 'wild_pitch' ? 'Wild Pitch' : action === 'passed_ball' ? 'Passed Ball' : 'Balk'}
        {' — runners advance one base'}
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
