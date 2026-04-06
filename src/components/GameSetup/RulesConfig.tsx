import type { GameRules } from '../../models/game';

interface RulesConfigProps {
  rules: GameRules;
  onChange: (rules: GameRules) => void;
}

export function RulesConfig({ rules, onChange }: RulesConfigProps) {
  const update = (patch: Partial<GameRules>) => onChange({ ...rules, ...patch });

  return (
    <div className="rules-grid">
      <div className="rule-row">
        <label>Innings</label>
        <input
          type="number"
          min={1}
          max={15}
          value={rules.innings}
          onChange={e => update({ innings: parseInt(e.target.value) || 1 })}
        />
      </div>
      <div className="rule-row">
        <label>Players per side</label>
        <input
          type="number"
          min={8}
          max={12}
          value={rules.playersPerSide}
          onChange={e => update({ playersPerSide: parseInt(e.target.value) || 9 })}
        />
      </div>
      <div className="rule-row">
        <label>Designated Hitter (DH)</label>
        <input
          type="checkbox"
          checked={rules.useDH}
          onChange={e => update({ useDH: e.target.checked })}
        />
      </div>
      <div className="rule-row">
        <label>DP/FLEX (Softball)</label>
        <input
          type="checkbox"
          checked={rules.dpFlex}
          onChange={e => update({ dpFlex: e.target.checked })}
        />
      </div>
      <div className="rule-row">
        <label>Extra-inning auto runner</label>
        <input
          type="checkbox"
          checked={rules.extraInningAutoRunner}
          onChange={e => update({ extraInningAutoRunner: e.target.checked })}
        />
      </div>
      <div className="rule-row">
        <label>Everyone bats (continuous order)</label>
        <input
          type="checkbox"
          checked={rules.everyoneBats}
          onChange={e => update({ everyoneBats: e.target.checked })}
        />
      </div>
      <div className="rule-row">
        <label>Mercy rule (run lead)</label>
        <input
          type="number"
          min={0}
          max={30}
          value={rules.mercyRule ?? 0}
          onChange={e => {
            const v = parseInt(e.target.value);
            update({ mercyRule: v > 0 ? v : null });
          }}
        />
      </div>
      {rules.mercyRule !== null && (
        <div className="rule-row">
          <label>Mercy after inning</label>
          <input
            type="number"
            min={1}
            max={rules.innings}
            value={rules.mercyInning ?? 3}
            onChange={e => update({ mercyInning: parseInt(e.target.value) || 3 })}
          />
        </div>
      )}
      <div className="rule-row">
        <label>Mound visits per game (0 = unlimited)</label>
        <input
          type="number"
          min={0}
          max={20}
          value={rules.moundVisitsPerGame ?? 0}
          onChange={e => {
            const v = parseInt(e.target.value);
            update({ moundVisitsPerGame: v > 0 ? v : null });
          }}
        />
      </div>
      <div className="rule-row">
        <label>Timeouts per game (0 = unlimited)</label>
        <input
          type="number"
          min={0}
          max={20}
          value={rules.timeoutsPerGame ?? 0}
          onChange={e => {
            const v = parseInt(e.target.value);
            update({ timeoutsPerGame: v > 0 ? v : null });
          }}
        />
      </div>
    </div>
  );
}
