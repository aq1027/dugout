import { useEffect, useState, useMemo } from 'react'
import { db } from '../db'
import type { Game } from '../models/game'
import type { Player } from '../models/player'
import type { Team } from '../models/team'
import { displayPlayerName } from '../models/player'
import { computeSituationalBattingStats, type SituationalBattingStats } from '../engine/statsEngine'
import { deriveGameState } from '../engine/gameEngine'

type SortKey = 'name' | 'pa' | 'avg' | 'obp' | 'slg' | 'ops' | 'hr' | 'rbi' | 'h' | 'avgRisp' | 'twoOutRbi' | 'sb';

function fmt(n: number, decimals: number): string {
  if (decimals === 0) return String(n);
  return n.toFixed(decimals).replace(/^0\./, '.');
}

export function StatsPage() {
  const [games, setGames] = useState<Game[]>([])
  const [players, setPlayers] = useState<Map<string, Player>>(new Map())
  const [teams, setTeams] = useState<Map<string, Team>>(new Map())
  const [selectedTeam, setSelectedTeam] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('avg')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    Promise.all([
      db.games.where('status').anyOf('in_progress', 'final').toArray(),
      db.players.toArray(),
      db.teams.toArray(),
    ]).then(([g, p, t]) => {
      setGames(g)
      const pm = new Map<string, Player>()
      for (const pl of p) pm.set(pl.id, pl)
      setPlayers(pm)
      const tm = new Map<string, Team>()
      for (const te of t) tm.set(te.id, te)
      setTeams(tm)
    })
  }, [])

  // Aggregate stats scoped to selected team
  const { teamSummary, playerStats } = useMemo(() => {
    // Collect all events per player across games, partitioned by team
    const playerEvents = new Map<string, { teamId: string; events: Game['events'] }[]>()

    // Per-team game tracking for summary cards
    const teamGameIds = new Map<string, Set<string>>() // teamId → set of gameIds
    const teamRuns = new Map<string, number>()
    const teamLOB = new Map<string, number>()

    for (const game of games) {
      const state = deriveGameState(game)

      // Away team
      const awayGames = teamGameIds.get(game.awayTeamId) || new Set()
      awayGames.add(game.id)
      teamGameIds.set(game.awayTeamId, awayGames)
      teamRuns.set(game.awayTeamId, (teamRuns.get(game.awayTeamId) || 0) + state.awayScore)
      teamLOB.set(game.awayTeamId, (teamLOB.get(game.awayTeamId) || 0) + state.awayLOB)

      // Home team
      const homeGames = teamGameIds.get(game.homeTeamId) || new Set()
      homeGames.add(game.id)
      teamGameIds.set(game.homeTeamId, homeGames)
      teamRuns.set(game.homeTeamId, (teamRuns.get(game.homeTeamId) || 0) + state.homeScore)
      teamLOB.set(game.homeTeamId, (teamLOB.get(game.homeTeamId) || 0) + state.homeLOB)

      // Collect events for away lineup players
      for (const slot of game.awayLineup.startingOrder) {
        const entry = playerEvents.get(slot.playerId) || []
        entry.push({ teamId: game.awayTeamId, events: game.events })
        playerEvents.set(slot.playerId, entry)
      }
      for (const sub of game.awayLineup.substitutions) {
        if (sub.inPlayerId !== sub.outPlayerId) {
          const entry = playerEvents.get(sub.inPlayerId) || []
          entry.push({ teamId: game.awayTeamId, events: game.events })
          playerEvents.set(sub.inPlayerId, entry)
        }
      }

      // Collect events for home lineup players
      for (const slot of game.homeLineup.startingOrder) {
        const entry = playerEvents.get(slot.playerId) || []
        entry.push({ teamId: game.homeTeamId, events: game.events })
        playerEvents.set(slot.playerId, entry)
      }
      for (const sub of game.homeLineup.substitutions) {
        if (sub.inPlayerId !== sub.outPlayerId) {
          const entry = playerEvents.get(sub.inPlayerId) || []
          entry.push({ teamId: game.homeTeamId, events: game.events })
          playerEvents.set(sub.inPlayerId, entry)
        }
      }
    }

    // Compute aggregated stats per player
    const statsMap = new Map<string, SituationalBattingStats & { teamId: string }>()
    for (const [playerId, gameEntries] of playerEvents) {
      const aggrStats: SituationalBattingStats = {
        playerId,
        pa: 0, ab: 0, h: 0, singles: 0, doubles: 0, triples: 0, hr: 0,
        rbi: 0, bb: 0, so: 0, hbp: 0, sf: 0, sh: 0, sb: 0, cs: 0,
        avg: 0, obp: 0, slg: 0, ops: 0,
        abRisp: 0, hRisp: 0, avgRisp: 0, twoOutRbi: 0, lob: 0,
      }

      let teamId = ''
      for (const entry of gameEntries) {
        teamId = entry.teamId
        const s = computeSituationalBattingStats(entry.events, playerId)
        aggrStats.pa += s.pa; aggrStats.ab += s.ab; aggrStats.h += s.h;
        aggrStats.singles += s.singles; aggrStats.doubles += s.doubles;
        aggrStats.triples += s.triples; aggrStats.hr += s.hr;
        aggrStats.rbi += s.rbi; aggrStats.bb += s.bb; aggrStats.so += s.so;
        aggrStats.hbp += s.hbp; aggrStats.sf += s.sf; aggrStats.sh += s.sh;
        aggrStats.sb += s.sb; aggrStats.cs += s.cs;
        aggrStats.abRisp += s.abRisp; aggrStats.hRisp += s.hRisp;
        aggrStats.twoOutRbi += s.twoOutRbi; aggrStats.lob += s.lob;
      }

      // Recompute rate stats from aggregated counting stats
      aggrStats.avg = aggrStats.ab > 0 ? aggrStats.h / aggrStats.ab : 0
      const obpDenom = aggrStats.ab + aggrStats.bb + aggrStats.hbp + aggrStats.sf
      aggrStats.obp = obpDenom > 0 ? (aggrStats.h + aggrStats.bb + aggrStats.hbp) / obpDenom : 0
      const tb = aggrStats.singles + aggrStats.doubles * 2 + aggrStats.triples * 3 + aggrStats.hr * 4
      aggrStats.slg = aggrStats.ab > 0 ? tb / aggrStats.ab : 0
      aggrStats.ops = aggrStats.obp + aggrStats.slg
      aggrStats.avgRisp = aggrStats.abRisp > 0 ? aggrStats.hRisp / aggrStats.abRisp : 0

      if (aggrStats.pa > 0) {
        statsMap.set(playerId, { ...aggrStats, teamId })
      }
    }

    // Build team-scoped summary — aggregate across selected team or all
    const relevantTeamIds = selectedTeam !== 'all'
      ? [selectedTeam]
      : Array.from(teamGameIds.keys())

    let summaryGames = 0
    let summaryRuns = 0
    let summaryLOB = 0
    let summaryHits = 0
    let summaryAB = 0

    for (const tid of relevantTeamIds) {
      summaryGames += teamGameIds.get(tid)?.size || 0
      summaryRuns += teamRuns.get(tid) || 0
      summaryLOB += teamLOB.get(tid) || 0
    }

    // Sum hits/AB from player stats for the relevant team(s)
    for (const [, ps] of statsMap) {
      if (selectedTeam !== 'all' && ps.teamId !== selectedTeam) continue
      summaryHits += ps.h
      summaryAB += ps.ab
    }

    return {
      teamSummary: {
        gamesPlayed: summaryGames,
        runsPerGame: summaryGames > 0 ? summaryRuns / summaryGames : 0,
        totalLOB: summaryLOB,
        teamAvg: summaryAB > 0 ? summaryHits / summaryAB : 0,
      },
      playerStats: statsMap,
    }
  }, [games, selectedTeam])

  // Filter and sort
  const sortedPlayers = useMemo(() => {
    let entries = Array.from(playerStats.entries())
      .map(([id, stats]) => ({ id, stats, player: players.get(id) }))
      .filter(e => e.player && e.stats.pa > 0)

    if (selectedTeam !== 'all') {
      entries = entries.filter(e => e.stats.teamId === selectedTeam)
    }

    entries.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0
      switch (sortKey) {
        case 'name':
          av = a.player ? displayPlayerName(a.player) : ''
          bv = b.player ? displayPlayerName(b.player) : ''
          return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string)
        case 'pa': av = a.stats.pa; bv = b.stats.pa; break
        case 'avg': av = a.stats.avg; bv = b.stats.avg; break
        case 'obp': av = a.stats.obp; bv = b.stats.obp; break
        case 'slg': av = a.stats.slg; bv = b.stats.slg; break
        case 'ops': av = a.stats.ops; bv = b.stats.ops; break
        case 'hr': av = a.stats.hr; bv = b.stats.hr; break
        case 'rbi': av = a.stats.rbi; bv = b.stats.rbi; break
        case 'h': av = a.stats.h; bv = b.stats.h; break
        case 'avgRisp': av = a.stats.avgRisp; bv = b.stats.avgRisp; break
        case 'twoOutRbi': av = a.stats.twoOutRbi; bv = b.stats.twoOutRbi; break
        case 'sb': av = a.stats.sb; bv = b.stats.sb; break
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

    return entries
  }, [playerStats, players, selectedTeam, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const sortIcon = (key: SortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  const teamList = Array.from(teams.values())

  return (
    <div className="home">
      <h2>Stats Dashboard</h2>

      {/* Team selector at top */}
      <div style={{ margin: '8px 0 4px' }}>
        <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
          <option value="all">All Teams</option>
          {teamList.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards — scoped to selected team */}
      <div className="stats-cards">
        <div className="stats-card">
          <div className="stats-card-value">{teamSummary.gamesPlayed}</div>
          <div className="stats-card-label">Games</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">{teamSummary.gamesPlayed > 0 ? teamSummary.runsPerGame.toFixed(1) : '0.0'}</div>
          <div className="stats-card-label">Runs / G</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">{fmt(teamSummary.teamAvg, 3)}</div>
          <div className="stats-card-label">Team AVG</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">{teamSummary.totalLOB}</div>
          <div className="stats-card-label">LOB</div>
        </div>
      </div>

      {/* Player stats table */}
      {sortedPlayers.length > 0 ? (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th className="stats-player-col" onClick={() => handleSort('name')}>Player{sortIcon('name')}</th>
                <th onClick={() => handleSort('pa')}>PA{sortIcon('pa')}</th>
                <th onClick={() => handleSort('h')}>H{sortIcon('h')}</th>
                <th onClick={() => handleSort('hr')}>HR{sortIcon('hr')}</th>
                <th onClick={() => handleSort('rbi')}>RBI{sortIcon('rbi')}</th>
                <th onClick={() => handleSort('avg')}>AVG{sortIcon('avg')}</th>
                <th onClick={() => handleSort('obp')}>OBP{sortIcon('obp')}</th>
                <th onClick={() => handleSort('slg')}>SLG{sortIcon('slg')}</th>
                <th onClick={() => handleSort('ops')}>OPS{sortIcon('ops')}</th>
                <th onClick={() => handleSort('avgRisp')}>RISP{sortIcon('avgRisp')}</th>
                <th onClick={() => handleSort('twoOutRbi')}>2oRBI{sortIcon('twoOutRbi')}</th>
                <th onClick={() => handleSort('sb')}>SB{sortIcon('sb')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map(({ id, stats, player }) => (
                <tr key={id}>
                  <td className="stats-player-col">{player ? displayPlayerName(player) : '??'}</td>
                  <td>{stats.pa}</td>
                  <td>{stats.h}</td>
                  <td>{stats.hr}</td>
                  <td>{stats.rbi}</td>
                  <td>{stats.ab > 0 ? fmt(stats.avg, 3) : fmt(0, 3)}</td>
                  <td>{stats.ab > 0 || stats.bb > 0 || stats.hbp > 0 ? fmt(stats.obp, 3) : fmt(0, 3)}</td>
                  <td>{stats.ab > 0 ? fmt(stats.slg, 3) : fmt(0, 3)}</td>
                  <td>{stats.ab > 0 || stats.bb > 0 || stats.hbp > 0 ? fmt(stats.ops, 3) : fmt(0, 3)}</td>
                  <td>{stats.abRisp > 0 ? fmt(stats.avgRisp, 3) : '---'}</td>
                  <td>{stats.twoOutRbi}</td>
                  <td>{stats.sb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
          No batting stats yet. Score a game to see stats here.
        </p>
      )}
    </div>
  )
}
