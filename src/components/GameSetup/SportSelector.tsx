import type { SportType } from '../../models/common';
import { LEAGUE_PRESETS, type LeaguePreset } from '../../engine/rules';

interface SportSelectorProps {
  value: SportType;
  onChange: (sport: SportType) => void;
  preset?: LeaguePreset;
  onPresetChange?: (preset: LeaguePreset) => void;
}

export function SportSelector({ value, onChange, preset, onPresetChange }: SportSelectorProps) {
  const baseballPresets = LEAGUE_PRESETS.filter(p => p.sport === 'baseball');
  const softballPresets = LEAGUE_PRESETS.filter(p => p.sport === 'softball');

  const handlePreset = (p: typeof LEAGUE_PRESETS[number]) => {
    onChange(p.sport);
    onPresetChange?.(p.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sport toggle */}
      <div className="sport-options">
        <button
          type="button"
          className={`sport-card ${value === 'baseball' ? 'selected' : ''}`}
          onClick={() => {
            onChange('baseball');
            onPresetChange?.('mlb');
          }}
        >
          <span className="sport-icon">⚾</span>
          <span className="sport-label">Baseball</span>
        </button>
        <button
          type="button"
          className={`sport-card ${value === 'softball' ? 'selected' : ''}`}
          onClick={() => {
            onChange('softball');
            onPresetChange?.('ncaa_softball');
          }}
        >
          <span className="sport-icon"><span style={{ display: 'inline-block', transform: 'scale(1.3)' }}>🥎</span></span>
          <span className="sport-label">Softball</span>
        </button>
      </div>

      {/* League preset cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>
          League Preset
        </span>
        <div className="preset-grid">
          {(value === 'baseball' ? baseballPresets : softballPresets).map(p => (
            <button
              key={p.id}
              type="button"
              className={`preset-card${preset === p.id ? ' selected' : ''}`}
              onClick={() => handlePreset(p)}
            >
              <span className="preset-label">{p.label}</span>
              <span className="preset-detail">{p.description}</span>
            </button>
          ))}
          <button
            type="button"
            className={`preset-card${preset === 'custom' ? ' selected' : ''}`}
            onClick={() => onPresetChange?.('custom')}
          >
            <span className="preset-label">Custom</span>
            <span className="preset-detail">Configure all rules manually</span>
          </button>
        </div>
      </div>
    </div>
  );
}
