import { useState, useCallback } from 'react';
import type { Id, PositionNumber } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';
import type { Game, DerivedGameState } from '../../models/game';
import type { Player } from '../../models/player';
import { displayPlayerName } from '../../models/player';
import type { LineupSlot, Substitution } from '../../models/lineup';
import type { PlayEvent } from '../../models/play';
import { generateId } from '../../utils/id';

interface LineupPanelProps {
  game: Game;
  state: DerivedGameState;
  players: Map<Id, Player>;
  teamPlayers: Player[];
  isAway: boolean;
  onGameUpdate: (updatedGame: Game) => void;
  onEvent: (event: PlayEvent) => void;
}

/** Get current lineup accounting for all substitutions */
function getCurrentSlots(game: Game, isAway: boolean): LineupSlot[] {
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const slots = lineup.startingOrder.map(s => ({ ...s }));
  for (const sub of lineup.substitutions) {
    if (sub.orderSlot < slots.length) {
      slots[sub.orderSlot] = { playerId: sub.inPlayerId, position: sub.position };
    }
  }
  return slots;
}

/** Build substitution history per batting order slot */
function getSlotHistory(game: Game, isAway: boolean): Map<number, Substitution[]> {
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const map = new Map<number, Substitution[]>();
  for (const sub of lineup.substitutions) {
    // Only show player-change subs (not just position swaps where same player moves)
    if (sub.outPlayerId !== sub.inPlayerId) {
      const list = map.get(sub.orderSlot) ?? [];
      list.push(sub);
      map.set(sub.orderSlot, list);
    }
  }
  return map;
}

function getCurrentPitcher(game: Game, isAway: boolean): Id | null {
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const pitchingSub = [...lineup.substitutions]
    .reverse()
    .find(s => s.position === 1);
  if (pitchingSub) return pitchingSub.inPlayerId;
  return lineup.startingOrder.find(s => s.position === 1)?.playerId ?? null;
}

type SubAction = {
  slot: number; // -1 for pitcher
  step: 'pick-type' | 'pick-player' | 'swap-target';
  type?: Substitution['type'];
};

