import { describe, expect, it } from 'vitest';
import type { Club } from '../../types.js';
import { clubArchetype, clubCapital, clubHeritage } from '../clubIdentity.js';

const baseClub: Club = {
  id: 'identity-test-club',
  name: 'Identity Test',
  tag: 'IDT',
  region: '测试',
  tier: 'pro',
  requiredStage: 'pro',
  baseSalary: 60,
  salaryRange: [50, 80],
};

describe('club identity derivation', () => {
  it('derives deterministic heritage and capital inside each archetype range', () => {
    const expectations = [
      ['legacy-giant', [75, 95], [55, 80]],
      ['capital-project', [20, 45], [80, 98]],
      ['development-factory', [40, 60], [25, 45]],
      ['regional-pride', [50, 70], [40, 60]],
      ['fallen-legacy', [70, 90], [25, 45]],
      ['scrappy-underdog', [15, 35], [15, 35]],
    ] as const;

    for (const [archetype, heritageRange, capitalRange] of expectations) {
      const club = { ...baseClub, id: `identity-${archetype}`, clubArchetype: archetype };

      expect(clubHeritage(club)).toBe(clubHeritage(club));
      expect(clubCapital(club)).toBe(clubCapital(club));
      expect(clubHeritage(club)).toBeGreaterThanOrEqual(heritageRange[0]);
      expect(clubHeritage(club)).toBeLessThanOrEqual(heritageRange[1]);
      expect(clubCapital(club)).toBeGreaterThanOrEqual(capitalRange[0]);
      expect(clubCapital(club)).toBeLessThanOrEqual(capitalRange[1]);
    }
  });

  it('prefers explicit heritage and capital overrides', () => {
    const club = { ...baseClub, clubArchetype: 'scrappy-underdog' as const, heritage: 88, capital: 91 };

    expect(clubHeritage(club)).toBe(88);
    expect(clubCapital(club)).toBe(91);
  });

  it('falls back from tier when archetype is missing', () => {
    expect(clubArchetype({ ...baseClub, tier: 'top' })).toBe('legacy-giant');
    expect(clubArchetype({ ...baseClub, tier: 'pro' })).toBe('regional-pride');
    expect(clubArchetype({ ...baseClub, tier: 'semi-pro' })).toBe('regional-pride');
    expect(clubArchetype({ ...baseClub, tier: 'youth' })).toBe('development-factory');
  });
});
