import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Team } from '../models/team'
import type { Player } from '../models/player'
import type { PositionNumber } from '../models/common'
import { POSITION_LABELS } from '../models/common'
import { generateId } from '../utils/id'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')

  // New player form
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newNumber, setNewNumber] = useState('')
  const [newPos, setNewPos] = useState<PositionNumber>(1)

  const loadTeams = () => db.teams.orderBy('name').toArray().then(setTeams)

  useEffect(() => { loadTeams() }, [])

  const selectTeam = async (team: Team) => {
    setSelectedTeam(team)
    const p = await db.players.where('teamId').equals(team.id).toArray()
    setPlayers(p)
    setShowNewForm(false)
  }

  const createTeam = async () => {
    if (!newName.trim()) return
    const now = new Date().toISOString()
    const team: Team = {
      id: generateId(),
      name: newName.trim(),
      playerIds: [],
      createdAt: now,
      updatedAt: now,
    }
    await db.teams.put(team)
    setNewName('')
    setShowNewForm(false)
    await loadTeams()
    selectTeam(team)
  }

  const addPlayer = async () => {
    if (!selectedTeam || (!newFirst.trim() && !newLast.trim())) return
    const player: Player = {
      id: generateId(),
      firstName: newFirst.trim(),
      lastName: newLast.trim(),
      number: newNumber ? parseInt(newNumber) : undefined,
      positions: [newPos],
      teamId: selectedTeam.id,
    }
    await db.players.put(player)
    const updatedIds = [...selectedTeam.playerIds, player.id]
    await db.teams.update(selectedTeam.id, {
      playerIds: updatedIds,
      updatedAt: new Date().toISOString(),
    })
    setSelectedTeam({ ...selectedTeam, playerIds: updatedIds })
    setPlayers(prev => [...prev, player])
    setNewFirst('')
    setNewLast('')
    setNewNumber('')
  }

  const removePlayer = async (playerId: string) => {
    if (!selectedTeam) return
    await db.players.delete(playerId)
    const updatedIds = selectedTeam.playerIds.filter(id => id !== playerId)
    await db.teams.update(selectedTeam.id, {
      playerIds: updatedIds,
      updatedAt: new Date().toISOString(),
    })
    setSelectedTeam({ ...selectedTeam, playerIds: updatedIds })
    setPlayers(prev => prev.filter(p => p.id !== playerId))
  }

  if (selectedTeam) {
    return (
      <div className="home">
        <button onClick={() => setSelectedTeam(null)} style={{ alignSelf: 'flex-start' }}>
          ← Back to teams
        </button>
        <h2>{selectedTeam.name}</h2>
        <p>Roster · {players.length} players</p>

        <div className="roster-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {players.map(p => (
            <div key={p.id} className="game-list-item">
              <div>
                <span style={{ color: 'var(--color-primary)', fontWeight: 700, marginRight: 8 }}>
                  #{p.number ?? '—'}
                </span>
                {p.firstName} {p.lastName}
                <span style={{ color: 'var(--color-text-muted)', marginLeft: 8, fontSize: 13 }}>
                  {p.positions.map(pos => POSITION_LABELS[pos]).join('/')}
                </span>
              </div>
              <button
                onClick={() => removePlayer(p.id)}
                style={{ minHeight: 28, minWidth: 28, padding: 0, color: 'var(--color-error)', background: 'none' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 72px 36px', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="#"
            value={newNumber}
            onChange={e => setNewNumber(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            maxLength={3}
            style={{ padding: '8px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, minHeight: 'var(--tap-target)' }}
          />
          <input
            type="text"
            placeholder="First Last"
            value={newFirst ? `${newFirst}${newLast ? ' ' + newLast : ''}` : ''}
            onChange={e => {
              const parts = e.target.value.split(' ')
              setNewFirst(parts[0] ?? '')
              setNewLast(parts.slice(1).join(' '))
            }}
            style={{ padding: '8px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, minHeight: 'var(--tap-target)' }}
          />
          <select
            value={newPos}
            onChange={e => setNewPos(parseInt(e.target.value) as PositionNumber)}
            style={{ padding: '4px 6px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, minHeight: 'var(--tap-target)' }}
          >
            {(Object.entries(POSITION_LABELS) as [string, string][]).map(([num, lbl]) => (
              <option key={num} value={num}>{lbl}</option>
            ))}
          </select>
          <button onClick={addPlayer} className="primary" style={{ minHeight: 'var(--tap-target)', padding: 0, fontSize: 20 }}>+</button>
        </div>
      </div>
    )
  }

  return (
    <div className="home">
      <h2>Teams</h2>
      <p>Manage your team rosters. Teams persist across games and seasons.</p>

      <button className="primary" style={{ marginTop: 8 }} onClick={() => setShowNewForm(!showNewForm)}>
        + New Team
      </button>

      {showNewForm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Team name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTeam()}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, minHeight: 'var(--tap-target)' }}
          />
          <button className="primary" onClick={createTeam}>Create</button>
        </div>
      )}

      {teams.length > 0 && (
        <div className="game-list">
          {teams.map(team => (
            <button
              key={team.id}
              className="game-list-item"
              onClick={() => selectTeam(team)}
              style={{ textAlign: 'left', cursor: 'pointer' }}
            >
              <div className="teams">{team.name}</div>
              <div className="meta">{team.playerIds.length} players</div>
            </button>
          ))}
        </div>
      )}

      {teams.length === 0 && !showNewForm && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
          No teams yet. Create a team to build your roster!
        </p>
      )}
    </div>
  )
}
