import { describe, expect, it } from 'vitest';
import { buildCareerGoal } from '../careerGoal.js';
import type { Player } from '../../types.js';

function player(overrides: Partial<Player>): Player {
  return {
    name: 'tester',
    stress: 0,
    fame: 0,
    restRounds: 0,
    stressMaxRounds: 0,
    year: 1,
    week: 1,
    stats: {
      agility: 3,
      intelligence: 2,
      experience: 0,
      money: 0,
      mentality: 2,
      constitution: 2,
    },
    volatile: { feel: 0, tilt: 0, fatigue: 0 },
    feelCap: 3,
    peripheralTier: 0,
    buffs: [],
    growthSpent: 0,
    traits: [],
    backgroundId: '',
    stage: 'rookie',
    round: 1,
    tags: [],
    tagExpiry: {},
    rivals: [],
    tournamentParticipations: 0,
    tournamentChampionships: 0,
    tierParticipations: {},
    tierChampionships: {},
    promotionPending: null,
    promotionCooldown: 0,
    pendingOffer: null,
    ownedItems: [],
    loans: [],
    salaryTracker: null,
    pawnedItemIds: [],
    roster: null,
    preferredRole: null,
    activeRole: null,
    roleCrystallized: false,
    activeRoleRounds: 0,
    roleTransition: null,
    teamTrust: 50,
    pendingMatch: null,
    actionPoints: 100,
    shopCooldowns: {},
    weeklyShopPurchases: {},
    team: null,
    pendingApplication: null,
    qualificationSlots: {},
    teamQualificationSlots: {},
    consecutiveLosses: 0,
    everHadTeam: false,
    contractRenewals: 0,
    forceNextEvent: null,
    forceMatchResult: null,
    bailoutCooldown: 0,
    teamBailoutCooldown: 0,
    consecutiveBrokeRounds: 0,
    roundCombos: [],
    ...overrides,
  } as Player;
}

describe('buildCareerGoal', () => {
  it('shows rookie proof goals and upcoming open events', () => {
    const goal = buildCareerGoal(player({
      stage: 'rookie',
      week: 6,
      tierParticipations: { b: 1 },
      tierChampionships: {},
    }));

    expect(goal.stageLabel).toBe('路人新人');
    expect(goal.nextStageLabel).toBe('青训');
    expect(goal.goals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rookie-participations', current: 1, target: 3, completed: false }),
      expect.objectContaining({ id: 'b-participations', current: 1, target: 1, completed: true }),
      expect.objectContaining({ id: 'rookie-championships', current: 0, target: 1, completed: false }),
    ]));
    expect(goal.opportunities[0]?.week).toBeGreaterThanOrEqual(6);
  });

  it('uses tournament gates for youth and second stages', () => {
    const youthGoal = buildCareerGoal(player({
      stage: 'youth',
      tierParticipations: { b: 2 },
      tierChampionships: { b: 1 },
    }));
    const secondGoal = buildCareerGoal(player({
      stage: 'second',
      tierParticipations: { a: 3 },
      tierChampionships: { a: 0 },
    }));

    expect(youthGoal.nextStageLabel).toBe('二线队');
    expect(youthGoal.goals).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'B 级赛事参赛', current: 2, target: 3 }),
      expect.objectContaining({ label: 'B 级赛事冠军', current: 1, target: 1, completed: true }),
    ]));
    expect(secondGoal.nextStageLabel).toBe('职业队');
    expect(secondGoal.goals).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'A 级赛事参赛', current: 3, target: 3, completed: true }),
      expect.objectContaining({ label: 'A 级赛事冠军', current: 0, target: 1, completed: false }),
    ]));
  });

  it('shows top career goals for pro stage', () => {
    const goal = buildCareerGoal(player({
      stage: 'pro',
      fame: 42,
      tierParticipations: { 's-main': 2, major: 1 },
      tierChampionships: { major: 1 },
    }));

    expect(goal.nextStageLabel).toBeUndefined();
    expect(goal.goals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 's-participations', current: 3, target: 4 }),
      expect.objectContaining({ id: 's-championships', current: 1, target: 1, completed: true }),
      expect.objectContaining({ id: 'fame', current: 42, target: 60 }),
    ]));
  });
});
