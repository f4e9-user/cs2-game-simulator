import { describe, expect, it } from 'vitest';
import {
  calcTeamChemistryModifier,
  deriveTeamChemistry,
} from '../synergy.js';
import type { Teammate } from '../../types.js';

function teammate(id: string, chemistry: number): Teammate {
  return {
    id,
    name: id,
    role: 'Support',
    personality: 'supportive',
    traits: ['support'],
    stats: {
      agility: 5,
      intelligence: 5,
      mentality: 5,
      experience: 5,
    },
    growthSpent: 0,
    chemistry,
  };
}

describe('team chemistry', () => {
  it('derives team chemistry from teammate chemistry and team trust', () => {
    const roster = [teammate('a', 80), teammate('b', 80), teammate('c', 80)];

    expect(deriveTeamChemistry(roster, 80)).toBe(80);
    expect(calcTeamChemistryModifier(deriveTeamChemistry(roster, 80))).toBe(1);
  });

  it('penalizes very low trust even when teammate chemistry exists', () => {
    const roster = [teammate('a', 30), teammate('b', 30), teammate('c', 30)];

    expect(deriveTeamChemistry(roster, 10)).toBe(15);
    expect(calcTeamChemistryModifier(deriveTeamChemistry(roster, 10))).toBe(-1);
  });
});
