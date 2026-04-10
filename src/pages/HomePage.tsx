import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <div className="home">
      <h2>Welcome to Dugout</h2>
      <p>Offline-first baseball &amp; softball scorekeeper. Score games play-by-play, track stats, and never lose a game record.</p>

      <div className="action-grid">
        <Link to="/game/new" className="action-card">
          <span className="icon">🏟️</span>
          New Game
        </Link>
        <Link to="/games" className="action-card">
          <span className="icon">📋</span>
          Recent Games
        </Link>
        <Link to="/teams" className="action-card">
          <span className="icon">👥</span>
          Manage Teams
        </Link>
        <Link to="/stats" className="action-card">
          <span className="icon">📊</span>
          Stats
        </Link>
      </div>
    </div>
  )
}
