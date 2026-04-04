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
  everyoneBats: boolean;
}

/** A batting slot that may or may not be filled */
interface SlotState {
  playerId: string | null;
  position: PositionNumber | null;
}

/** Defensive positions for non-pitcher fielders */
const FIELD_POSITIONS: PositionNumber[] = [2, 3, 4, 5, 6, 7, 8, 9];

export function LineupBuilder({
  label, players, lineup, onChange, useDH, playersPerSide, everyoneBats,
}: LineupBuilderProps) {
  // Pitcher state — separate from batting order
  const [pitcherId, setPitcherId] = useState<string | null>(() => {
    const pitcherSlot = lineup.find(s => s.position === 1);
    return pitcherSlot?.playerId ?? null;
  });

  // Two-way: pitcher also bats as DH (only relevant when useDH)
  const [twoWay, setTwoWay] = useState<boolean>(() => {
    if (!useDH) return false;
    // If pitcher is also in the lineup as DH, that's two-way
    const pitcherSlot = lineup.find(s => s.position === 1);
    if (!pitcherSlot) return false;
    return lineup.some(s => s.playerId === pitcherSlot.playerId && s.position === 10);
  });

  // Batting order slots (excludes pitcher unless pitcher bats / two-way)
  const battingSlotCount = everyoneBats ? players.length : playersPerSide;
  const [slots, setSlots] = useState<SlotState[]>(() => buildSlots(lineup, battingSlotCount, pitcherId));

  // Re-sync when team, slot count, or DH changes
  useEffect(() => {
    // Reconstruct from lineup prop
    const pitcherInLineup = lineup.find(s => s.position === 1);
    const newPitcherId = pitcherInLineup?.playerId ?? null;
    setPitcherId(newPitcherId);
    setSlots(buildSlots(lineup, everyoneBats ? players.length : playersPerSide, newPitcherId));
    if (!useDH) setTwoWay(false);
  }, [players, playersPerSide, useDH, everyoneBats]);

  // All assigned player IDs (batting + pitcher)
  const assignedBattingIds = new Set(slots.filter(s => s.playerId).map(s => s.playerId!));
  const allAssignedIds = new Set(assignedBattingIds);
  if (pitcherId) allAssignedIds.add(pitcherId);

  // Used positions (from batting slots)
  const usedPositions = new Set<PositionNumber>();
  for (const s of slots) {
    if (s.position) usedPositions.add(s.position);
  }
  if (pitcherId) usedPositions.add(1); // pitcher position always taken

  // Available players for the batting order (exclude pitcher unless two-way)
  const availableForBatting = players.filter(p => {
    if (allAssignedIds.has(p.id)) return false;
    // In DH mode without two-way, pitcher can't bat
    if (useDH && !twoWay && p.id === pitcherId) return false;
    return true;
  });

  // Positions a batter can be assigned
  const batterPositions = (): PositionNumber[] => {
    if (useDH) {
      // Fielders (C-RF) + DH; no P in batting order
      return [...FIELD_POSITIONS, 10];
    }
    // No DH: fielders only (P is separate but bats in order)
    return [...FIELD_POSITIONS];
  };

  // ─── Emit to parent ─────────────────────────────────────
  const emit = (newSlots: SlotState[], newPitcherId: string | null, newTwoWay: boolean) => {
    setSlots(newSlots);
    const filled: LineupSlot[] = [];

    // Add batting order slots (filled ones only)
    for (const s of newSlots) {
      if (s.playerId && s.position) {
        filled.push({ playerId: s.playerId, position: s.position });
      }
    }

    // Add pitcher to lineup
    if (newPitcherId) {
      if (!useDH) {
        // No DH: pitcher bats — add as P at the end of the filled lineup
        // (they're in the batting order but their position is P)
        filled.push({ playerId: newPitcherId, position: 1 });
      } else if (newTwoWay) {
        // Two-way: pitcher bats as DH — already in batting slots as DH
        // Also need the P position in the lineup for fielding reference
        filled.push({ playerId: newPitcherId, position: 1 });
      } else {
        // Standard DH: pitcher fields but doesn't bat — still store for fielding
        filled.push({ playerId: newPitcherId, position: 1 });
      }
    }

    onChange(filled);
  };

  // ─── Handlers ────────────────────────────────────────────
  const handlePitcherChange = (id: string | null) => {
    const oldPitcherId = pitcherId;
    setPitcherId(id);

    let next = [...slots];

    // If two-way was on and pitcher changed, clear the old two-way slot
    if (twoWay && oldPitcherId) {
      next = next.map(s =>
        s.playerId === oldPitcherId && s.position === 10
          ? { playerId: null, position: null }
          : s,
      );
    }

    // If two-way is on, insert new pitcher into a batting slot as DH
    if (twoWay && id) {
      const emptyIdx = next.findIndex(s => !s.playerId);
      if (emptyIdx >= 0) {
        next[emptyIdx] = { playerId: id, position: 10 };
      }
    }

    emit(next, id, twoWay);
  };

  const handleTwoWayToggle = (checked: boolean) => {
    setTwoWay(checked);
    let next = [...slots];

    if (checked && pitcherId) {
      // Add pitcher as DH in first empty slot
      const emptyIdx = next.findIndex(s => !s.playerId);
      if (emptyIdx >= 0) {
        next[emptyIdx] = { playerId: pitcherId, position: 10 };
      }
    } else if (!checked && pitcherId) {
      // Remove pitcher from batting order
      next = next.map(s =>
        s.playerId === pitcherId ? { playerId: null, position: null } : s,
      );
    }

    emit(next, pitcherId, checked);
  };

  const setPlayer = (index: number, playerId: string | null) => {
    const next = [...slots];
    if (playerId) {
      // Default position: first applicable position from player's roster
      const player = players.find(p => p.id === playerId);
      let defaultPos: PositionNumber = useDH ? 10 : 2;
      if (player) {
        const bPositions = batterPositions();
        const match = player.positions.find(p => bPositions.includes(p as PositionNumber));
        if (match) defaultPos = match as PositionNumber;
      }
      next[index] = { playerId, position: defaultPos };
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

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...slots];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    emit(next, pitcherId, twoWay);
  };

  const moveDown = (index: number) => {
    if (index >= slots.length - 1) return;
    const next = [...slots];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    emit(next, pitcherId, twoWay);
  };

  const clearSlot = (index: number) => {
    const next = [...slots];
    next[index] = { playerId: null, position: null };
    emit(next, pitcherId, twoWay);
  };

  const getPlayerLabel = (playerId: string) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return 'Unknown';
    const num = p.number != null ? `#${p.number} ` : '';
    return `${num}${p.firstName} ${p.lastName}`;
  };

  const filledCount = slots.filter(s => s.playerId).length;
  const bPositions = batterPositions();

  return (
    <div className="team-section">
      <span className="section-label">{label}</span>

      {/* ── Starting Pitcher ─────────────── */}
      <div className="pitcher-section">
        <label className="pitcher-label">Starting Pitcher</label>
        <select
          className="pitcher-picker"
          value={pitcherId ?? ''}
          onChange={e => handlePitcherChange(e.target.value || null)}
        >
          <option value="">— Select pitcher —</option>
          {players
            .filter(p => p.id === pitcherId || !assignedBattingIds.has(p.id) || (twoWay && p.id === pitcherId))
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.number != null ? `#${p.number} ` : ''}{p.firstName} {p.lastName}
              </option>
            ))}
        </select>
        {useDH && pitcherId && (
          <label className="two-way-toggle">
            <input
              type="checkbox"
              checked={twoWay}
              onChange={e => handleTwoWayToggle(e.target.checked)}
            />
            Pitcher also bats (two-way)
          </label>
        )}
        {!useDH && pitcherId && (
          <span className="pitcher-note">Pitcher bats in the lineup</span>
        )}
      </div>

      {/* ── Batting Order ────────────────── */}
      <div className="batting-header">
        <span>Batting Order ({filledCount}/{battingSlotCount})</span>
      </div>

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
                >
                  {bPositions.map(pos => (
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
                >×</button>
              </>
            ) : (
              <select
                className="player-picker"
                value=""
                onChange={e => setPlayer(i, e.target.value || null)}
              >
                <option value="">— Select player —</option>
                {availableForBatting
                  .filter(p => !assignedBattingIds.has(p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.number != null ? `#${p.number} ` : ''}{p.firstName} {p.lastName}
                      {' '}({p.positions.map(pos => POSITION_LABELS[pos as PositionNumber]).join('/')})
                    </option>
                  ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Build initial slot state from lineup, pulling pitcher out of the batting order */
function buildSlots(lineup: LineupSlot[], count: number, pitcherId: string | null): SlotState[] {
  // Filter out the pitcher's P-position entry from batting slots
  const battingEntries = lineup.filter(s => !(s.position === 1 && s.playerId === pitcherId));
  return Array.from({ length: count }, (_, i) => {
    if (i < battingEntries.length) {
      return { playerId: battingEntries[i].playerId, position: battingEntries[i].position };
    }
    return { playerId: null, position: null };
  });
}
