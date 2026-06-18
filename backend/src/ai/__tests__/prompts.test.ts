import { describe, it, expect } from 'vitest';
import {
  buildNarrativePrompt,
  buildIntroPrompt,
  buildSocialFeedPrompt,
} from '../prompts.js';
import type {
  Player,
  Trait,
  Background,
  RoundResult,
  LeaderboardTeam,
} from '../../types.js';
import type { TraitNarrativeRule } from '../narrativeConfig.js';

function mockPlayer(overrides?: Partial<Player>): Player {
  return {
    name: 'TestPlayer',
    stage: 'rookie',
    stress: 50,
    fame: 1,
    volatile: { feel: 0, tilt: 0, fatigue: 30 },
    feelCap: 3,
    peripheralTier: 0,
    buffs: [],
    growthSpent: 0,
    traits: ['scapegoat', 'hothead'],
    backgroundId: 'test-bg',
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
    restRounds: 0,
    stressMaxRounds: 0,
    year: 0,
    week: 0,
    pendingMatch: null,
    actionPoints: 3,
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
    stats: {
      intelligence: 10,
      agility: 10,
      experience: 10,
      money: 10,
      mentality: 10,
      constitution: 10,
    },
    ...overrides,
  } as Player;
}

function mockTraitRules(): TraitNarrativeRule[] {
  return [
    {
      traitId: 'scapegoat',
      emotionalCore: '内疚与自责的循环，沉默是唯一的盔甲',
      behaviorPatterns: [
        '习惯性承担不属于自己的责任',
        '沉默比辩解更安全',
      ],
      forbiddenMisreads: [
        '不要写成抱怨家人',
        '不要写成甩锅给队友',
      ],
      stateInteractions: {
        feel_hot: '想证明自己值得被投资',
      },
    },
    {
      traitId: 'hothead',
      emotionalCore: '愤怒是信号，不是噪音',
      behaviorPatterns: [
        '对不公和失误反应激烈',
        '愤怒中反而更准',
      ],
      forbiddenMisreads: [
        '不要写成对关心自己的人发火',
        '不要写成无理取闹',
      ],
      stateInteractions: {
        stress_high: '濒临失控，一句话就能点燃',
      },
    },
  ];
}

function mockTraits(): Trait[] {
  return [
    { id: 'scapegoat', name: '背锅侠', description: '习惯性承担责任', modifiers: { mentality: 2 }, tags: ['social'] },
    { id: 'hothead', name: '暴脾气', description: '情绪反应激烈', modifiers: { agility: 1 }, tags: ['combat'] },
  ];
}

function mockBackground(): Background {
  return {
    id: 'test-bg',
    name: '测试背景',
    description: '这是一个测试出身背景',
    startStage: 'rookie',
    statBias: { mentality: 2 },
    tags: [],
  };
}

describe('buildNarrativePrompt', () => {
  it('includes trait context in normal branch', () => {
    const prompt = buildNarrativePrompt(
      {
        player: mockPlayer(),
        baseNarrative: '测试叙事',
        eventTitle: '测试事件',
        choiceLabel: '测试选择',
        success: true,
      },
      mockTraitRules(),
    );
    expect(prompt).toContain('scapegoat');
    expect(prompt).toContain('内疚与自责的循环');
  });

  it('includes trait context in custom action branch', () => {
    const prompt = buildNarrativePrompt(
      {
        player: mockPlayer(),
        baseNarrative: '测试叙事',
        eventTitle: '测试事件',
        choiceLabel: '测试选择',
        success: true,
        customAction: '选手临时改变战术',
      },
      mockTraitRules(),
    );
    expect(prompt).toContain('自定义行动');
    expect(prompt).toContain('scapegoat');
    expect(prompt).toContain('内疚与自责的循环');
  });

  it('includes trait context in match stats branch', () => {
    const prompt = buildNarrativePrompt(
      {
        player: mockPlayer(),
        baseNarrative: '测试叙事',
        eventTitle: '测试事件',
        choiceLabel: '测试选择',
        success: true,
        matchStats: {
          kills: 15,
          deaths: 5,
          assists: 8,
          headshotRate: 0.45,
          rating: 1.35,
          teamScore: 13,
          enemyScore: 8,
        },
      },
      mockTraitRules(),
    );
    expect(prompt).toContain('比赛数据');
    expect(prompt).toContain('scapegoat');
    expect(prompt).toContain('内疚与自责的循环');
  });
});

