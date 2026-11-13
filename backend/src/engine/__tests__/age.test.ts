import { describe, expect, it } from 'vitest';
import { ageBandFor, ageStatModifier, applyAgeToStats, scaleGrowthByAge } from '../age.js';
import type { Stats } from '../../types.js';

const stats: Stats = {
  agility: 10,
  constitution: 10,
  intelligence: 10,
  mentality: 10,
  experience: 10,
  money: 50,
};

describe('age system', () => {
  it('maps ages to competitive age bands', () => {
    expect(ageBandFor(18)).toBe('rising-talent');
    expect(ageBandFor(19)).toBe('ascending');
    expect(ageBandFor(23)).toBe('ascending');
    expect(ageBandFor(24)).toBe('prime');
    expect(ageBandFor(27)).toBe('prime');
    expect(ageBandFor(28)).toBe('veteran');
    expect(ageBandFor(31)).toBe('veteran');
    expect(ageBandFor(32)).toBe('twilight');
  });

  it('applies age deltas without mutating base stats or money', () => {
    const veteran = applyAgeToStats(stats, 32);

    expect(veteran.agility).toBe(7);
    expect(veteran.constitution).toBe(7);
    expect(veteran.intelligence).toBe(13);
    expect(veteran.mentality).toBe(13);
    expect(veteran.experience).toBe(13);
    expect(veteran.money).toBe(50);
    expect(stats.agility).toBe(10);
  });

  it('scales growth by age and stat axis', () => {
    expect(scaleGrowthByAge('agility', 10, 18)).toBe(13);
    expect(scaleGrowthByAge('constitution', 10, 22)).toBe(12);
    expect(scaleGrowthByAge('agility', 10, 30)).toBe(7);
    expect(scaleGrowthByAge('mentality', 10, 30)).toBe(11);
    expect(scaleGrowthByAge('experience', 10, 34)).toBe(11);
  });

  it('keeps modifier values centralized by band', () => {
    expect(ageStatModifier(18).mentalityDelta).toBe(-1);
    expect(ageStatModifier(25).intelligenceDelta).toBe(1);
    expect(ageStatModifier(30).experienceDelta).toBe(2);
  });
});
