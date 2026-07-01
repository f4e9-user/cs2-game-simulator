import type { AgeBand, AgeStatModifier, CoreStatKey, StatKey, Stats } from '../types.js';
import { clampStats } from './resolver.js';

const MODIFIERS: Record<AgeBand, AgeStatModifier> = {
  'rising-talent': {
    agilityDelta: 0,
    constitutionDelta: 0,
    intelligenceDelta: -1,
    mentalityDelta: -1,
    experienceDelta: -1,
    agilityGrowthMultiplier: 1.3,
    constitutionGrowthMultiplier: 1.3,
    intelligenceGrowthMultiplier: 0.8,
    mentalityGrowthMultiplier: 0.8,
    experienceGrowthMultiplier: 0.9,
  },
  ascending: {
    agilityDelta: 1,
    constitutionDelta: 1,
    intelligenceDelta: 0,
    mentalityDelta: 0,
    experienceDelta: 0,
    agilityGrowthMultiplier: 1.2,
    constitutionGrowthMultiplier: 1.2,
    intelligenceGrowthMultiplier: 1,
    mentalityGrowthMultiplier: 1,
    experienceGrowthMultiplier: 1,
  },
  prime: {
    agilityDelta: 0,
    constitutionDelta: 0,
    intelligenceDelta: 1,
    mentalityDelta: 1,
    experienceDelta: 1,
    agilityGrowthMultiplier: 1,
    constitutionGrowthMultiplier: 1,
    intelligenceGrowthMultiplier: 1,
    mentalityGrowthMultiplier: 1,
    experienceGrowthMultiplier: 1,
  },
  veteran: {
    agilityDelta: -1,
    constitutionDelta: -1,
    intelligenceDelta: 2,
    mentalityDelta: 2,
    experienceDelta: 2,
    agilityGrowthMultiplier: 0.7,
    constitutionGrowthMultiplier: 0.7,
    intelligenceGrowthMultiplier: 1.1,
    mentalityGrowthMultiplier: 1.1,
    experienceGrowthMultiplier: 1.1,
  },
  twilight: {
    agilityDelta: -3,
    constitutionDelta: -3,
    intelligenceDelta: 3,
    mentalityDelta: 3,
    experienceDelta: 3,
    agilityGrowthMultiplier: 0.4,
    constitutionGrowthMultiplier: 0.4,
    intelligenceGrowthMultiplier: 1.1,
    mentalityGrowthMultiplier: 1.1,
    experienceGrowthMultiplier: 1.1,
  },
};

const GROWTH_MULTIPLIER_BY_STAT: Record<Exclude<StatKey, 'money'>, keyof AgeStatModifier> = {
  agility: 'agilityGrowthMultiplier',
  constitution: 'constitutionGrowthMultiplier',
  intelligence: 'intelligenceGrowthMultiplier',
  mentality: 'mentalityGrowthMultiplier',
  experience: 'experienceGrowthMultiplier',
};

export function ageBandFor(age: number): AgeBand {
  if (age <= 18) return 'rising-talent';
  if (age <= 23) return 'ascending';
  if (age <= 27) return 'prime';
  if (age <= 31) return 'veteran';
  return 'twilight';
}

export function ageStatModifier(age: number): AgeStatModifier {
  return MODIFIERS[ageBandFor(age)];
}

export function applyAgeToStats(stats: Stats, age: number): Stats {
  const modifier = ageStatModifier(age);
  return clampStats({
    ...stats,
    agility: stats.agility + modifier.agilityDelta,
    constitution: stats.constitution + modifier.constitutionDelta,
    intelligence: stats.intelligence + modifier.intelligenceDelta,
    mentality: stats.mentality + modifier.mentalityDelta,
    experience: stats.experience + modifier.experienceDelta,
  });
}

export function scaleGrowthByAge(statKey: CoreStatKey | 'experience', amount: number, age: number): number {
  const modifier = ageStatModifier(age);
  return amount * modifier[GROWTH_MULTIPLIER_BY_STAT[statKey]];
}
