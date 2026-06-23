import { describe, expect, it } from 'vitest';
import { buildCareerInsight } from '../insights/index.js';
import type { GameSession, Player } from '../../types.js';

function player(overrides: Partial<Player> = {}): Player {
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
      money: 20,
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
    originRegion: 'CN',
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
    creditScore: 60,
    familyBailoutCount: 0,
    roundCombos: [],
    ...overrides,
  } as Player;
}

function session(overrides: Partial<Player> = {}): GameSession {
  return {
    id: 's1',
    apiToken: 'token',
    player: player(overrides),
    phase: 'action',
    currentEvent: null,
    history: [],
    status: 'active',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    leaderboard: [],
  };
}

describe('buildCareerInsight', () => {
  it('explains the rookie route and first-round onboarding', () => {
    const insight = buildCareerInsight(session({ round: 1 }));

    expect(insight.stage.stage).toBe('rookie');
    expect(insight.milestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rookie-to-youth', status: 'in_progress' }),
    ]));
    expect(insight.milestones[0]?.missing).toEqual(expect.arrayContaining([
      expect.stringContaining('C/B 级赛事'),
      expect.stringContaining('B 级赛事'),
      expect.stringContaining('冠军'),
    ]));
    expect(insight.onboarding?.mode).toBe('first_round');
  });

  it('marks promotion milestone ready when requirements are met', () => {
    const insight = buildCareerInsight(session({
      tierParticipations: { c: 2, b: 1 },
      tierChampionships: { b: 1 },
    }));

    expect(insight.milestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rookie-to-youth', status: 'ready', missing: [] }),
    ]));
  });

  it('sorts high stress and high fatigue risks before softer warnings', () => {
    const insight = buildCareerInsight(session({
      stress: 91,
      volatile: { feel: 0, tilt: 0, fatigue: 76 },
      stats: { agility: 3, intelligence: 2, experience: 0, money: 3, mentality: 2, constitution: 2 },
    }));

    expect(insight.risks[0]).toEqual(expect.objectContaining({ id: 'high-stress', severity: 'danger' }));
    expect(insight.risks.map((risk) => risk.id)).toEqual(expect.arrayContaining(['high-fatigue', 'low-money']));
  });

  it('keeps action recommendations short and avoids action-phase advice during events', () => {
    const insight = buildCareerInsight({ ...session({ stress: 88 }), phase: 'event' });

    expect(insight.recommendations.length).toBeLessThanOrEqual(3);
    expect(insight.recommendations[0]?.reason).toContain('事件阶段');
  });
});
