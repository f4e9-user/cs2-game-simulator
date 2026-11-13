import { describe, expect, it } from 'vitest';
import { clubCanApply } from '../../../frontend/src/lib/clubApplication';
import type { Stage } from '../../../frontend/src/lib/types';

describe('frontend club application eligibility', () => {
  it.each([
    { traits: [], tierParticipations: {}, tierChampionships: {} },
    { traits: [], tierParticipations: { c: 1 }, tierChampionships: {} },
    { traits: ['aim-god'], tierParticipations: {}, tierChampionships: {} },
    { traits: [], tierParticipations: { c: 2, b: 1 }, tierChampionships: { c: 1 } },
  ])('allows a rookie youth application regardless of resume: %j', (resume) => {
    const rookie = { stage: 'rookie' as const, fame: 0, ...resume };

    expect(clubCanApply(rookie, { requiredStage: 'youth' })).toEqual({ eligible: true, reason: null });
  });

  it('still enforces youth clubs’ fame requirement for rookies', () => {
    const club = { requiredStage: 'youth' as const, requiredFame: 10 };

    expect(clubCanApply({ stage: 'rookie', fame: 9 }, club)).toEqual({
      eligible: false,
      reason: '名气需达到 10',
    });
    expect(clubCanApply({ stage: 'rookie', fame: 10 }, club).eligible).toBe(true);
  });

  it.each<[Stage, Stage, boolean]>([
    ['rookie', 'second', false],
    ['rookie', 'pro', false],
    ['youth', 'second', false],
    ['second', 'pro', false],
    ['youth', 'youth', true],
    ['second', 'youth', true],
    ['pro', 'second', true],
  ])('preserves the stage gate for %s applying to %s', (stage, requiredStage, eligible) => {
    expect(clubCanApply({ stage, fame: 100 }, { requiredStage }).eligible).toBe(eligible);
  });
});
