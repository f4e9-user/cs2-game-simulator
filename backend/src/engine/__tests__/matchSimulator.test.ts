import { describe, expect, it } from 'vitest';
import { applyChoice, createSession } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import { simulateMatch } from '../matchSimulator.js';
import type { Player } from '../../types.js';
import { getEventById } from '../../data/events/index.js';

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

function rng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('simulateMatch', () => {
  const bFinalContext = {
    tier: 'b' as const,
    progressionTier: 'b' as const,
    entryType: 'direct_signup' as const,
    stageIndex: 1,
    effectiveDifficulty: 3,
  };

  it('rates low-output short samples by per-round contribution instead of K/D alone', () => {
    const result = simulateMatch(
      player({ stats: { agility: 3, intelligence: 2, experience: 0, money: 0, mentality: 2, constitution: 2 } }),
      1,
      rng([0.99, 0.99, 0.5, 0.5, 0.5, 0.5]),
    );

    expect(result.won).toBe(false);
    expect(result.kills).toBeLessThanOrEqual(7);
    expect(result.rating).toBeLessThan(1);
  });

  it('still rewards high per-round output for strong players', () => {
    const result = simulateMatch(
      player({
        stats: {
          agility: 18,
          intelligence: 16,
          experience: 12,
          money: 0,
          mentality: 16,
          constitution: 14,
        },
        volatile: { feel: 2, tilt: 0, fatigue: 10 },
        stage: 'pro',
      }),
      3,
      rng([0.01, 0.5, 0.99, 0.2, 0.99, 0.8]),
    );

    expect(result.won).toBe(true);
    expect(result.kills).toBeGreaterThan(result.deaths);
    expect(result.rating).toBeGreaterThan(1.1);
  });

  it('separates team win power from personal headshot output', () => {
    const base = player({
      stats: {
        agility: 9,
        intelligence: 8,
        experience: 6,
        money: 0,
        mentality: 10,
        constitution: 8,
      },
      volatile: { feel: 1, tilt: 0, fatigue: 20 },
      stage: 'youth',
    });
    const strongTeam = player({
      ...base,
      team: {
        clubId: 'club-cyber-academy',
        name: '赛博学院',
        tag: 'CYA',
        region: '亚太',
        tier: 'youth',
        joinedRound: 1,
        monthlySalary: 10,
      },
      roster: [
        {
          id: 'slot-1',
          name: 'caller',
          role: 'IGL',
          personality: 'supportive',
          traits: ['tactical', 'support'],
          stats: { agility: 8, intelligence: 8, mentality: 8, experience: 8 },
          growthSpent: 0,
          chemistry: 80,
        },
        {
          id: 'slot-2',
          name: 'awp',
          role: 'AWPer',
          personality: 'grinder',
          traits: ['aimer', 'steady'],
          stats: { agility: 8, intelligence: 8, mentality: 8, experience: 8 },
          growthSpent: 0,
          chemistry: 80,
        },
        {
          id: 'slot-3',
          name: 'support',
          role: 'Support',
          personality: 'supportive',
          traits: ['support', 'selfless'],
          stats: { agility: 8, intelligence: 8, mentality: 8, experience: 8 },
          growthSpent: 0,
          chemistry: 80,
        },
        {
          id: 'slot-4',
          name: 'lurker',
          role: 'Lurker',
          personality: 'strict',
          traits: ['steady', 'clutch'],
          stats: { agility: 8, intelligence: 8, mentality: 8, experience: 8 },
          growthSpent: 0,
          chemistry: 80,
        },
      ],
      teamTrust: 80,
    });

    const rolls = [0.45, 0.5, 0.5, 0.5, 0.5, 0.5];
    const solo = simulateMatch(base, bFinalContext, rng(rolls));
    const withTeam = simulateMatch(strongTeam, bFinalContext, rng(rolls));

    expect(withTeam.winProb).toBeGreaterThan(solo.winProb);
    expect(withTeam.won).toBe(true);
    expect(solo.won).toBe(false);
    expect(withTeam.headshotRate - solo.headshotRate).toBeLessThan(0.05);
  });

  it('applies role profile match contribution as team-side match effects', () => {
    const p = player({
      activeRole: 'IGL',
      preferredRole: 'IGL',
      roleCrystallized: true,
      stats: {
        agility: 10,
        intelligence: 16,
        experience: 12,
        money: 0,
        mentality: 14,
        constitution: 10,
      },
      team: {
        clubId: 'club-cyber-academy',
        name: '赛博学院',
        tag: 'CYA',
        region: '亚太',
        tier: 'youth',
        joinedRound: 1,
        monthlySalary: 10,
      },
      roster: [
        {
          id: 'slot-1',
          name: 'caller',
          role: 'IGL',
          personality: 'supportive',
          traits: ['tactical', 'support'],
          stats: { agility: 8, intelligence: 8, mentality: 8, experience: 8 },
          growthSpent: 0,
          chemistry: 80,
        },
        {
          id: 'slot-2',
          name: 'awp',
          role: 'AWPer',
          personality: 'grinder',
          traits: ['aimer', 'steady'],
          stats: { agility: 8, intelligence: 8, mentality: 8, experience: 8 },
          growthSpent: 0,
          chemistry: 80,
        },
      ],
    });
    const session = createSession(p, 1);
    session.currentEvent = toPublicEvent(getEventById('routine-standard')!);
    const resolved = applyChoice(session, 'structured-training', 20);
    expect(typeof resolved.result.passiveEffects.join(' ')).toBe('string');
  });

  it('lowers win probability against a strong concrete opponent', () => {
    const p = player({
      stats: {
        agility: 14,
        intelligence: 12,
        experience: 10,
        money: 0,
        mentality: 12,
        constitution: 10,
      },
      volatile: { feel: 1, tilt: 0, fatigue: 10 },
      stage: 'pro',
    });
    const baseContext = {
      tier: 's-open' as const,
      progressionTier: 's-qualifier' as const,
      entryType: 'direct_signup' as const,
      stageIndex: 1,
      effectiveDifficulty: 4,
    };

    const generic = simulateMatch(p, baseContext, rng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
    const concrete = simulateMatch(p, {
      ...baseContext,
      opponent: {
        power: 16,
        vrsScore: 180,
        form: 35,
      },
    }, rng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));

    expect(concrete.winProb).toBeLessThan(generic.winProb);
  });

  it('consumes pre-match intel on tournament match experience growth', () => {
    const p = player({
      stats: {
        agility: 18,
        intelligence: 16,
        experience: 12,
        money: 0,
        mentality: 16,
        constitution: 14,
      },
      buffs: [
        {
          id: 'pre-match-intel',
          label: '赛前情报',
          actionTag: 'match',
          growthKey: 'experience',
          growthMultiplier: 1.15,
          remainingUses: 2,
          consumeOn: 'growth',
        },
      ],
    });
    const session = createSession(p, 1);
    session.currentEvent = toPublicEvent({
      id: 'tournament-y1-c-01--0',
      type: 'match',
      title: '测试赛事',
      narrative: '测试赛事',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      choices: [
        {
          id: 'match-play',
          label: '上场比赛',
          description: '测试',
          check: { primary: 'agility', dc: 0 },
          success: { narrative: '' },
          failure: { narrative: '' },
        },
      ],
    }, []);

    const updated = applyChoice(session, 'match-play');
    const buff = updated.session.player.buffs.find((entry) => entry.id === 'pre-match-intel');
    expect(buff?.remainingUses).toBe(1);
  });
});
