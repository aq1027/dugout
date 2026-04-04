import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import type { Game } from '../models/game'
import { ConfirmDialog } from '../components/Scoring/UndoButton'

export function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)

  const loadGames = () => db.games.orderBy('date').reverse().toArray().then(setGames)

  useEffect(() => { loadGames() }, [])

  const deleteGame = async (game: Game) => {
    await db.games.delete(game.id)
    setDeleteTarget(null)
    await loadGames()
  }

  return (
    <div className="home">
      <h2>Games</h2>
      <p>Your scored games will appear here. Start a new game to begin scoring.</p>

      <Link to="/game/new" className="action-card" style={{ display: 'inline-flex', flexDirection: 'row', gap: 8, padding: '12px 20px', alignSelf: 'flex-start' }}>
        <span>🏟️</span> New Game
      </Link>

      {games.length > 0 && (
        <div className="game-list">
          {games.map(game => (
            <div key={game.id} className="game-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Link to={`/game/${game.id}`} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>
                <div className="teams">
                  {game.awayTeamName} @ {game.homeTeamName}
                </div>
                <div className="meta">
                  {new Date(game.date).toLocaleDateString()} · {game.status}
                  {game.sport === 'softball' ? ' · 🥎' : ' · ⚾'}
                </div>
              </Link>
              <button
                onClick={() => setDeleteTarget(game)}
                style={{ minHeight: 28, minWidth: 28, padding: 0, color: 'var(--color-error)', background: 'none', fontSize: 16 }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {games.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
          No games yet. Create a new game to get started!
        </p>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Game"
          message={`Delete ${deleteTarget.awayTeamName} @ ${deleteTarget.homeTeamName}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteGame(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
