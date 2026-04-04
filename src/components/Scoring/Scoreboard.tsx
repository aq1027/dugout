import type { DerivedGameState, Game } from '../../models/game';

interface ScoreboardProps {
  game: Game;
  state: DerivedGameState;
}

export function Scoreboard({ game, state }: ScoreboardProps) {
  const isTop = state.halfInning === 'top';

  return (
    <div className="scoreboard">
      <div className={`team-score${isTop ? ' batting' : ''}`}>
        <span className="team-name">{game.awayTeamName}</span>
        <span className="score">{state.awayScore}</span>
      </div>

      <div className="inning-display">
        <div>{isTop ? '▲' : '▼'}</div>
        <div className="inning-num">{state.inning}</div>
      </div>

      <div className={`team-score${!isTop ? ' batting' : ''}`}>
        <span className="score">{state.homeScore}</span>
        <span className="team-name">{game.homeTeamName}</span>
      </div>
    </div>
  );
}
