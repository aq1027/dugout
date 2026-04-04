import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db } from '../db'
import type { Game } from '../models/game'
import type { Player } from '../models/player'
import type { Id } from '../models/common'
import type { PlayEvent } from '../models/play'
import { deriveGameState, undoLastEvent } from '../engine/gameEngine'
import { Scoreboard } from '../components/Scoring/Scoreboard'
import { GameStateDisplay } from '../components/Scoring/GameStateDisplay'
import { LineScore } from '../components/Scoring/LineScore'
import { AtBatPanel } from '../components/Scoring/AtBatPanel'
import { BetweenABPanel } from '../components/Scoring/BetweenABPanel'
import { UndoButton } from '../components/Scoring/UndoButton'
import '../components/Scoring/Scoring.css'

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Map<Id, Player>>(new Map())
  const [showLineScore, setShowLineScore] = useState(false)

  // Load game and players
  useEffect(() => {
    if (!gameId) return
    db.games.get(gameId).then(g => {
      if (!g) return
      setGame(g)
      // Load all players for both teams
      const teamIds = [g.awayTeamId, g.homeTeamId]
      db.players.where('teamId').anyOf(teamIds).toArray().then(ps => {
        const map = new Map<Id, Player>()
        for (const p of ps) map.set(p.id, p)
        setPlayers(map)
      })
    })
  }, [gameId])

  // Persist event and update game
  const handleEvent = useCallback(async (event: PlayEvent) => {
    if (!game) return
    const updatedGame: Game = {
      ...game,
      events: [...game.events, event],
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
    }
    await db.games.put(updatedGame)
    setGame(updatedGame)
  }, [game])

  // Undo last event
  const handleUndo = useCallback(async () => {
    if (!game) return
    const newEvents = undoLastEvent(game)
    const updatedGame: Game = {
      ...game,
      events: newEvents,
      status: newEvents.length === 0 ? 'setup' : 'in_progress',
      updatedAt: new Date().toISOString(),
    }
    await db.games.put(updatedGame)
    setGame(updatedGame)
  }, [game])

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
    <div className="scoring-layout">
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/games" style={{ fontSize: 14 }}>← Games</Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <UndoButton canUndo={game.events.length > 0} onUndo={handleUndo} />
          <button
            onClick={() => setShowLineScore(!showLineScore)}
            style={{ fontSize: 13 }}
          >
            {showLineScore ? 'Hide' : 'Box'}
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <Scoreboard game={game} state={state} />

      {/* Collapsible line score */}
      {showLineScore && (
        <LineScore
          state={state}
          awayTeamName={game.awayTeamName}
          homeTeamName={game.homeTeamName}
          innings={game.rules.innings}
        />
      )}

      {/* Diamond + outs + count */}
      <GameStateDisplay state={state} />

      {/* Game over banner */}
      {state.isGameOver ? (
        <div className="game-over-banner">
          <h3>Final</h3>
          <div className="final-score">
            {game.awayTeamName} {state.awayScore} — {game.homeTeamName} {state.homeScore}
          </div>
        </div>
      ) : (
        <>
          {/* Between-AB events (SB, CS, WP, PB, Balk) */}
          <BetweenABPanel
            state={state}
            players={players}
            onEvent={handleEvent}
          />

          {/* At-bat panel (pitches → outcome → runners) */}
          <AtBatPanel
            game={game}
            state={state}
            players={players}
            onEvent={handleEvent}
          />
        </>
      )}
    </div>
  )
}
