import type { SportType } from '../models/common';
import type { GameRules } from '../models/game';

/** Default rule presets by sport type */
export const RULE_PRESETS: Record<SportType, GameRules> = {
  baseball: {
    innings: 9,
    playersPerSide: 9,
    useDH: false,
    dpFlex: false,
    mercyRule: null,
    mercyInning: null,
    extraInningAutoRunner: true, // MLB rule since 2020
  },
  softball: {
    innings: 7,
    playersPerSide: 9,
    useDH: false,
    dpFlex: true,
    mercyRule: 12,
    mercyInning: 3,
    extraInningAutoRunner: true,
  },
};

/** Get the default rules for a sport, with optional overrides */
export function getRules(sport: SportType, overrides?: Partial<GameRules>): GameRules {
  return { ...RULE_PRESETS[sport], ...overrides };
}
