import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { Game } from '../models/game'
import type { Player } from '../models/player'
import type { Id, Count } from '../models/common'
import type { PlayEvent } from '../models/play'
import { deriveGameState, undoLastEvent } from '../engine/gameEngine'
import { Scoreboard } from '../components/Scoring/Scoreboard'
import { GameStateDisplay } from '../components/Scoring/GameStateDisplay'
import { LineScore } from '../components/Scoring/LineScore'
import { AtBatPanel } from '../components/Scoring/AtBatPanel'
import { BetweenABPanel } from '../components/Scoring/BetweenABPanel'
import { UndoButton, ConfirmDialog } from '../components/Scoring/UndoButton'
import { LineupPanel } from '../components/Scoring/LineupPanel'
import { GameLog } from '../components/Scoring/GameLog'
import { BoxScore } from '../components/Scoring/BoxScore'
import '../components/Scoring/Scoring.css'

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Map<Id, Player>>(new Map())
  const [showLineScore, setShowLineScore] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [liveCount, setLiveCount] = useState<Count>({ balls: 0, strikes: 0 })
  const [showLineup, setShowLineup] = useState<'away' | 'home' | null>(null)
  const [confirmAction, setConfirmAction] = useState<'end' | 'cancel' | 'delete' | null>(null)
  const [livePitchCount, setLivePitchCount] = useState(0)

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

  // End game (mark as final)
  const handleEndGame = useCallback(async () => {
    if (!game) return
    const updatedGame: Game = { ...game, status: 'final', updatedAt: new Date().toISOString() }
    await db.games.put(updatedGame)
    setGame(updatedGame)
    setConfirmAction(null)
  }, [game])

  // Cancel/suspend game
  const handleCancelGame = useCallback(async () => {
    if (!game) return
    const updatedGame: Game = { ...game, status: 'suspended', updatedAt: new Date().toISOString() }
    await db.games.put(updatedGame)
    setGame(updatedGame)
    setConfirmAction(null)
  }, [game])

  // Delete game entirely
  const handleDeleteGame = useCallback(async () => {
    if (!game) return
    await db.games.delete(game.id)
    setConfirmAction(null)
    navigate('/games')
  }, [game, navigate])

  // Position change (defensive swap)
  const handlePositionChange = useCallback(async (updatedGame: Game) => {
    await db.games.put(updatedGame)
    setGame(updatedGame)
  }, [])

  // Resume a suspended game
  const handleResumeGame = useCallback(async () => {
    if (!game) return
    const updatedGame: Game = { ...game, status: game.events.length > 0 ? 'in_progress' : 'setup', updatedAt: new Date().toISOString() }
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

  // Determine batting/pitching teams & current pitcher
  const battingTeamName = state.halfInning === 'top' ? game.awayTeamName : game.homeTeamName
  const pitchingTeamName = state.halfInning === 'top' ? game.homeTeamName : game.awayTeamName
  const pitchingLineup = state.halfInning === 'top' ? game.homeLineup : game.awayLineup

  // Current pitcher is position 1 in the pitching lineup (accounting for subs)
  const pitchingSubs = [...pitchingLineup.substitutions].reverse()
  const pitchingSub = pitchingSubs.find(s => s.position === 1)
  const currentPitcher = pitchingSub
    ? pitchingSub.inPlayerId
    : (pitchingLineup.startingOrder.find(s => s.position === 1)?.playerId ?? null)

  // Count committed pitches for current pitcher
  // Walk events in order, tracking pitcher changes via SubstitutionEvents
  let committedPitchCount = 0
  if (currentPitcher) {
    // Track the active pitcher for each fielding side as we walk events
    const activePitcher: { top: Id | null; bottom: Id | null } = {
      top: game.homeLineup.startingOrder.find(s => s.position === 1)?.playerId ?? null,
      bottom: game.awayLineup.startingOrder.find(s => s.position === 1)?.playerId ?? null,
    }
    for (const e of game.events) {
      if (e.type === 'substitution' && e.position === 1 && e.subType === 'pitching_change') {
        // Update the active pitcher for the fielding side
        const fieldingSide = e.halfInning === 'top' ? 'top' : 'bottom'
        activePitcher[fieldingSide] = e.inPlayerId
      }
      if (e.pitchSequence && e.pitchSequence.length > 0) {
        const fieldingSide = e.halfInning
        if (activePitcher[fieldingSide] === currentPitcher) {
          committedPitchCount += e.pitchSequence.length
        }
      }
    }
  }

  const pitcherDisplay = currentPitcher ? (() => {
    const p = players.get(currentPitcher)
    if (!p) return pitchingTeamName
    const num = p.number != null ? `#${p.number} ` : ''
    return `${num}${p.firstName} ${p.lastName}`
  })() : pitchingTeamName

  return (
    <div className="scoring-layout">
      {/* Top bar */}
      <div className="scoring-top-bar">
        <Link to="/games" style={{ fontSize: 14 }}>← Games</Link>
        <div className="bar-actions">
          {!state.isGameOver && game.status !== 'final' && game.status !== 'suspended' && (
            <>
              <UndoButton canUndo={game.events.length > 0} onUndo={handleUndo} />
              <button onClick={() => setConfirmAction('end')}>End</button>
              <button onClick={() => setConfirmAction('cancel')}>Cancel</button>
            </>
          )}
          <button onClick={() => { setShowLog(!showLog); if (!showLog) setShowLineScore(false); }}>
            {showLog ? 'Hide' : 'Logs'}
          </button>
          <button onClick={() => { setShowLineScore(!showLineScore); if (!showLineScore) setShowLog(false); }}>
            {showLineScore ? 'Hide' : 'Box'}
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <Scoreboard game={game} state={state} />

      {/* Collapsible line score + box score */}
      {showLineScore && (
        <>
          <LineScore
            state={state}
            awayTeamName={game.awayTeamName}
            homeTeamName={game.homeTeamName}
            innings={game.rules.innings}
          />
          <BoxScore game={game} state={state} players={players} />
        </>
      )}

      {/* Collapsible game log */}
      {showLog && <GameLog events={game.events} players={players} />}

      {/* Game context: batting / pitching + pitch count */}
      {!state.isGameOver && game.status !== 'final' && game.status !== 'suspended' && (
        <div className="game-context">
          <div className="context-item">
            <span className="context-label">Batting</span>
            <span className="context-value">{battingTeamName}</span>
          </div>
          <div className="context-item" style={{ textAlign: 'right' }}>
            <span className="context-label">Pitching</span>
            <span className="context-value">{pitcherDisplay}</span>
            <span className="context-value pitches" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {committedPitchCount + livePitchCount} pitches
            </span>
          </div>
        </div>
      )}

      {/* Diamond + outs + count */}
      <GameStateDisplay state={state} liveCount={liveCount} />

      {/* Game over / final / suspended banners */}
      {(state.isGameOver || game.status === 'final') ? (
        <div className="game-over-banner">
          <h3>Final</h3>
          <div className="final-score">
            {game.awayTeamName} {state.awayScore} — {game.homeTeamName} {state.homeScore}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button onClick={() => setConfirmAction('delete')} style={{ fontSize: 13, color: 'var(--color-error)' }}>
              Delete Game
            </button>
          </div>
        </div>
      ) : game.status === 'suspended' ? (
        <div className="game-over-banner" style={{ borderColor: 'var(--color-warning)' }}>
          <h3 style={{ color: 'var(--color-warning)' }}>Suspended</h3>
          <div className="final-score">
            {game.awayTeamName} {state.awayScore} — {game.homeTeamName} {state.homeScore}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button className="primary" onClick={handleResumeGame}>Resume Game</button>
            <button onClick={() => setConfirmAction('delete')} style={{ fontSize: 13, color: 'var(--color-error)' }}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Team lineup buttons */}
          <div className="lineup-toggle-bar">
            <button
              className={showLineup === 'away' ? 'active' : ''}
              onClick={() => setShowLineup(showLineup === 'away' ? null : 'away')}
            >
              {game.awayTeamName}
            </button>
            <button
              className={showLineup === 'home' ? 'active' : ''}
              onClick={() => setShowLineup(showLineup === 'home' ? null : 'home')}
            >
              {game.homeTeamName}
            </button>
          </div>

          {showLineup && (
            <LineupPanel
              game={game}
              state={state}
              players={players}
              teamPlayers={[...players.values()].filter(p =>
                p.teamId === (showLineup === 'away' ? game.awayTeamId : game.homeTeamId)
              )}
              isAway={showLineup === 'away'}
              onGameUpdate={handlePositionChange}
              onEvent={handleEvent}
            />
          )}

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
            onCountChange={setLiveCount}
            onPitchCountChange={setLivePitchCount}
          />
        </>
      )}

      {/* Confirm dialogs */}
      {confirmAction === 'end' && (
        <ConfirmDialog
          title="End Game"
          message="Mark this game as final? You can still view it but scoring will be locked."
          confirmLabel="End Game"
          onConfirm={handleEndGame}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'cancel' && (
        <ConfirmDialog
          title="Suspend Game"
          message="Suspend this game? You can resume it later."
          confirmLabel="Suspend"
          onConfirm={handleCancelGame}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'delete' && (
        <ConfirmDialog
          title="Delete Game"
          message={`Delete ${game.awayTeamName} @ ${game.homeTeamName}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteGame}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
