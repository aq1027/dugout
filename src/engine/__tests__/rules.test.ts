import { describe, it, expect } from 'vitest';
import { RULE_PRESETS, LEAGUE_PRESETS, getRules, getPresetRules } from '../rules';

describe('RULE_PRESETS (legacy)', () => {
  it('has baseball preset with 9 innings', () => {
    expect(RULE_PRESETS.baseball.innings).toBe(9);
    expect(RULE_PRESETS.baseball.playersPerSide).toBe(9);
    expect(RULE_PRESETS.baseball.extraInningAutoRunner).toBe(true);
    expect(RULE_PRESETS.baseball.mercyRule).toBeNull();
  });

  it('has softball preset with 7 innings', () => {
    expect(RULE_PRESETS.softball.innings).toBe(7);
    expect(RULE_PRESETS.softball.dpFlex).toBe(true);
    expect(RULE_PRESETS.softball.mercyRule).toBe(8);
    expect(RULE_PRESETS.softball.mercyInning).toBe(5);
  });
});

describe('LEAGUE_PRESETS', () => {
  it('has 8 presets total', () => {
    expect(LEAGUE_PRESETS).toHaveLength(8);
  });

  it('has 5 baseball and 3 softball presets', () => {
    const baseball = LEAGUE_PRESETS.filter(p => p.sport === 'baseball');
    const softball = LEAGUE_PRESETS.filter(p => p.sport === 'softball');
    expect(baseball).toHaveLength(5);
    expect(softball).toHaveLength(3);
  });

  it('MLB has no mercy rule and 9 innings', () => {
    const mlb = LEAGUE_PRESETS.find(p => p.id === 'mlb')!;
    expect(mlb.rules.innings).toBe(9);
    expect(mlb.rules.mercyRule).toBeNull();
    expect(mlb.rules.useDH).toBe(true);
    expect(mlb.rules.extraInningAutoRunner).toBe(true);
  });

  it('Little League BB has 6 innings & 15-run mercy after 3', () => {
    const ll = LEAGUE_PRESETS.find(p => p.id === 'little_league_baseball')!;
    expect(ll.rules.innings).toBe(6);
    expect(ll.rules.mercyRule).toBe(15);
    expect(ll.rules.mercyInning).toBe(3);
    expect(ll.rules.useDH).toBe(false);
  });

  it('NCAA Softball has DP/FLEX and 8-run mercy after 5', () => {
    const ncaa = LEAGUE_PRESETS.find(p => p.id === 'ncaa_softball')!;
    expect(ncaa.rules.dpFlex).toBe(true);
    expect(ncaa.rules.mercyRule).toBe(8);
    expect(ncaa.rules.mercyInning).toBe(5);
  });

  it('HS Baseball has 7 innings & 10-run mercy after 5', () => {
    const hs = LEAGUE_PRESETS.find(p => p.id === 'hs_baseball')!;
    expect(hs.rules.innings).toBe(7);
    expect(hs.rules.mercyRule).toBe(10);
    expect(hs.rules.mercyInning).toBe(5);
  });

  it('every preset has all required rule fields', () => {
    for (const p of LEAGUE_PRESETS) {
      expect(p.rules).toHaveProperty('innings');
      expect(p.rules).toHaveProperty('playersPerSide');
      expect(p.rules).toHaveProperty('useDH');
      expect(p.rules).toHaveProperty('dpFlex');
      expect(p.rules).toHaveProperty('extraInningAutoRunner');
      expect(p.rules).toHaveProperty('everyoneBats');
      expect(p.rules).toHaveProperty('mercyRule');
      expect(p.rules).toHaveProperty('mercyInning');
    }
  });
});

describe('getRules', () => {
  it('returns default rules for a sport', () => {
    const rules = getRules('baseball');
    expect(rules).toEqual(RULE_PRESETS.baseball);
  });

  it('applies overrides to default rules', () => {
    const rules = getRules('baseball', { useDH: true, innings: 7 });
    expect(rules.useDH).toBe(true);
    expect(rules.innings).toBe(7);
    expect(rules.playersPerSide).toBe(9);
  });

  it('applies overrides to softball rules', () => {
    const rules = getRules('softball', { mercyRule: null });
    expect(rules.mercyRule).toBeNull();
    expect(rules.innings).toBe(7);
  });
});

describe('getPresetRules', () => {
  it('returns MLB rules by default', () => {
    const rules = getPresetRules('mlb');
    expect(rules.innings).toBe(9);
    expect(rules.mercyRule).toBeNull();
  });

  it('returns correct rules for each preset', () => {
    const hs = getPresetRules('hs_softball');
    expect(hs.innings).toBe(7);
    expect(hs.mercyRule).toBe(12);
    expect(hs.mercyInning).toBe(3);
  });

  it('applies overrides on top of preset', () => {
    const rules = getPresetRules('mlb', { innings: 7 });
    expect(rules.innings).toBe(7);
    expect(rules.useDH).toBe(true); // still from preset
  });

  it('falls back to baseball for unknown preset', () => {
    const rules = getPresetRules('custom');
    expect(rules.innings).toBe(9); // baseball default
  });
});