describe('buildIntroPrompt', () => {
  it('includes trait context', () => {
    const prompt = buildIntroPrompt(
      mockPlayer(),
      mockTraits(),
      mockBackground(),
      mockTraitRules(),
    );
    expect(prompt).toContain('scapegoat');
    expect(prompt).toContain('内疚与自责的循环');
  });

  it('includes trait names from mockTraits', () => {
    const prompt = buildIntroPrompt(
      mockPlayer(),
      mockTraits(),
      mockBackground(),
      mockTraitRules(),
    );
    expect(prompt).toContain('背锅侠');
    expect(prompt).toContain('暴脾气');
  });
});

describe('buildSocialFeedPrompt', () => {
  it('includes trait mapping for social media', () => {
    const prompt = buildSocialFeedPrompt(
      mockPlayer(),
      [] as RoundResult[],
      [] as LeaderboardTeam[],
      mockTraitRules(),
    );
    expect(prompt).toContain('社媒');
    expect(prompt).toContain('scapegoat');
    expect(prompt).toContain('间接体现');
  });

  it('includes hothead behavior pattern', () => {
    const prompt = buildSocialFeedPrompt(
      mockPlayer(),
      [] as RoundResult[],
      [] as LeaderboardTeam[],
      mockTraitRules(),
    );
    expect(prompt).toContain('愤怒是信号');
  });

  it('works without trait rules', () => {
    const prompt = buildSocialFeedPrompt(
      mockPlayer(),
      [] as RoundResult[],
      [] as LeaderboardTeam[],
    );
    expect(prompt).toContain('社交媒体模拟引擎');
  });

  it('uses the historical team snapshot for recent tournament reports', () => {
    const prompt = buildSocialFeedPrompt(
      mockPlayer({
        team: {
          clubId: 'iron-wolves',
          name: '铁狼',
          tag: 'IW',
          region: 'CN',
          tier: 'semi-pro',
          monthlySalary: 20,
          joinedRound: 2,
        },
      }),
      [{
        round: 1,
        eventId: 'tournament-academy-league-s4--2',
        eventType: 'match',
        eventTitle: 'Academy League Season 4 决赛',
        teamSnapshot: {
          clubId: 'cyber-academy',
          name: '赛博学院',
          tag: 'CYA',
          region: 'CN',
          tier: 'youth',
        },
        choiceId: 'play',
        choiceLabel: '参赛',
        success: true,
        roll: 15,
        dc: 12,
        narrative: '决赛打满三图，队伍执行更稳。',
        statChanges: {},
        newStats: mockPlayer().stats,
        stageBefore: 'rookie',
        stageAfter: 'youth',
        tagsAdded: [],
        tagsRemoved: [],
        passiveEffects: [],
        qualificationChanges: [],
        stressChange: 0,
        fameChange: 4,
        feelChange: 0,
        tiltChange: 0,
        fatigueChange: 0,
        buffsAdded: [],
        matchStats: {
          kills: 18,
          deaths: 9,
          assists: 4,
          headshotRate: 0.42,
          rating: 1.21,
          teamScore: 16,
          enemyScore: 12,
        },
        createdAt: '2026-06-09T00:00:00.000Z',
      } as RoundResult],
      [] as LeaderboardTeam[],
    );

    expect(prompt).toContain('赛博学院 在「Academy League Season 4 决赛」夺冠/晋级');
    expect(prompt).toContain('禁止用当前战队改写旧赛事');
    expect(prompt).not.toContain('铁狼 在「Academy League Season 4 决赛」');
  });
});
