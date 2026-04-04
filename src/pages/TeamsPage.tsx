import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Team } from '../models/team'
import type { Player } from '../models/player'
import type { PositionNumber } from '../models/common'
import { POSITION_LABELS } from '../models/common'
import { generateId } from '../utils/id'
import { ConfirmDialog } from '../components/Scoring/UndoButton'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null)

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

  const renameTeam = async () => {
    if (!selectedTeam || !editName.trim()) return
    await db.teams.update(selectedTeam.id, {
      name: editName.trim(),
      updatedAt: new Date().toISOString(),
    })
    setSelectedTeam({ ...selectedTeam, name: editName.trim() })
    setEditingName(false)
    await loadTeams()
  }

  const deleteTeam = async (team: Team) => {
    // Delete all players on the team
    await db.players.where('teamId').equals(team.id).delete()
    await db.teams.delete(team.id)
    if (selectedTeam?.id === team.id) setSelectedTeam(null)
    setConfirmDelete(null)
    await loadTeams()
  }

  if (selectedTeam) {
    return (
      <div className="home">
        <button onClick={() => setSelectedTeam(null)} style={{ alignSelf: 'flex-start' }}>
          ← Back to teams
        </button>

        {/* Team name — tap to edit */}
        {editingName ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameTeam(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
              style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 18, fontWeight: 700 }}
            />
            <button className="primary" onClick={renameTeam} style={{ minHeight: 'var(--tap-target)' }}>Save</button>
            <button onClick={() => setEditingName(false)} style={{ minHeight: 'var(--tap-target)' }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ flex: 1 }}>{selectedTeam.name}</h2>
            <button
              onClick={() => { setEditName(selectedTeam.name); setEditingName(true); }}
              style={{ fontSize: 13, padding: '4px 10px' }}
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => setConfirmDelete(selectedTeam)}
              style={{ fontSize: 13, padding: '4px 10px', color: 'var(--color-error)' }}
            >
              🗑 Delete
            </button>
          </div>
        )}

        <p>Roster · {players.length} players</p>

        <div className="roster-list" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 56px 28px', gap: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
            <span>No.</span>
            <span>First</span>
            <span>Last</span>
            <span>Pos.</span>
            <span></span>
          </div>
          {players.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 56px 28px', gap: 6, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 14 }}>
                {p.number ?? '—'}
              </span>
              <span style={{ fontSize: 14 }}>{p.firstName}</span>
              <span style={{ fontSize: 14 }}>{p.lastName}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {p.positions.map(pos => POSITION_LABELS[pos]).join('/')}
              </span>
              <button
                onClick={() => removePlayer(p.id)}
                style={{ minHeight: 28, minWidth: 28, padding: 0, color: 'var(--color-error)', background: 'none' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Add player form — separate fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 56px 36px', gap: 6, alignItems: 'center' }}>
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
            placeholder="First"
            value={newFirst}
            onChange={e => setNewFirst(e.target.value)}
            style={{ padding: '8px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, minHeight: 'var(--tap-target)' }}
          />
          <input
            type="text"
            placeholder="Last"
            value={newLast}
            onChange={e => setNewLast(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPlayer()}
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

        {confirmDelete && (
          <ConfirmDialog
            title="Delete Team"
            message={`Delete "${confirmDelete.name}" and all its players? This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => deleteTeam(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
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
            <div key={team.id} className="game-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => selectTeam(team)}
                style={{ textAlign: 'left', cursor: 'pointer', flex: 1, background: 'none', border: 'none', padding: '8px 0', color: 'inherit' }}
              >
                <div className="teams">{team.name}</div>
                <div className="meta">{team.playerIds.length} players</div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(team); }}
                style={{ minHeight: 28, minWidth: 28, padding: 0, color: 'var(--color-error)', background: 'none', fontSize: 16 }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Team"
          message={`Delete "${confirmDelete.name}" and all its players? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteTeam(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {teams.length === 0 && !showNewForm && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
          No teams yet. Create a team to build your roster!
        </p>
      )}
    </div>
  )
}
