import { describe, it, expect } from 'vitest';
import {
  buildPersonalizePrompt,
  buildNarrativePrompt,
  buildIntroPrompt,
  buildSocialFeedPrompt,
} from '../prompts.js';
import type {
  Player,
  Trait,
  GameEventPublic,
  Background,
  RoundResult,
  LeaderboardTeam,
} from '../../types.js';
import type { TraitNarrativeRule, EventNarrativeMeta } from '../narrativeConfig.js';

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

function mockEventMeta(): EventNarrativeMeta {
  return {
    eventType: 'bailout',
    emotionTone: '被救济的自尊冲突',
    playerStance: '被动接受关怀',
    conflictType: '经济-自尊',
    traitReactions: {
      scapegoat: {
        emphasis: ['被关怀时感到刺痛'],
        avoid: ['不要写成心安理得'],
      },
    },
    narrativeConstraints: ['禁止写成被施舍的愤怒'],
  };
}

function mockEvent(): GameEventPublic {
  return {
    id: 'test-event',
    type: 'life',
    title: 'Test Event',
    narrative: '这是一个测试事件。',
    choices: [
      { id: 'a', label: '选择A', description: '做A事情' },
      { id: 'b', label: '选择B', description: '做B事情' },
    ],
  };
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

describe('buildPersonalizePrompt', () => {
  it('includes scapegoat negative example and emotional core', () => {
    const prompt = buildPersonalizePrompt(
      mockPlayer(),
      mockTraits(),
      mockEvent(),
      mockTraitRules(),
      mockEventMeta(),
    );
    expect(prompt).toContain('不要写成抱怨家人');
    expect(prompt).toContain('内疚与自责的循环');
    expect(prompt).toContain('被救济的自尊冲突');
  });

  it('works without optional params (backward compatibility)', () => {
    const prompt = buildPersonalizePrompt(
      mockPlayer(),
      mockTraits(),
      mockEvent(),
    );
    expect(prompt).toContain('全程使用第二人称');
  });

  it('includes both scapegoat and hothead forbidden misreads', () => {
    const prompt = buildPersonalizePrompt(
      mockPlayer(),
      mockTraits(),
      mockEvent(),
      mockTraitRules(),
      mockEventMeta(),
    );
    expect(prompt).toContain('scapegoat');
    expect(prompt).toContain('hothead');
    expect(prompt).toContain('不要写成抱怨家人');
    expect(prompt).toContain('不要写成对关心自己的人发火');
  });
});

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
});
