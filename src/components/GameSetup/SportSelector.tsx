import type { SportType } from '../../models/common';

interface SportSelectorProps {
  value: SportType;
  onChange: (sport: SportType) => void;
}

export function SportSelector({ value, onChange }: SportSelectorProps) {
  return (
    <div className="sport-options">
      <button
        type="button"
        className={`sport-card ${value === 'baseball' ? 'selected' : ''}`}
        onClick={() => onChange('baseball')}
      >
        <span className="sport-icon">⚾</span>
        <span className="sport-label">Baseball</span>
        <span className="sport-detail">9 innings · 9 players</span>
      </button>
      <button
        type="button"
        className={`sport-card ${value === 'softball' ? 'selected' : ''}`}
        onClick={() => onChange('softball')}
      >
        <span className="sport-icon">🥎</span>
        <span className="sport-label">Softball</span>
        <span className="sport-detail">7 innings · 9-10 players</span>
      </button>
    </div>
  );
}
