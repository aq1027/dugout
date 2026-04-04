import type { BaseState } from '../../models/common';
import type { DerivedGameState } from '../../models/game';

interface DiamondProps {
  bases: BaseState;
}

export function Diamond({ bases }: DiamondProps) {
  return (
    <div className="diamond">
      <div className={`base base-first${bases.first ? ' occupied' : ''}`} />
      <div className={`base base-second${bases.second ? ' occupied' : ''}`} />
      <div className={`base base-third${bases.third ? ' occupied' : ''}`} />
      <div className="base base-home" />
    </div>
  );
}

interface OutsProps {
  outs: number;
}

export function OutsDisplay({ outs }: OutsProps) {
  return (
    <div className="outs-display">
      <div className={`out-dot${outs >= 1 ? ' active' : ''}`} />
      <div className={`out-dot${outs >= 2 ? ' active' : ''}`} />
      <span className="outs-label">Outs</span>
    </div>
  );
}

interface CountDisplayProps {
  count: { balls: number; strikes: number };
}

export function CountDisplay({ count }: CountDisplayProps) {
  return (
    <div className="count-display">
      <div className="count-group balls">
        <span className="count-label">B</span>
        {[1, 2, 3].map(i => (
          <div key={i} className={`count-dot${count.balls >= i ? ' active' : ''}`} />
        ))}
      </div>
      <div className="count-group strikes">
        <span className="count-label">S</span>
        {[1, 2].map(i => (
          <div key={i} className={`count-dot${count.strikes >= i ? ' active' : ''}`} />
        ))}
      </div>
    </div>
  );
}

interface GameStateDisplayProps {
  state: DerivedGameState;
}

export function GameStateDisplay({ state }: GameStateDisplayProps) {
  return (
    <div className="diamond-container">
      <Diamond bases={state.bases} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <OutsDisplay outs={state.outs} />
        <CountDisplay count={state.count} />
      </div>
    </div>
  );
}
