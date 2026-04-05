import { Routes, Route, Link, NavLink } from 'react-router-dom'
import { useTheme } from './hooks/useTheme'
import './App.css'
import { HomePage } from './pages/HomePage'
import { GamesPage } from './pages/GamesPage'
import { GamePage } from './pages/GamePage'
import { TeamsPage } from './pages/TeamsPage'
import { NewGamePage } from './components/GameSetup/NewGamePage'

function App() {
  const { mode, setMode } = useTheme()

  const cycleTheme = () => {
    const next = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    setMode(next);
  };

  const themeIcon = mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '💻';

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/"><h1>⚾ Dugout</h1></Link>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/games">Games</NavLink>
          <NavLink to="/teams">Teams</NavLink>
          <button className="theme-toggle" onClick={cycleTheme} title={`Theme: ${mode}`}>
            {themeIcon}
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/game/new" element={<NewGamePage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/teams" element={<TeamsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
