import { useState, useCallback } from 'react';
import type { Id, PositionNumber } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';
import type { Game } from '../../models/game';
import type { DerivedGameState } from '../../models/game';
import type { Player } from '../../models/player';
import { displayPlayerName } from '../../models/player';
import type { LineupSlot } from '../../models/lineup';

interface PositionChangePanelProps {
  game: Game;
  state: DerivedGameState;
  players: Map<Id, Player>;
  onPositionChange: (updatedGame: Game) => void;
}

/** Get the current lineup slots accounting for substitutions */
function getCurrentSlots(game: Game, isAway: boolean): LineupSlot[] {
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  // Start with starting order, then apply substitutions
  const slots = lineup.startingOrder.map(s => ({ ...s }));
  for (const sub of lineup.substitutions) {
    if (sub.orderSlot < slots.length) {
      slots[sub.orderSlot] = { playerId: sub.inPlayerId, position: sub.position };
    }
  }
  return slots;
}

export function PositionChangePanel({ game, state, players, onPositionChange }: PositionChangePanelProps) {
  const [open, setOpen] = useState(false);

  // Fielding team is the team NOT batting
  const isAwayFielding = state.halfInning === 'bottom';
  const fieldingLabel = isAwayFielding ? game.awayTeamName : game.homeTeamName;
  const slots = getCurrentSlots(game, isAwayFielding);

  const availablePositions: PositionNumber[] = game.rules.useDH
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const handleChange = useCallback((slotIndex: number, newPos: PositionNumber) => {
    const lineupKey = isAwayFielding ? 'awayLineup' : 'homeLineup';
    const lineup = { ...game[lineupKey] };

    // Record as a defensive substitution (same player, new position)
    const slot = slots[slotIndex];
    const sub = {
      inning: state.inning,
      outs: state.outs,
      outPlayerId: slot.playerId,
      inPlayerId: slot.playerId,
      orderSlot: slotIndex,
      position: newPos,
      type: 'defensive' as const,
    };
    lineup.substitutions = [...lineup.substitutions, sub];

    const updatedGame: Game = {
      ...game,
      [lineupKey]: lineup,
      updatedAt: new Date().toISOString(),
    };
    onPositionChange(updatedGame);
  }, [game, isAwayFielding, slots, state, onPositionChange]);

  const getPlayerName = (id: Id) => {
    const p = players.get(id);
    if (!p) return '??';
    return displayPlayerName(p);
  };

  // Check for duplicate positions
  const positionCounts = new Map<PositionNumber, number>();
  for (const slot of slots) {
    positionCounts.set(slot.position, (positionCounts.get(slot.position) ?? 0) + 1);
  }
  const hasDupes = [...positionCounts.values()].some(c => c > 1);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ fontSize: 12, alignSelf: 'flex-start' }}>
        ⚙ Positions
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="outcome-section-label">{fieldingLabel} — Defense</span>
        <button onClick={() => setOpen(false)} style={{ fontSize: 12 }}>Done</button>
      </div>
      {slots.map((slot, i) => (
        <div key={slot.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span style={{ flex: 1 }}>{getPlayerName(slot.playerId)}</span>
          <select
            value={slot.position}
            onChange={e => handleChange(i, parseInt(e.target.value) as PositionNumber)}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius)',
              border: `1px solid ${positionCounts.get(slot.position)! > 1 ? 'var(--color-warning)' : 'var(--color-border)'}`,
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: 13,
              minHeight: 36,
            }}
          >
            {availablePositions.map(pos => (
              <option key={pos} value={pos}>{POSITION_LABELS[pos]}</option>
            ))}
          </select>
        </div>
      ))}
      {hasDupes && (
        <div style={{ color: 'var(--color-warning)', fontSize: 12 }}>
          ⚠ Duplicate positions detected
        </div>
      )}
    </div>
  );
}
