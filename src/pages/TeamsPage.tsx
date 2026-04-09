import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { exportTeam, downloadTeamJson, importTeamFile } from '../db/exportImport'
import type { Team } from '../models/team'
import type { Player } from '../models/player'
import type { PositionNumber } from '../models/common'
import { POSITION_LABELS } from '../models/common'
import { generateId } from '../utils/id'
import { ConfirmDialog } from '../components/Scoring/UndoButton'
import '../components/GameSetup/GameSetup.css'

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
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  // Edit player state
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const [editPos, setEditPos] = useState<PositionNumber>(1)

  // Duplicate jersey number warning helper
  const getDupeWarning = (num: string, excludeId?: string): string | null => {
    if (!num.trim()) return null
    const parsed = parseInt(num)
    const dupe = players.find(p => p.number === parsed && p.id !== excludeId)
    if (!dupe) return null
    const name = [dupe.firstName, dupe.lastName].filter(Boolean).join(' ') || 'another player'
    return `#${parsed} is already assigned to ${name}`
  }

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
    if (!selectedTeam) return
    const first = newFirst.trim()
    const last = newLast.trim()
    const num = newNumber.trim()
    if (!num && !first && !last) return // need at least # or a name
    const player: Player = {
      id: generateId(),
      firstName: first || undefined,
      lastName: last || undefined,
      number: num ? parseInt(num) : undefined,
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

  const startEditPlayer = (p: Player) => {
    setEditingPlayer(p.id)
    setEditFirst(p.firstName ?? '')
    setEditLast(p.lastName ?? '')
    setEditNumber(p.number != null ? String(p.number) : '')
    setEditPos(p.positions[0] ?? 1)
  }

  const saveEditPlayer = async () => {
    if (!editingPlayer) return
    const updates: Partial<Player> = {
      firstName: editFirst.trim() || undefined,
      lastName: editLast.trim() || undefined,
      number: editNumber.trim() ? parseInt(editNumber) : undefined,
      positions: [editPos],
    }
    await db.players.update(editingPlayer, updates)
    setPlayers(prev => prev.map(p => p.id === editingPlayer ? { ...p, ...updates } : p))
    setEditingPlayer(null)
  }

  const cancelEditPlayer = () => {
    setEditingPlayer(null)
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

  const handleExportTeam = async (team: Team) => {
    const data = await exportTeam(team.id)
    const safeName = team.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    downloadTeamJson(data, `${safeName}-roster.json`)
  }

  const toggleMyTeam = async (team: Team) => {
    const newVal = !team.isMine
    await db.teams.update(team.id, { isMine: newVal, updatedAt: new Date().toISOString() })
    if (selectedTeam?.id === team.id) setSelectedTeam({ ...selectedTeam, isMine: newVal })
    await loadTeams()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importTeamFile(file)
      setImportMsg(`Imported "${result.teamName}" with ${result.playerCount} players`)
      await loadTeams()
    } catch (err) {
      setImportMsg(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    // Reset input so the same file can be re-selected
    if (importFileRef.current) importFileRef.current.value = ''
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ flex: 1, minWidth: 0 }}>{selectedTeam.name}</h2>
            <button
              onClick={() => toggleMyTeam(selectedTeam)}
              style={{ fontSize: 16, padding: '4px 10px', color: selectedTeam.isMine ? '#eab308' : 'var(--color-text-muted)' }}
              title={selectedTeam.isMine ? 'Unmark as my team' : 'Mark as my team'}
            >
              {selectedTeam.isMine ? '★' : '☆'}
            </button>
            <button
              onClick={() => { setEditName(selectedTeam.name); setEditingName(true); }}
              style={{ fontSize: 13, padding: '4px 10px' }}
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => handleExportTeam(selectedTeam)}
              style={{ fontSize: 13, padding: '4px 10px' }}
            >
              📤 Export
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

        <div className="roster-list">
          {players.map(p => (
            editingPlayer === p.id ? (
              <div key={p.id} className="add-player-row" style={{ padding: '6px 0' }}>
                <input
                  type="text"
                  placeholder="#"
                  value={editNumber}
                  onChange={e => setEditNumber(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  maxLength={3}
                />
                <input
                  type="text"
                  placeholder="First"
                  value={editFirst}
                  onChange={e => setEditFirst(e.target.value)}
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Last"
                  value={editLast}
                  onChange={e => setEditLast(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEditPlayer()}
                />
                <select
                  value={editPos}
                  onChange={e => setEditPos(parseInt(e.target.value) as PositionNumber)}
                >
                  {(Object.entries(POSITION_LABELS) as [string, string][]).map(([num, lbl]) => (
                    <option key={num} value={num}>{lbl}</option>
                  ))}
                </select>
                <button onClick={saveEditPlayer} className="primary" style={{ minHeight: 'var(--tap-target)', minWidth: 'var(--tap-target)', padding: 0, fontSize: 16 }}>✓</button>
                <button onClick={cancelEditPlayer} style={{ minHeight: 'var(--tap-target)', minWidth: 'var(--tap-target)', padding: 0, fontSize: 16 }}>✕</button>
                {getDupeWarning(editNumber, editingPlayer ?? undefined) && (
                  <div style={{ fontSize: 12, color: 'var(--color-warning, #b58900)', width: '100%', padding: '2px 0 0 4px' }}>
                    ⚠ {getDupeWarning(editNumber, editingPlayer ?? undefined)}
                  </div>
                )}
              </div>
            ) : (
              <div key={p.id} className="roster-item" onClick={() => startEditPlayer(p)} style={{ cursor: 'pointer' }}>
                <span className="player-number">
                  {p.number ?? '—'}
                </span>
                <span className="player-name" style={{ flex: 1, minWidth: 0 }}>
                  {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
                </span>
                <span className="player-pos">
                  {p.positions.map(pos => POSITION_LABELS[pos]).join('/')}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removePlayer(p.id); }}
                  className="remove-btn"
                >
                  ×
                </button>
              </div>
            )
          ))}
        </div>

        {/* Add player form */}
        <div className="add-player-row">
          <input
            type="text"
            placeholder="#"
            value={newNumber}
            onChange={e => setNewNumber(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            maxLength={3}
          />
          <input
            type="text"
            placeholder="First"
            value={newFirst}
            onChange={e => setNewFirst(e.target.value)}
          />
          <input
            type="text"
            placeholder="Last"
            value={newLast}
            onChange={e => setNewLast(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPlayer()}
          />
          <select
            value={newPos}
            onChange={e => setNewPos(parseInt(e.target.value) as PositionNumber)}
          >
            {(Object.entries(POSITION_LABELS) as [string, string][]).map(([num, lbl]) => (
              <option key={num} value={num}>{lbl}</option>
            ))}
          </select>
          <button onClick={addPlayer} className="primary">+</button>
        </div>
        {getDupeWarning(newNumber) && (
          <div style={{ fontSize: 12, color: 'var(--color-warning, #b58900)', padding: '2px 0 0 4px' }}>
            ⚠ {getDupeWarning(newNumber)}
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

      <button style={{ marginTop: 4 }} onClick={() => importFileRef.current?.click()}>
        📥 Import Roster
      </button>
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {importMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 'var(--radius)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

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
          {(() => {
            const myTeams = teams.filter(t => t.isMine)
            const otherTeams = teams.filter(t => !t.isMine)
            return (
              <>
                {myTeams.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
                      My Teams
                    </div>
                    {myTeams.map(team => (
                      <div key={team.id} className="game-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                          onClick={() => selectTeam(team)}
                          style={{ textAlign: 'left', cursor: 'pointer', flex: 1, background: 'none', border: 'none', padding: '8px 0', color: 'inherit' }}
                        >
                          <div className="teams">★ {team.name}</div>
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
                  </>
                )}
                {otherTeams.length > 0 && (
                  <>
                    {myTeams.length > 0 && (
                      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
                        Other Teams
                      </div>
                    )}
                    {otherTeams.map(team => (
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
                  </>
                )}
              </>
            )
          })()}
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
