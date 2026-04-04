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
}

export function LineupBuilder({ label, players, lineup, onChange, useDH }: LineupBuilderProps) {
  const availablePositions: PositionNumber[] = useDH
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Auto-populate lineup from players if empty
  if (lineup.length === 0 && players.length > 0) {
    const initial: LineupSlot[] = players.map((p, i) => ({
      playerId: p.id,
      position: p.positions[0] ?? ((i % 9) + 1) as PositionNumber,
    }));
    // Trigger the parent immediately
    setTimeout(() => onChange(initial), 0);
    return null;
  }

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...lineup];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index === lineup.length - 1) return;
    const next = [...lineup];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const changePosition = (index: number, pos: PositionNumber) => {
    const next = [...lineup];
    next[index] = { ...next[index], position: pos };
    onChange(next);
  };

  const getPlayerName = (playerId: string) => {
    const p = players.find(pl => pl.id === playerId);
    return p ? `${p.firstName} ${p.lastName}` : 'Unknown';
  };

  const getPlayerNumber = (playerId: string) => {
    const p = players.find(pl => pl.id === playerId);
    return p?.number;
  };

  // Check for duplicate positions
  const positionCounts = new Map<PositionNumber, number>();
  for (const slot of lineup) {
    positionCounts.set(slot.position, (positionCounts.get(slot.position) ?? 0) + 1);
  }
  const duplicatePositions = new Set(
    [...positionCounts.entries()].filter(([pos, count]) => count > 1 && pos !== 10).map(([pos]) => pos)
  );

  return (
    <div className="team-section">
      <span className="section-label">{label} — Batting Order</span>

      {lineup.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          Add players to the roster first.
        </p>
      ) : (
        <>
          <div className="lineup-list">
            {lineup.map((slot, i) => (
              <div key={slot.playerId} className="lineup-slot">
                <span className="slot-name">
                  {getPlayerNumber(slot.playerId) !== undefined && (
                    <span style={{ color: 'var(--color-primary)', marginRight: 6 }}>
                      #{getPlayerNumber(slot.playerId)}
                    </span>
                  )}
                  {getPlayerName(slot.playerId)}
                </span>
                <select
                  value={slot.position}
                  onChange={e => changePosition(i, parseInt(e.target.value) as PositionNumber)}
                  style={duplicatePositions.has(slot.position) ? { borderColor: 'var(--color-warning)' } : {}}
                >
                  {availablePositions.map(pos => (
                    <option key={pos} value={pos}>{POSITION_LABELS[pos]}</option>
                  ))}
                </select>
                <div className="move-btns">
                  <button type="button" onClick={() => moveUp(i)} disabled={i === 0}>▲</button>
                  <button type="button" onClick={() => moveDown(i)} disabled={i === lineup.length - 1}>▼</button>
                </div>
              </div>
            ))}
          </div>

          {duplicatePositions.size > 0 && (
            <div className="validation-msg">
              ⚠ Duplicate positions: {[...duplicatePositions].map(p => POSITION_LABELS[p]).join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
