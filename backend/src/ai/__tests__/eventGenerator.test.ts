import { describe, expect, it } from 'vitest';
import { buildEventGenPrompt, extractJsonArray, parseAiEvents } from '../eventGenerator.js';
import type { Player } from '../../types.js';

function mockPlayer(): Player {
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
    traits: [],
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
    year: 1,
    week: 1,
    pendingMatch: null,
    actionPoints: 100,
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
    creditScore: 100,
    familyBailoutCount: 0,
    roundCombos: [],
    stats: {
      intelligence: 10,
      agility: 10,
      experience: 10,
      money: 10,
      mentality: 10,
      constitution: 10,
    },
  };
}

describe('AI event generation parsing', () => {
  it('extracts JSON arrays from common LLM wrappers', () => {
    const raw = [
      {
        id: 'ai-test',
        type: 'life',
        title: '测试事件',
        narrative: '你遇到一个测试事件，需要做出选择。',
        stages: ['rookie'],
        difficulty: 1,
        choices: [],
      },
    ];

    expect(extractJsonArray(`这里是事件：\n${JSON.stringify(raw)}\n请使用。`)).toEqual(raw);
    expect(extractJsonArray(`\`\`\`json\n${JSON.stringify({ events: raw })}\n\`\`\``)).toEqual(raw);
    expect(extractJsonArray(JSON.stringify(JSON.stringify(raw)))).toEqual(raw);
    expect(extractJsonArray(`阶段是 ["rookie"]，事件是：${JSON.stringify(raw[0])}`)).toEqual([raw[0]]);
  });

  it('prompt uses direct stressDelta instead of nesting it in statChanges', () => {
    const prompt = buildEventGenPrompt({
      player: mockPlayer(),
      recentHistory: [],
      gaps: [],
    });
    expect(prompt).toContain('"stressDelta":2');
    expect(prompt).not.toContain('"statChanges":{"stressDelta"');
  });

  it('normalizes common LLM shape mistakes before validation', () => {
    const text = JSON.stringify([
      {
        id: 'ai-pressure-night',
        type: 'stress',
        title: '深夜复盘',
        narrative: '你盯着屏幕里反复出现的失误，越看越觉得必须做点什么。',
        stages: ['rookie'],
        difficulty: 3,
        choices: [
          {
            id: 'reset',
            label: '先停下来',
            check: { primary: 'mentality', dc: 8 },
            success: { narrative: '你及时关掉录像，让脑子重新冷静下来。', statChanges: { mentality: 1 } },
            failure: { narrative: '你越看越上头，最后整晚都没睡踏实。', statChanges: { stressDelta: 2, money: -1 } },
          },
          {
            id: 'grind',
            label: '继续练枪',
            description: '你把不安塞进训练量里。',
            check: { primary: 'agility', dc: 10 },
            success: { narrative: '你的手感慢慢找回来了。', feelDelta: 1 },
            failure: { narrative: '你练到手腕发紧，状态反而更差。', fatigueDelta: 10 },
          },
        ],
      },
    ]);

    const parsed = parseAiEvents(text);
    expect(parsed.invalid).toHaveLength(0);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0]!.choices[0]!.description).toBe('先停下来');
    expect(parsed.valid[0]!.choices[0]!.failure.stressDelta).toBe(2);
    expect(parsed.valid[0]!.choices[0]!.failure.moneyDelta).toBe(-1);
    expect(parsed.valid[0]!.choices[0]!.failure.statChanges).toBeUndefined();
  });

  it('rejects generated events with unknown check stats', () => {
    const text = JSON.stringify([
      {
        id: 'ai-bad-stat',
        type: 'life',
        title: '奇怪检定',
        narrative: '你面对一个无法解释的局面。',
        stages: ['rookie'],
        difficulty: 1,
        choices: [
          {
            id: 'try',
            label: '试试看',
            description: '你决定试试看。',
            check: { primary: 'luck', dc: 8 },
            success: { narrative: '事情莫名其妙地成功了。' },
            failure: { narrative: '事情莫名其妙地失败了。' },
          },
          {
            id: 'leave',
            label: '离开',
            description: '你不想浪费时间。',
            check: { primary: 'mentality', dc: 6 },
            success: { narrative: '你稳住了自己的节奏。' },
            failure: { narrative: '你还是被影响到了。' },
          },
        ],
      },
    ]);

    const parsed = parseAiEvents(text);
    expect(parsed.valid).toHaveLength(0);
    expect(parsed.invalid).toHaveLength(1);
  });
});
