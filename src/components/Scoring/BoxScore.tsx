import type { Id } from '../../models/common';
import { POSITION_LABELS } from '../../models/common';
import type { Game, DerivedGameState } from '../../models/game';
import type { Player } from '../../models/player';
import type { PlayEvent } from '../../models/play';
import type { Substitution } from '../../models/lineup';
import { computeBattingStats } from '../../engine/statsEngine';

interface BoxScoreProps {
  game: Game;
  state: DerivedGameState;
  players: Map<Id, Player>;
}

interface BoxScoreRow {
  playerId: Id;
  isStarter: boolean;
  /** Sub type prefix — null for starters */
  subLabel: string | null;
  /** Position(s) played, e.g. "SS" or "PH-SS" */
  posLabel: string;
  indent: boolean;
}

/** Build the batting order rows for one team, MLB style: starter then indented subs */
function buildTeamRows(game: Game, isAway: boolean): BoxScoreRow[] {
  const lineup = isAway ? game.awayLineup : game.homeLineup;
  const rows: BoxScoreRow[] = [];
  const subLetterCount: Map<number, number> = new Map();

  for (let slot = 0; slot < lineup.startingOrder.length; slot++) {
    const starter = lineup.startingOrder[slot];
    const starterPos = POSITION_LABELS[starter.position];

    rows.push({
      playerId: starter.playerId,
      isStarter: true,
      subLabel: null,
      posLabel: starterPos,
      indent: false,
    });

    // Find player-change subs for this slot
    const slotSubs = lineup.substitutions.filter(
      s => s.orderSlot === slot && s.outPlayerId !== s.inPlayerId
    );

    for (const sub of slotSubs) {
      const letterIdx = subLetterCount.get(slot) ?? 0;
      subLetterCount.set(slot, letterIdx + 1);
      const prefix = String.fromCharCode(97 + letterIdx);

      const typeLabel = subTypeShort(sub.type);
      const pos = POSITION_LABELS[sub.position];
      const posLabel = sub.type === 'defensive' ? pos : `${typeLabel}-${pos}`;

      rows.push({
        playerId: sub.inPlayerId,
        isStarter: false,
        subLabel: `${prefix}-`,
        posLabel,
        indent: true,
      });
    }
  }

  return rows;
}

function subTypeShort(t: Substitution['type']): string {
  switch (t) {
    case 'pinch_hitter': return 'PH';
    case 'pinch_runner': return 'PR';
    case 'defensive': return 'DEF';
    case 'pitching_change': return 'P';
  }
}

function fmt(n: number, decimals: number): string {
  if (decimals === 0) return String(n);
  return n.toFixed(decimals).replace(/^0\./, '.');
}

export function BoxScore({ game, players }: BoxScoreProps) {
  const events = game.events;

  const renderTeam = (isAway: boolean) => {
    const teamName = isAway ? game.awayTeamName : game.homeTeamName;
    const rows = buildTeamRows(game, isAway);

    return (
      <div className="box-team">
        <table className="box-table">
          <thead>
            <tr>
              <th className="box-header-team">Batters - {teamName}</th>
              <th>AB</th>
              <th>R</th>
              <th>H</th>
              <th>RBI</th>
              <th>BB</th>
              <th>K</th>
              <th>AVG</th>
              <th>OPS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const stats = computeBattingStats(events, row.playerId);
              const p = players.get(row.playerId);
              const displayName = p
                ? `${p.lastName}, ${p.firstName.charAt(0)}`
                : '??';

              return (
                <tr key={`${row.playerId}-${i}`} className={row.indent ? 'box-sub-row' : ''}>
                  <td className="box-player-cell">
                    {row.indent && <span className="box-sub-prefix">{row.subLabel}</span>}
                    <span className={row.indent ? 'box-sub-name' : 'box-starter-name'}>
                      {displayName}
                    </span>
                    {' '}
                    <span className="box-pos">{row.posLabel}</span>
                  </td>
                  <td>{stats.ab}</td>
                  <td>{countRuns(events, row.playerId)}</td>
                  <td>{stats.h}</td>
                  <td>{stats.rbi}</td>
                  <td>{stats.bb}</td>
                  <td>{stats.so}</td>
                  <td>{stats.ab > 0 ? fmt(stats.avg, 3) : fmt(0, 3)}</td>
                  <td>{stats.ab > 0 || stats.bb > 0 || stats.hbp > 0 ? fmt(stats.ops, 3) : fmt(0, 3)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="box-totals-row">
              <td className="box-player-cell"><strong>Totals</strong></td>
              {(() => {
                let tAB = 0, tR = 0, tH = 0, tRBI = 0, tBB = 0, tK = 0;
                const seen = new Set<Id>();
                for (const row of rows) {
                  if (seen.has(row.playerId)) continue;
                  seen.add(row.playerId);
                  const s = computeBattingStats(events, row.playerId);
                  tAB += s.ab; tH += s.h; tRBI += s.rbi; tBB += s.bb; tK += s.so;
                  tR += countRuns(events, row.playerId);
                }
                return (
                  <>
                    <td><strong>{tAB}</strong></td>
                    <td><strong>{tR}</strong></td>
                    <td><strong>{tH}</strong></td>
                    <td><strong>{tRBI}</strong></td>
                    <td><strong>{tBB}</strong></td>
                    <td><strong>{tK}</strong></td>
                    <td></td>
                    <td></td>
                  </>
                );
              })()}
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="box-score">
      {renderTeam(true)}
      {renderTeam(false)}
    </div>
  );
}

/** Count how many times a player scored (reached home) */
function countRuns(events: PlayEvent[], playerId: Id): number {
  let runs = 0;
  for (const e of events) {
    for (const m of e.runnerMovements) {
      if (m.runnerId === playerId && m.to === 'home') runs++;
    }
  }
  return runs;
}
