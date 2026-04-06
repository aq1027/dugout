import type { SportType } from '../models/common';
import type { GameRules } from '../models/game';

// ─── League Presets ───────────────────────────────────────

export type LeaguePreset =
  | 'mlb'
  | 'milb'
  | 'ncaa_baseball'
  | 'hs_baseball'
  | 'little_league_baseball'
  | 'ncaa_softball'
  | 'hs_softball'
  | 'little_league_softball'
  | 'custom';

export interface LeaguePresetConfig {
  id: LeaguePreset;
  label: string;
  sport: SportType;
  description: string;
  rules: GameRules;
}

export const LEAGUE_PRESETS: LeaguePresetConfig[] = [
  {
    id: 'mlb',
    label: 'MLB',
    sport: 'baseball',
    description: '9 innings · DH · Auto runner in extras',
    rules: {
      innings: 9,
      playersPerSide: 9,
      useDH: true,
      dpFlex: false,
      mercyRule: null,
      mercyInning: null,
      extraInningAutoRunner: true,
      everyoneBats: false,
      moundVisitsPerGame: 5,
      timeoutsPerGame: null,
      preset: 'mlb',
    },
  },
  {
    id: 'milb',
    label: 'MiLB',
    sport: 'baseball',
    description: '9 innings · DH · Auto runner in extras',
    rules: {
      innings: 9,
      playersPerSide: 9,
      useDH: true,
      dpFlex: false,
      mercyRule: null,
      mercyInning: null,
      extraInningAutoRunner: true,
      everyoneBats: false,
      moundVisitsPerGame: 5,
      timeoutsPerGame: null,
      preset: 'milb',
    },
  },
  {
    id: 'ncaa_baseball',
    label: 'NCAA Baseball',
    sport: 'baseball',
    description: '9 innings · DH · 10-run mercy after 7',
    rules: {
      innings: 9,
      playersPerSide: 9,
      useDH: true,
      dpFlex: false,
      mercyRule: 10,
      mercyInning: 7,
      extraInningAutoRunner: true,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
      preset: 'ncaa_baseball',
    },
  },
  {
    id: 'hs_baseball',
    label: 'HS Baseball',
    sport: 'baseball',
    description: '7 innings · DH optional · 10-run mercy after 5',
    rules: {
      innings: 7,
      playersPerSide: 9,
      useDH: true,
      dpFlex: false,
      mercyRule: 10,
      mercyInning: 5,
      extraInningAutoRunner: false,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
      preset: 'hs_baseball',
    },
  },
  {
    id: 'little_league_baseball',
    label: 'Little League BB',
    sport: 'baseball',
    description: '6 innings · No DH · 15-run mercy after 3',
    rules: {
      innings: 6,
      playersPerSide: 9,
      useDH: false,
      dpFlex: false,
      mercyRule: 15,
      mercyInning: 3,
      extraInningAutoRunner: false,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
      preset: 'little_league_baseball',
    },
  },
  {
    id: 'ncaa_softball',
    label: 'NCAA Softball',
    sport: 'softball',
    description: '7 innings · DP/FLEX · 8-run mercy after 5',
    rules: {
      innings: 7,
      playersPerSide: 9,
      useDH: true,
      dpFlex: true,
      mercyRule: 8,
      mercyInning: 5,
      extraInningAutoRunner: true,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
      preset: 'ncaa_softball',
    },
  },
  {
    id: 'hs_softball',
    label: 'HS Softball',
    sport: 'softball',
    description: '7 innings · 12-run mercy after 3',
    rules: {
      innings: 7,
      playersPerSide: 9,
      useDH: false,
      dpFlex: true,
      mercyRule: 12,
      mercyInning: 3,
      extraInningAutoRunner: false,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
      preset: 'hs_softball',
    },
  },
  {
    id: 'little_league_softball',
    label: 'Little League SB',
    sport: 'softball',
    description: '6 innings · 15-run mercy after 3',
    rules: {
      innings: 6,
      playersPerSide: 9,
      useDH: false,
      dpFlex: false,
      mercyRule: 15,
      mercyInning: 3,
      extraInningAutoRunner: false,
      everyoneBats: false,
      moundVisitsPerGame: null,
      timeoutsPerGame: null,
      preset: 'little_league_softball',
    },
  },
];

/** Legacy sport-only presets (for backward compat) */
export const RULE_PRESETS: Record<SportType, GameRules> = {
  baseball: LEAGUE_PRESETS.find(p => p.id === 'mlb')!.rules,
  softball: LEAGUE_PRESETS.find(p => p.id === 'ncaa_softball')!.rules,
};

/** Get the default rules for a sport, with optional overrides */
export function getRules(sport: SportType, overrides?: Partial<GameRules>): GameRules {
  return { ...RULE_PRESETS[sport], ...overrides };
}

/** Get rules for a specific league preset, with optional overrides */
export function getPresetRules(presetId: LeaguePreset, overrides?: Partial<GameRules>): GameRules {
  const preset = LEAGUE_PRESETS.find(p => p.id === presetId);
  if (!preset) return getRules('baseball', overrides);
  return { ...preset.rules, ...overrides };
}
