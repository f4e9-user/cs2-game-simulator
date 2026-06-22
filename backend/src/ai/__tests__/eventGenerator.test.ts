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
    originRegion: '本地',
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
  it('accepts tournament context events with context phase metadata', () => {
    const parsed = parseAiEvents(JSON.stringify([
      {
        id: 'ai-tournament-pressure',
        type: 'tournament-context',
        contextPhase: ['pre-match'],
        triggerReason: 'pending tournament and high stress',
        title: '赛前压力',
        narrative: '比赛前一晚，你发现自己一直在回想上一场失败的残局。',
        stages: ['rookie'],
        difficulty: 3,
        choices: [
          {
            id: 'reset',
            label: '重新整理',
            description: '你把注意力拉回当前比赛。',
            check: { primary: 'mentality', dc: 8 },
            success: { narrative: '你把思路收回来，呼吸也慢了下来。', stateDelta: { stress: -3 } },
            failure: { narrative: '越想整理越乱，脑子里只剩失败画面。', stateDelta: { stress: 4 } },
          },
          {
            id: 'ignore',
            label: '硬顶过去',
            description: '你不处理这些念头，直接睡觉。',
            check: { primary: 'constitution', dc: 8 },
            success: { narrative: '你勉强睡着，醒来后状态还算完整。' },
            failure: { narrative: '你睡得很浅，醒来后更加疲惫。', stateDelta: { fatigue: 6 } },
          },
        ],
      },
    ]));

    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0]?.type).toBe('tournament-context');
  });

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

  it('prompt uses structured outcome blocks instead of flat delta fields', () => {
    const prompt = buildEventGenPrompt({
      player: mockPlayer(),
      recentHistory: [],
      gaps: [],
    });
    expect(prompt).toContain('"stateDelta":{"stress":2}');
    expect(prompt).toContain('"coreGrowth":{"mentality":1}');
    expect(prompt).not.toContain('"statChanges":{"stressDelta"');
    expect(prompt).not.toContain('"stressDelta":2');
  });

  it('injects team identity and V4 permission boundaries into the prompt', () => {
    const prompt = buildEventGenPrompt({
      player: {
        ...mockPlayer(),
        team: {
          clubId: 'club-cyber-academy',
          name: '赛博学院',
          tag: 'CYA',
          region: '亚太',
          tier: 'youth',
          monthlySalary: 10,
          joinedRound: 1,
          teamStatus: 'rotation',
          teamStatusUntilRound: 12,
        },
        visibleTeamIdentity: 'star',
        roster: [
          {
            id: 'slot-1',
            name: '指挥队友',
            role: 'IGL',
            personality: 'strict',
            traits: ['igl'],
            stats: { agility: 5, intelligence: 12, mentality: 8, experience: 9 },
            growthSpent: 0,
            chemistry: 40,
            visibleIdentity: 'caller',
          },
        ],
      },
      recentHistory: [],
      gaps: [],
    });

    expect(prompt).toContain('队内定位：rotation');
    expect(prompt).toContain('玩家队内身份：star');
    expect(prompt).toContain('指挥队友:caller');
    expect(prompt).toContain('不能决定训练方向、换人、转会、合同或预算');
  });

  it('injects world storylines as read-only event context', () => {
    const prompt = buildEventGenPrompt({
      player: mockPlayer(),
      recentHistory: [],
      gaps: [],
      worldStorylines: ['赛博学院: storylines=dark-horse-run; recent=deep-run/b'],
    });

    expect(prompt).toContain('【世界战队故事线】');
    expect(prompt).toContain('dark-horse-run');
    expect(prompt).toContain('不允许直接改写世界战队状态');
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
    expect(parsed.valid[0]!.choices[0]!.success.coreGrowth?.mentality).toBe(1);
    expect(parsed.valid[0]!.choices[0]!.failure.stateDelta?.stress).toBe(2);
    expect(parsed.valid[0]!.choices[0]!.failure.resourceDelta?.money).toBe(-1);
    expect('statChanges' in parsed.valid[0]!.choices[0]!.failure).toBe(false);
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
