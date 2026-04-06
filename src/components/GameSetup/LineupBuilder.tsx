import { useState, useEffect, useRef, useCallback } from 'react';
import type { Player } from '../../models/player';
import { displayPlayerName } from '../../models/player';
import type { LineupSlot } from '../../models/lineup';
import type { PositionNumber } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';

interface LineupBuilderProps {
  label: string;
  players: Player[];
  lineup: LineupSlot[];
  onChange: (lineup: LineupSlot[]) => void;
  useDH: boolean;
  playersPerSide: number;
  everyoneBats: boolean;
}

interface SlotState {
  playerId: string | null;
  position: PositionNumber | null;
}

const FIELD_POSITIONS: PositionNumber[] = [2, 3, 4, 5, 6, 7, 8, 9];

export function LineupBuilder({
  label, players, lineup, onChange, useDH, playersPerSide, everyoneBats,
}: LineupBuilderProps) {
  // Pitcher — separate from batting order
  const [pitcherId, setPitcherId] = useState<string | null>(() => {
    const slot = lineup.find(s => s.position === 1);
    return slot?.playerId ?? null;
  });

  const [twoWay, setTwoWay] = useState<boolean>(() => {
    if (!useDH) return false;
    const pSlot = lineup.find(s => s.position === 1);
    if (!pSlot) return false;
    return lineup.some(s => s.playerId === pSlot.playerId && s.position === 10);
  });

  const battingSlotCount = everyoneBats ? players.length : playersPerSide;
  const [slots, setSlots] = useState<SlotState[]>(() => buildSlots(lineup, battingSlotCount, pitcherId));

  // ─── Drag-and-drop state ────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const touchSrc = useRef<number | null>(null);

  // Re-sync on team / rule changes
  useEffect(() => {
    const pSlot = lineup.find(s => s.position === 1);
    const newPid = pSlot?.playerId ?? null;
    setPitcherId(newPid);
    setSlots(buildSlots(lineup, everyoneBats ? players.length : playersPerSide, newPid));
    if (!useDH) setTwoWay(false);
  }, [players, playersPerSide, useDH, everyoneBats]);

  // ─── Derived data ───────────────────────────────────────
  const assignedBattingIds = new Set(slots.filter(s => s.playerId).map(s => s.playerId!));
  const allAssignedIds = new Set(assignedBattingIds);
  if (pitcherId) allAssignedIds.add(pitcherId);

  // Count positions for duplicate detection
  const posCounts = new Map<PositionNumber, number>();
  for (const s of slots) {
    if (s.position) posCounts.set(s.position, (posCounts.get(s.position) ?? 0) + 1);
  }
  const dupPositions = new Set(
    [...posCounts.entries()].filter(([, c]) => c > 1).map(([p]) => p),
  );

  const availableForBatting = players.filter(p => {
    if (allAssignedIds.has(p.id)) return false;
    if (useDH && !twoWay && p.id === pitcherId) return false;
    return true;
  });

  // Position options for a slot — only positions not yet taken (except own)
  const posOptions = useCallback((currentPos: PositionNumber | null): PositionNumber[] => {
    const base: PositionNumber[] = useDH ? [...FIELD_POSITIONS, 10] : [...FIELD_POSITIONS];
    return base.filter(pos => pos === currentPos || !posCounts.has(pos) || posCounts.get(pos) === 0);
  }, [useDH, posCounts]);

  // ─── Emit ───────────────────────────────────────────────
  const emit = useCallback((newSlots: SlotState[], pid: string | null, _tw: boolean) => {
    setSlots(newSlots);
    const filled: LineupSlot[] = [];
    for (const s of newSlots) {
      if (s.playerId && s.position) filled.push({ playerId: s.playerId, position: s.position });
    }
    if (pid) filled.push({ playerId: pid, position: 1 });
    onChange(filled);
  }, [onChange]);

  // ─── Drag handlers (desktop) ────────────────────────────
  const onDragStart = (i: number) => setDragIdx(i);
  const onDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setOverIdx(i); };
  const onDrop = (target: number) => {
    if (dragIdx !== null && dragIdx !== target) {
      const next = [...slots];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(target, 0, moved);
      emit(next, pitcherId, twoWay);
    }
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  // ─── Touch drag (mobile) ────────────────────────────────
  const onTouchStart = (i: number) => { touchSrc.current = i; setDragIdx(i); };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchSrc.current === null || !listRef.current) return;
    const touch = e.touches[0];
    const slotEls = listRef.current.querySelectorAll<HTMLElement>('.lineup-slot');
    for (let j = 0; j < slotEls.length; j++) {
      const rect = slotEls[j].getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        setOverIdx(j);
        break;
      }
    }
  };

  const onTouchEnd = () => {
    if (touchSrc.current !== null && overIdx !== null && touchSrc.current !== overIdx) {
      const next = [...slots];
      const [moved] = next.splice(touchSrc.current, 1);
      next.splice(overIdx, 0, moved);
      emit(next, pitcherId, twoWay);
    }
    touchSrc.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

  // ─── Pitcher handlers ──────────────────────────────────
  const handlePitcherChange = (id: string | null) => {
    const oldPid = pitcherId;
    setPitcherId(id);
    let next = [...slots];
    if (twoWay && oldPid) {
      next = next.map(s => s.playerId === oldPid && s.position === 10 ? { playerId: null, position: null } : s);
    }
    if (twoWay && id) {
      const ei = next.findIndex(s => !s.playerId);
      if (ei >= 0) next[ei] = { playerId: id, position: 10 };
    }
    emit(next, id, twoWay);
  };

  const handleTwoWayToggle = (checked: boolean) => {
    setTwoWay(checked);
    let next = [...slots];
    if (checked && pitcherId) {
      const ei = next.findIndex(s => !s.playerId);
      if (ei >= 0) next[ei] = { playerId: pitcherId, position: 10 };
    } else if (!checked && pitcherId) {
      next = next.map(s => s.playerId === pitcherId ? { playerId: null, position: null } : s);
    }
    emit(next, pitcherId, checked);
  };

  // ─── Slot handlers ─────────────────────────────────────
  const pickPlayer = (index: number, playerId: string | null) => {
    const next = [...slots];
    if (playerId) {
      const player = players.find(p => p.id === playerId);
      const base: PositionNumber[] = useDH ? [...FIELD_POSITIONS, 10] : [...FIELD_POSITIONS];
      // Pick first open position that matches player's roster, else first open
      let pos: PositionNumber = base.find(p => !posCounts.has(p)) ?? base[0];
      if (player) {
        const match = player.positions.find(p => base.includes(p as PositionNumber) && !posCounts.has(p as PositionNumber));
        if (match) pos = match as PositionNumber;
      }
      next[index] = { playerId, position: pos };
    } else {
      next[index] = { playerId: null, position: null };
    }
    emit(next, pitcherId, twoWay);
  };

  const setPosition = (index: number, pos: PositionNumber) => {
    const next = [...slots];
    next[index] = { ...next[index], position: pos };
    emit(next, pitcherId, twoWay);
  };

  const clearSlot = (index: number) => {
    const next = [...slots];
    next[index] = { playerId: null, position: null };
    emit(next, pitcherId, twoWay);
  };

  const playerLabel = (id: string) => {
    const p = players.find(pl => pl.id === id);
    if (!p) return 'Unknown';
    return displayPlayerName(p);
  };

  const filledCount = slots.filter(s => s.playerId).length;

  return (
    <div className="team-section">
      <span className="section-label">{label}</span>

      {/* ── Starting Pitcher ─────── */}
      <div className="pitcher-section">
        <label className="pitcher-label">Starting Pitcher</label>
        <select
          className="pitcher-picker"
          value={pitcherId ?? ''}
          onChange={e => handlePitcherChange(e.target.value || null)}
        >
          <option value="">— Select pitcher —</option>
          {players
            .filter(p => p.id === pitcherId || !assignedBattingIds.has(p.id))
            .map(p => (
              <option key={p.id} value={p.id}>
                {displayPlayerName(p)}
              </option>
            ))}
        </select>
        {useDH && pitcherId && (
          <label className="two-way-toggle">
            <input type="checkbox" checked={twoWay} onChange={e => handleTwoWayToggle(e.target.checked)} />
            Pitcher also bats (two-way)
          </label>
        )}
        {!useDH && pitcherId && (
          <span className="pitcher-note">Pitcher bats in the lineup</span>
        )}
      </div>

      {/* ── Batting Order ────────── */}
      <div className="batting-header">
        <span>Batting Order ({filledCount}/{battingSlotCount})</span>
      </div>

      <div className="lineup-list" ref={listRef}>
        {slots.map((slot, i) => {
          const isDragging = dragIdx === i;
          const isOver = overIdx === i && dragIdx !== i;
          return (
            <div
              key={i}
              data-index={i}
              className={
                'lineup-slot'
                + (slot.playerId ? '' : ' empty-slot')
                + (isDragging ? ' dragging' : '')
                + (isOver ? ' drag-over' : '')
              }
              draggable={!!slot.playerId}
              onDragStart={() => onDragStart(i)}
              onDragOver={e => onDragOver(e, i)}
              onDrop={() => onDrop(i)}
              onDragEnd={onDragEnd}
            >
              <span className="slot-number">{i + 1}</span>

              {slot.playerId ? (
                <>
                  <span
                    className="drag-handle"
                    title="Drag to reorder"
                    onTouchStart={() => onTouchStart(i)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                  >☰</span>
                  <span className="slot-name">{playerLabel(slot.playerId)}</span>
                  <select
                    value={slot.position ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        const next = [...slots];
                        next[i] = { ...next[i], position: null };
                        emit(next, pitcherId, twoWay);
                      } else {
                        setPosition(i, parseInt(val) as PositionNumber);
                      }
                    }}
                    className={slot.position && dupPositions.has(slot.position) ? 'pos-error' : ''}
                  >
                    <option value="">--</option>
                    {posOptions(slot.position).map(pos => (
                      <option key={pos} value={pos}>{POSITION_LABELS[pos]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => clearSlot(i)} className="clear-slot-btn" title="Remove">×</button>
                </>
              ) : (
                <select
                  className="player-picker"
                  value=""
                  onChange={e => pickPlayer(i, e.target.value || null)}
                >
                  <option value="">— Select player —</option>
                  {availableForBatting
                    .filter(p => !assignedBattingIds.has(p.id))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {displayPlayerName(p)}
                        {' '}({p.positions.map(pos => POSITION_LABELS[pos as PositionNumber]).join('/')})
                      </option>
                    ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {dupPositions.size > 0 && (
        <div className="validation-msg">
          ⚠ Duplicate positions: {[...dupPositions].map(p => POSITION_LABELS[p]).join(', ')}
        </div>
      )}
    </div>
  );
}

function buildSlots(lineup: LineupSlot[], count: number, pitcherId: string | null): SlotState[] {
  const batting = lineup.filter(s => !(s.position === 1 && s.playerId === pitcherId));
  return Array.from({ length: count }, (_, i) => {
    if (i < batting.length) return { playerId: batting[i].playerId, position: batting[i].position };
    return { playerId: null, position: null };
  });
}
