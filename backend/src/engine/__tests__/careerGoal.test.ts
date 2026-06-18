import { describe, expect, it } from 'vitest';
import { buildYearTournaments } from '../../data/tournaments.js';
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
    weeklyTeamActions: {},
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

  it('marks gated A-tier opportunities unavailable without the required ticket', () => {
    const blockedGoal = buildCareerGoal(player({
      stage: 'second',
      week: 22,
      fame: 20,
      team: {
        clubId: 'semi-pro-test',
        name: '二线测试队',
        tag: 'SPT',
        region: 'CN',
        tier: 'semi-pro',
        monthlySalary: 20,
        joinedRound: 1,
        teamStatus: 'starter',
      },
    }), 20);

    expect(blockedGoal.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        week: 22,
        tier: 'A 级赛事',
        available: false,
        status: '缺A级公开预选门票',
      }),
    ]));
  });

  it('shows A-tier opportunities for a second-tier team with the required ticket', () => {
    const ticketGoal = buildCareerGoal(player({
      stage: 'second',
      week: 22,
      fame: 20,
      team: {
        clubId: 'semi-pro-test',
        name: '二线测试队',
        tag: 'SPT',
        region: 'CN',
        tier: 'semi-pro',
        monthlySalary: 20,
        joinedRound: 1,
        teamStatus: 'starter',
      },
      qualificationSlots: { 'a-open': 1 },
    }), 20);

    expect(ticketGoal.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({ week: 22, tier: 'A 级赛事', available: true, status: '可报名' }),
    ]));
  });

  it('shows all target opportunities in the next twelve weeks', () => {
    const goal = buildCareerGoal(player({
      stage: 'second',
      week: 21,
      fame: 30,
      team: {
        clubId: 'semi-pro-test',
        name: '二线测试队',
        tag: 'SPT',
        region: 'CN',
        tier: 'semi-pro',
        monthlySalary: 20,
        joinedRound: 1,
        teamStatus: 'starter',
      },
      qualificationSlots: { 'a-open': 1, 'a-main': 1 },
    }), 30);

    expect(goal.opportunities.map((opportunity) => opportunity.week)).toEqual([22, 25, 27, 29, 30, 33]);
  });

  it('includes additional A-tier open qualifiers in early second-stage planning', () => {
    const goal = buildCareerGoal(player({
      stage: 'second',
      week: 6,
      fame: 20,
      team: {
        clubId: 'semi-pro-test',
        name: '二线测试队',
        tag: 'SPT',
        region: 'CN',
        tier: 'semi-pro',
        monthlySalary: 20,
        joinedRound: 1,
        teamStatus: 'starter',
      },
      qualificationSlots: { 'a-open': 1 },
    }), 20);

    expect(goal.opportunities.map((opportunity) => opportunity.week)).toEqual([8, 11, 13, 15, 16]);
    expect(goal.opportunities.filter((opportunity) => opportunity.name.includes('Open Qualifier')).length)
      .toBeGreaterThanOrEqual(2);
  });

  it('does not lock youth and second B-tier A-open tickets behind championships only', () => {
    const bMainEvents = buildYearTournaments(1).filter((tournament) => (
      tournament.tier === 'b'
      && tournament.stages.includes('youth')
      && tournament.stages.includes('second')
      && tournament.teamRequirement === 'youth'
      && tournament.qualificationMilestones?.some((milestone) => (
        milestone.rewards.some((reward) => reward.slot === 'a-open')
      ))
    ));

    expect(bMainEvents.length).toBeGreaterThanOrEqual(8);
    for (const tournament of bMainEvents) {
      expect(tournament.qualificationMilestones).toEqual(expect.arrayContaining([
        expect.objectContaining({
          stageIndex: 0,
          label: '晋级决赛',
          rewards: expect.arrayContaining([expect.objectContaining({ slot: 'a-open' })]),
        }),
      ]));
    }
  });

  it('adds a direction hint from the current club profile', () => {
    const goal = buildCareerGoal(player({
      stage: 'youth',
      team: {
        clubId: 'club-cyber-academy',
        name: '赛博学院',
        tag: 'CYA',
        region: '亚太',
        tier: 'youth',
        monthlySalary: 10,
        joinedRound: 1,
        teamStatus: 'trial',
        teamStatusUntilRound: 9,
      },
    }));

    expect(goal.teamHint).toContain('战术体系晋级');
    expect(goal.teamHint).toContain('试训期');
  });
});
