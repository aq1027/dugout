import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import type { Game } from '../models/game'

export function GamesPage() {
  const [games, setGames] = useState<Game[]>([])

  useEffect(() => {
    db.games.orderBy('date').reverse().toArray().then(setGames)
  }, [])

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
            <Link key={game.id} to={`/game/${game.id}`} className="game-list-item">
              <div>
                <div className="teams">
                  {game.awayTeamName} @ {game.homeTeamName}
                </div>
                <div className="meta">
                  {new Date(game.date).toLocaleDateString()} · {game.status}
                  {game.sport === 'softball' ? ' · 🥎' : ' · ⚾'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {games.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
          No games yet. Create a new game to get started!
        </p>
      )}
    </div>
  )
}