export function LineupPanel({ game, state, players, teamPlayers, isAway, onGameUpdate, onEvent }: LineupPanelProps) {
  const [action, setAction] = useState<SubAction | null>(null);

  const teamName = isAway ? game.awayTeamName : game.homeTeamName;
  const slots = getCurrentSlots(game, isAway);
  const slotHistory = getSlotHistory(game, isAway);
  const currentPitcherId = getCurrentPitcher(game, isAway);

  const isBatting = (isAway && state.halfInning === 'top') || (!isAway && state.halfInning === 'bottom');
  const batterIndex = isAway ? state.awayBatterIndex : state.homeBatterIndex;
  const currentBatterSlotIdx = isBatting ? (batterIndex % slots.length) : -1;

  const lineupPlayerIds = new Set(slots.map(s => s.playerId));
  if (currentPitcherId) lineupPlayerIds.add(currentPitcherId);

  // Players who have been subbed out cannot re-enter the game
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const removedPlayerIds = new Set<Id>();
  for (const sub of lineup.substitutions) {
    if (sub.outPlayerId !== sub.inPlayerId) {
      removedPlayerIds.add(sub.outPlayerId);
    }
  }
  const benchPlayers = teamPlayers.filter(p => !lineupPlayerIds.has(p.id) && !removedPlayerIds.has(p.id));

  const availablePositions: PositionNumber[] = game.rules.useDH
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const pName = (id: Id) => {
    const p = players.get(id);
    if (!p) return '??';
    return displayPlayerName(p);
  };

  const pShort = (p: Player) => {
    return displayPlayerName(p);
  };

  const subTypeLabel = (t: Substitution['type']) => {
    switch (t) {
      case 'pinch_hitter': return 'PH';
      case 'pinch_runner': return 'PR';
      case 'defensive': return 'DEF';
      case 'pitching_change': return 'P';
    }
  };

  // ─── Commit a substitution ──────────────────
  const commitSub = useCallback((slotIndex: number, newPlayerId: Id, pos: PositionNumber, subType: Substitution['type']) => {
    const lineupKey = isAway ? 'awayLineup' : 'homeLineup';
    const lineup = { ...game[lineupKey] };
    const slot = slots[slotIndex];
    const sub: Substitution = {
      inning: state.inning,
      outs: state.outs,
      outPlayerId: slot.playerId,
      inPlayerId: newPlayerId,
      orderSlot: slotIndex,
      position: pos,
      type: subType,
    };
    lineup.substitutions = [...lineup.substitutions, sub];
    const updatedGame = { ...game, [lineupKey]: lineup, updatedAt: new Date().toISOString() };
    onGameUpdate(updatedGame);
    // Emit SubstitutionEvent into the play log
    const subEvent: PlayEvent = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      inning: state.inning,
      halfInning: state.halfInning,
      outsBefore: state.outs,
      batterId: null,
      pitchSequence: [],
      runnerMovements: [],
      type: 'substitution',
      subType: subType,
      outPlayerId: slot.playerId,
      inPlayerId: newPlayerId,
      position: pos,
      orderSlot: slotIndex,
    };
    onEvent(subEvent);
    setAction(null);
  }, [game, isAway, slots, state, onGameUpdate, onEvent]);

  // ─── Position change (same player) ─────────
  const handlePosChange = useCallback((slotIndex: number, newPos: PositionNumber) => {
    const lineupKey = isAway ? 'awayLineup' : 'homeLineup';
    const lineup = { ...game[lineupKey] };
    const slot = slots[slotIndex];
    const sub: Substitution = {
      inning: state.inning,
      outs: state.outs,
      outPlayerId: slot.playerId,
      inPlayerId: slot.playerId,
      orderSlot: slotIndex,
      position: newPos,
      type: 'defensive',
    };
    lineup.substitutions = [...lineup.substitutions, sub];
    onGameUpdate({ ...game, [lineupKey]: lineup, updatedAt: new Date().toISOString() });
  }, [game, isAway, slots, state, onGameUpdate]);

  // ─── Swap positions between two lineup players ─────
  const handleSwap = useCallback((slotA: number, slotB: number) => {
    const lineupKey = isAway ? 'awayLineup' : 'homeLineup';
    const lineup = { ...game[lineupKey] };
    const a = slots[slotA];
    const b = slots[slotB];
    // Record two defensive subs to swap positions
    const subA: Substitution = {
      inning: state.inning, outs: state.outs,
      outPlayerId: a.playerId, inPlayerId: a.playerId,
      orderSlot: slotA, position: b.position, type: 'defensive',
    };
    const subB: Substitution = {
      inning: state.inning, outs: state.outs,
      outPlayerId: b.playerId, inPlayerId: b.playerId,
      orderSlot: slotB, position: a.position, type: 'defensive',
    };
    lineup.substitutions = [...lineup.substitutions, subA, subB];
    onGameUpdate({ ...game, [lineupKey]: lineup, updatedAt: new Date().toISOString() });
    setAction(null);
  }, [game, isAway, slots, state, onGameUpdate]);

  // ─── New pitcher from bench ─────────────────
  const handleNewPitcher = useCallback((newPlayerId: Id) => {
    const lineupKey = isAway ? 'awayLineup' : 'homeLineup';
    const lineup = { ...game[lineupKey] };
    const pitcherSlotIdx = slots.findIndex(s => s.position === 1);
    if (pitcherSlotIdx < 0) return;
    const oldSlot = slots[pitcherSlotIdx];
    const sub: Substitution = {
      inning: state.inning, outs: state.outs,
      outPlayerId: oldSlot.playerId, inPlayerId: newPlayerId,
      orderSlot: pitcherSlotIdx, position: 1, type: 'pitching_change',
    };
    lineup.substitutions = [...lineup.substitutions, sub];
    const updatedGame = { ...game, [lineupKey]: lineup, updatedAt: new Date().toISOString() };
    onGameUpdate(updatedGame);
    // Also emit a SubstitutionEvent into the play log
    const subEvent: PlayEvent = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      inning: state.inning,
      halfInning: state.halfInning,
      outsBefore: state.outs,
      batterId: null,
      pitchSequence: [],
      runnerMovements: [],
      type: 'substitution',
      subType: 'pitching_change',
      outPlayerId: oldSlot.playerId,
      inPlayerId: newPlayerId,
      position: 1,
      orderSlot: pitcherSlotIdx,
    };
    onEvent(subEvent);
    setAction(null);
  }, [game, isAway, slots, state, onGameUpdate, onEvent]);

  // Position duplicate check
  const posCounts = new Map<PositionNumber, number>();
  for (const s of slots) posCounts.set(s.position, (posCounts.get(s.position) ?? 0) + 1);

  const closeAction = () => setAction(null);
  const isActive = (slot: number) => action?.slot === slot;

  return (
    <div className="lineup-panel">
      <div className="lineup-panel-header">
        <span className="lineup-panel-title">{teamName} Lineup</span>
        {isBatting && <span className="lineup-badge batting-badge">BAT</span>}
        {!isBatting && <span className="lineup-badge fielding-badge">FLD</span>}
      </div>

      {/* Pitcher row */}
      <div className="lineup-panel-pitcher">
        <span className="lineup-pos-label">P</span>
        <span className="lineup-player-name">
          {currentPitcherId ? pName(currentPitcherId) : '—'}
        </span>
        <button className="lineup-sub-btn" onClick={() =>
          isActive(-1) ? closeAction() : setAction({ slot: -1, step: 'pick-player', type: 'pitching_change' })
        }>
          {isActive(-1) ? '✕' : '↻'}
        </button>
      </div>
      {isActive(-1) && (
        <div className="lineup-sub-picker">
          <span className="lineup-sub-label">New pitcher:</span>
          {benchPlayers.length > 0 && benchPlayers.map(p => (
            <button key={p.id} className="lineup-sub-option" onClick={() => handleNewPitcher(p.id)}>
              {pShort(p)}
            </button>
          ))}
          <span className="lineup-sub-label" style={{ marginTop: 4 }}>Or move from lineup:</span>
          {slots.filter(s => s.position !== 1).map(s => {
            const idx = slots.indexOf(s);
            return (
              <button key={s.playerId} className="lineup-sub-option" onClick={() => {
                // Swap this player to P and current P to their position
                const pitcherSlotIdx = slots.findIndex(sl => sl.position === 1);
                if (pitcherSlotIdx >= 0) handleSwap(pitcherSlotIdx, idx);
              }}>
                {pName(s.playerId)} ({POSITION_LABELS[s.position]})
              </button>
            );
          })}
        </div>
      )}

      {/* Batting order rows */}
      <div className="lineup-panel-rows">
        {slots.map((slot, i) => {
          const isCurrentBatter = i === currentBatterSlotIdx;
          const hasDupePos = (posCounts.get(slot.position) ?? 0) > 1;
          const history = slotHistory.get(i) ?? [];

          return (
            <div key={`${slot.playerId}-${i}`} className="lineup-slot-group">
              <div className={`lineup-panel-row${isCurrentBatter ? ' current-batter' : ''}`}>
                <span className="lineup-order">{i + 1}</span>
                <span className="lineup-player-name">{pName(slot.playerId)}</span>
                <select
                  className={`lineup-pos-select${hasDupePos ? ' pos-error' : ''}`}
                  value={slot.position}
                  onChange={e => handlePosChange(i, parseInt(e.target.value) as PositionNumber)}
                >
                  {availablePositions.map(pos => (
                    <option key={pos} value={pos}>{POSITION_LABELS[pos]}</option>
                  ))}
                </select>
                <button className="lineup-sub-btn" onClick={() =>
                  isActive(i) ? closeAction() : setAction({ slot: i, step: 'pick-type' })
                }>
                  {isActive(i) ? '✕' : '↻'}
                </button>
              </div>

              {/* Substitution history for this slot (indented, MLB-style) */}
              {history.map((sub, si) => (
                <div key={si} className="lineup-sub-history">
                  <span className="sub-prefix">{String.fromCharCode(97 + si)}-</span>
                  <span className="sub-player">{pName(sub.inPlayerId)}</span>
                  <span className="sub-type-badge">{subTypeLabel(sub.type)}-{POSITION_LABELS[sub.position]}</span>
                </div>
              ))}

              {/* Step 1: Pick sub type */}
              {isActive(i) && action!.step === 'pick-type' && (
                <div className="lineup-sub-picker">
                  <span className="lineup-sub-label">Action:</span>
                  <button className="lineup-sub-option" onClick={() => setAction({ slot: i, step: 'pick-player', type: 'pinch_hitter' })}>
                    Pinch Hit
                  </button>
                  <button className="lineup-sub-option" onClick={() => setAction({ slot: i, step: 'pick-player', type: 'pinch_runner' })}>
                    Pinch Run
                  </button>
                  <button className="lineup-sub-option" onClick={() => setAction({ slot: i, step: 'pick-player', type: 'defensive' })}>
                    Defensive Sub
                  </button>
                  <button className="lineup-sub-option" onClick={() => setAction({ slot: i, step: 'swap-target' })}>
                    Swap Position
                  </button>
                </div>
              )}

              {/* Step 2a: Pick bench player */}
              {isActive(i) && action!.step === 'pick-player' && (
                <div className="lineup-sub-picker">
                  <span className="lineup-sub-label">
                    {action!.type === 'pinch_hitter' ? 'Pinch hitter:' :
                     action!.type === 'pinch_runner' ? 'Pinch runner:' :
                     'Replacement:'}
                  </span>
                  {benchPlayers.length === 0 && (
                    <span className="lineup-sub-label">No bench players available</span>
                  )}
                  {benchPlayers.map(p => (
                    <button key={p.id} className="lineup-sub-option" onClick={() =>
                      commitSub(i, p.id, slot.position, action!.type!)
                    }>
                      {pShort(p)}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2b: Pick swap target */}
              {isActive(i) && action!.step === 'swap-target' && (
                <div className="lineup-sub-picker">
                  <span className="lineup-sub-label">Swap {POSITION_LABELS[slot.position]} with:</span>
                  {slots.filter((_, j) => j !== i).map(other => {
                    const j = slots.indexOf(other);
                    return (
                      <button key={other.playerId} className="lineup-sub-option" onClick={() => handleSwap(i, j)}>
                        {pName(other.playerId)} ({POSITION_LABELS[other.position]})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bench */}
      {benchPlayers.length > 0 && (
        <div className="lineup-bench">
          <span className="lineup-bench-label">Bench ({benchPlayers.length})</span>
          <span className="lineup-bench-names">
            {benchPlayers.map(p => pShort(p)).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
