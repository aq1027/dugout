import { useEffect, useState } from 'react'
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

      <button className="primary" style={{ marginTop: 8 }}>
        + New Game
      </button>

      {games.length > 0 && (
        <div className="game-list">
          {games.map(game => (
            <div key={game.id} className="game-list-item">
              <div>
                <div className="teams">
                  {game.awayTeamName} @ {game.homeTeamName}
                </div>
                <div className="meta">
                  {new Date(game.date).toLocaleDateString()} · {game.status}
                </div>
              </div>
            </div>
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
