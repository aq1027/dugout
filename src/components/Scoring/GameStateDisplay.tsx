import type { BaseState, Count } from '../../models/common';
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

interface GameStateDisplayProps {
  state: DerivedGameState;
  liveCount?: Count;
}

export function GameStateDisplay({ state, liveCount }: GameStateDisplayProps) {
  const count = liveCount ?? state.count;

  return (
    <div className="state-panel">
      <Diamond bases={state.bases} />
      <div className="count-column">
        <div className="count-row balls">
          <span className="count-label">B</span>
          {[1, 2, 3].map(i => (
            <div key={i} className={`dot${count.balls >= i ? ' active' : ''}`} />
          ))}
        </div>
        <div className="count-row strikes">
          <span className="count-label">S</span>
          {[1, 2].map(i => (
            <div key={i} className={`dot${count.strikes >= i ? ' active' : ''}`} />
          ))}
        </div>
        <div className="count-row outs">
          <span className="count-label">O</span>
          {[1, 2].map(i => (
            <div key={i} className={`dot${state.outs >= i ? ' active' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
