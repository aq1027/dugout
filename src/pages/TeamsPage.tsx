import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Team } from '../models/team'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])

  useEffect(() => {
    db.teams.orderBy('name').toArray().then(setTeams)
  }, [])

  return (
    <div className="home">
      <h2>Teams</h2>
      <p>Manage your team rosters. Teams persist across games and seasons.</p>

      <button className="primary" style={{ marginTop: 8 }}>
        + New Team
      </button>

      {teams.length > 0 && (
        <div className="game-list">
          {teams.map(team => (
            <div key={team.id} className="game-list-item">
              <div className="teams">{team.name}</div>
              <div className="meta">{team.playerIds.length} players</div>
            </div>
          ))}
        </div>
      )}

      {teams.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
          No teams yet. Create a team to build your roster!
        </p>
      )}
    </div>
  )
}
