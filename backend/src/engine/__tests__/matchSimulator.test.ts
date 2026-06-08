import { describe, expect, it } from 'vitest';
import { applyChoice, createSession } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import { simulateMatch } from '../matchSimulator.js';
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

function rng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('simulateMatch', () => {
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
