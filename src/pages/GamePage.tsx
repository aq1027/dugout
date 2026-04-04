import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db } from '../db'
import type { Game } from '../models/game'
import { deriveGameState } from '../engine/gameEngine'

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    if (gameId) {
      db.games.get(gameId).then(g => setGame(g ?? null))
    }
  }, [gameId])

  if (!game) {
    return (
      <div className="home">
        <p>Loading game…</p>
        <Link to="/games">← Back to games</Link>
      </div>
    )
  }

  const state = deriveGameState(game)

  return (
    <div className="home">
      <Link to="/games" style={{ alignSelf: 'flex-start', fontSize: 14 }}>← Back to games</Link>
      <h2>{game.awayTeamName} @ {game.homeTeamName}</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
        {game.sport === 'baseball' ? '⚾' : '🥎'} {game.sport} · {game.rules.innings} innings · {game.status}
      </p>

      {/* Minimal line score preview */}
      <div style={{
        padding: 16,
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border)',
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 1.8,
      }}>
        <div>
          {state.halfInning === 'top' ? '▶' : ' '} {game.awayTeamName.padEnd(12).slice(0, 12)} {state.awayScore}
        </div>
        <div>
          {state.halfInning === 'bottom' ? '▶' : ' '} {game.homeTeamName.padEnd(12).slice(0, 12)} {state.homeScore}
        </div>
        <div style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>
          Inning {state.inning} · {state.outs} out{state.outs !== 1 ? 's' : ''}
        </div>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 16 }}>
        Live scoring UI coming in Phase 3.
      </p>
    </div>
  )
}
