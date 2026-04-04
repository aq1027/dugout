import { useState, useEffect } from 'react';
import type { Player } from '../../models/player';
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
}

/** A slot that may or may not be filled */
interface SlotState {
  playerId: string | null;
  position: PositionNumber | null;
}

function buildSlots(lineup: LineupSlot[], slotCount: number): SlotState[] {
  return Array.from({ length: slotCount }, (_, i) => {
    if (i < lineup.length) {
      return { playerId: lineup[i].playerId, position: lineup[i].position };
    }
    return { playerId: null, position: null };
  });
}

export function LineupBuilder({ label, players, lineup, onChange, useDH, playersPerSide }: LineupBuilderProps) {
  const slotCount = useDH ? playersPerSide + 1 : playersPerSide;

  const availablePositions: PositionNumber[] = useDH
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Internal slot state — preserves empty gaps
  const [slots, setSlots] = useState<SlotState[]>(() => buildSlots(lineup, slotCount));

  // Re-sync when team or DH changes (different players list = different team selected)
  useEffect(() => {
    setSlots(buildSlots(lineup, slotCount));
  }, [players, slotCount]);

  // Players already assigned to a slot
  const assignedPlayerIds = new Set(slots.filter(s => s.playerId).map(s => s.playerId!));

  // Positions already used
  const usedPositions = new Map<PositionNumber, number>();
  for (const s of slots) {
    if (s.position) {
      usedPositions.set(s.position, (usedPositions.get(s.position) ?? 0) + 1);
    }
  }
  const duplicatePositions = new Set(
    [...usedPositions.entries()]
      .filter(([, count]) => count > 1)
      .map(([pos]) => pos)
  );

  // Emit only filled slots to parent in batting-order sequence
  const emitChange = (newSlots: SlotState[]) => {
    setSlots(newSlots);
    const filled: LineupSlot[] = newSlots
      .filter((s): s is { playerId: string; position: PositionNumber } => s.playerId !== null && s.position !== null);
    onChange(filled);
  };

  const setPlayer = (index: number, playerId: string | null) => {
    const next = [...slots];
    if (playerId) {
      const player = players.find(p => p.id === playerId);
      const defaultPos = player?.positions[0] ?? 1;
      next[index] = { playerId, position: defaultPos as PositionNumber };
    } else {
      next[index] = { playerId: null, position: null };
    }
    emitChange(next);
  };

  const setPosition = (index: number, pos: PositionNumber) => {
    const next = [...slots];
    next[index] = { ...next[index], position: pos };
    emitChange(next);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...slots];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    emitChange(next);
  };

  const moveDown = (index: number) => {
    if (index >= slots.length - 1) return;
    const next = [...slots];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    emitChange(next);
  };

  const clearSlot = (index: number) => {
    const next = [...slots];
    next[index] = { playerId: null, position: null };
    emitChange(next);
  };

  const getPlayerLabel = (playerId: string) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return 'Unknown';
    const num = p.number != null ? `#${p.number} ` : '';
    return `${num}${p.firstName} ${p.lastName}`;
  };

  const filledCount = slots.filter(s => s.playerId).length;

  return (
    <div className="team-section">
      <span className="section-label">{label} — Batting Order ({filledCount}/{slotCount})</span>

      <div className="lineup-list">
        {slots.map((slot, i) => (
          <div key={i} className={`lineup-slot${slot.playerId ? '' : ' empty-slot'}`}>
            <span className="slot-number">{i + 1}</span>

            {slot.playerId ? (
              <>
                <span className="slot-name">{getPlayerLabel(slot.playerId)}</span>
                <select
                  value={slot.position ?? ''}
                  onChange={e => setPosition(i, parseInt(e.target.value) as PositionNumber)}
                  style={slot.position && duplicatePositions.has(slot.position) ? { borderColor: 'var(--color-warning)' } : {}}
                >
                  {availablePositions.map(pos => (
                    <option key={pos} value={pos}>{POSITION_LABELS[pos]}</option>
                  ))}
                </select>
                <div className="move-btns">
                  <button type="button" onClick={() => moveUp(i)} disabled={i === 0}>▲</button>
                  <button type="button" onClick={() => moveDown(i)} disabled={i === slots.length - 1}>▼</button>
                </div>
                <button
                  type="button"
                  onClick={() => clearSlot(i)}
                  className="clear-slot-btn"
                  title="Remove from lineup"
                >
                  ×
                </button>
              </>
            ) : (
              <select
                className="player-picker"
                value=""
                onChange={e => setPlayer(i, e.target.value || null)}
              >
                <option value="">— Select player —</option>
                {players
                  .filter(p => !assignedPlayerIds.has(p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.number != null ? `#${p.number} ` : ''}{p.firstName} {p.lastName} ({p.positions.map(pos => POSITION_LABELS[pos]).join('/')})
                    </option>
                  ))}
              </select>
            )}
          </div>
        ))}
      </div>

      {duplicatePositions.size > 0 && (
        <div className="validation-msg">
          ⚠ Duplicate positions: {[...duplicatePositions].map(p => POSITION_LABELS[p]).join(', ')}
        </div>
      )}
    </div>
  );
}
