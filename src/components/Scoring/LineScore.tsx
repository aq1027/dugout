import type { DerivedGameState } from '../../models/game';

interface LineScoreProps {
  state: DerivedGameState;
  awayTeamName: string;
  homeTeamName: string;
  innings: number;
}

export function LineScore({ state, awayTeamName, homeTeamName, innings }: LineScoreProps) {
  const maxInnings = Math.max(innings, state.inning);
  const columns = Array.from({ length: maxInnings }, (_, i) => i + 1);

  return (
    <table className="line-score">
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}></th>
          {columns.map(i => (
            <th key={i}>{i}</th>
          ))}
          <th>R</th>
          <th>H</th>
          <th>E</th>
        </tr>
      </thead>
      <tbody>
        <tr className={state.halfInning === 'top' && !state.isGameOver ? 'current-half' : ''}>
          <td className="team-name-cell">{awayTeamName}</td>
          {columns.map(i => (
            <td key={i}>
              {i <= state.awayLineScore.length ? state.awayLineScore[i - 1] ?? '' : ''}
            </td>
          ))}
          <td className="total">{state.awayScore}</td>
          <td className="total">{state.awayHits}</td>
          <td className="total">{state.awayErrors}</td>
        </tr>
        <tr className={state.halfInning === 'bottom' && !state.isGameOver ? 'current-half' : ''}>
          <td className="team-name-cell">{homeTeamName}</td>
          {columns.map(i => (
            <td key={i}>
              {i <= state.homeLineScore.length ? state.homeLineScore[i - 1] ?? '' : ''}
            </td>
          ))}
          <td className="total">{state.homeScore}</td>
          <td className="total">{state.homeHits}</td>
          <td className="total">{state.homeErrors}</td>
        </tr>
      </tbody>
    </table>
  );
}
