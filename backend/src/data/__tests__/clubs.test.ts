import { describe, expect, it } from 'vitest';
import { CLUBS } from '../clubs.js';

describe('club pool', () => {
  it('has a sufficiently large world club pool with region coverage', () => {
    const fixedClubs = CLUBS.filter((club) => !club.isRival);
    const countsByTier = fixedClubs.reduce<Record<string, number>>((acc, club) => {
      acc[club.tier] = (acc[club.tier] ?? 0) + 1;
      return acc;
    }, {});
    const countsByRegion = fixedClubs.reduce<Record<string, number>>((acc, club) => {
      acc[club.region] = (acc[club.region] ?? 0) + 1;
      return acc;
    }, {});

    expect(fixedClubs.length).toBeGreaterThanOrEqual(41);
    expect(countsByTier.youth ?? 0).toBeGreaterThanOrEqual(8);
    expect(countsByTier['semi-pro'] ?? 0).toBeGreaterThanOrEqual(12);
    expect(countsByTier.pro ?? 0).toBeGreaterThanOrEqual(10);
    expect(countsByTier.top ?? 0).toBeGreaterThanOrEqual(8);
    expect(countsByRegion['欧洲'] ?? 0).toBeGreaterThanOrEqual(11);
    expect(countsByRegion['北美'] ?? 0).toBeGreaterThanOrEqual(6);
    expect(countsByRegion['蒙古'] ?? 0).toBeGreaterThanOrEqual(2);
    expect(countsByRegion['中国'] ?? 0).toBeGreaterThanOrEqual(4);
  });
});
