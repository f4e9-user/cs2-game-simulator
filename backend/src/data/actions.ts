import type { EventType, Outcome, StatKey } from '../types.js';

export interface ActionCheck {
  primary: StatKey;
  secondary?: StatKey;
  dc: number;
  traitBonuses?: Record<string, number>;
  traitPenalties?: Record<string, number>;
}

export interface ActionDef {
  id: string;
  label: string;
  description: string;
  apCost: number;
  eventType: EventType; // used for buff matching
  check: ActionCheck;
  success: Outcome;
  failure: Outcome;
  comboOpens?: ComboOpen[];
  comboConsumes?: ComboConsume[];
}

export interface ComboOpen {
  id: string;
  label: string;
  requireSuccess?: boolean;
}

export interface ComboConsume {
  id: string;
  label: string;
  effects: {
    growthMultiplier?: number;
    growthKey?: StatKey;
    fatigueGainMultiplier?: number;
    stressGainMultiplier?: number;
    feelDelta?: number;
    tiltDelta?: number;
    fatigueDelta?: number;
    stressDelta?: number;
  };
}

function randomMoney(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'action-ranked-grind',
    label: '打天梯',
    description: '通过实战对局磨练枪法，疲劳换取手感与敏捷成长。',
    apCost: 30,
    eventType: 'ranked',
    check: {
      primary: 'agility',
      dc: 7,
      traitBonuses: { solo: 2, mechanical: 2, grinder: 2 },
      traitPenalties: { streamer: 1 },
    },
    success: {
      narrative: '状态在线，几局下来准星越来越稳。',
      dailyGrowth: 'agility',
      stateDelta: {
        feel: 1,
        fatigue: 18,
        stress: 6,
      },
    },
    failure: {
      narrative: '发挥失常，连输几局，情绪开始走低。',
      stateDelta: {
        fatigue: 14,
        tilt: 1,
        stress: 12,
      },
    },
    comboOpens: [
      { id: 'practical-problems', label: '实战问题', requireSuccess: false },
    ],
    comboConsumes: [
      {
        id: 'structured-mind',
        label: '结构化思路',
        effects: { growthKey: 'agility', growthMultiplier: 1.08, tiltDelta: -1 },
      },
      {
        id: 'flow-ready',
        label: '心流准备',
        effects: { stressGainMultiplier: 0.85, tiltDelta: -1 },
      },
      {
        id: 'body-activated',
        label: '身体激活',
        effects: { fatigueGainMultiplier: 0.9 },
      },
      {
        id: 'body-reset',
        label: '身体清空',
        effects: { feelDelta: 1, fatigueGainMultiplier: 0.9 },
      },
    ],
  },
  {
    id: 'action-structured-training',
    label: '系统训练',
    description: '按计划进行战术训练，提升智力与决策成长。',
    apCost: 30,
    eventType: 'training',
    check: {
      primary: 'intelligence',
      dc: 6,
      traitBonuses: { tactical: 3, igl: 2, steady: 1 },
    },
    success: {
      narrative: '训练顺畅，身体记住了不少东西。',
      dailyGrowth: 'intelligence',
      stateDelta: {
        fatigue: 14,
        stress: 6,
      },
    },
    failure: {
      narrative: '注意力散漫，训练质量一般。',
      stateDelta: {
        fatigue: 10,
        stress: 8,
      },
    },
    comboOpens: [
      { id: 'structured-mind', label: '结构化思路', requireSuccess: true },
    ],
    comboConsumes: [
      {
        id: 'practical-problems',
        label: '实战问题',
        effects: { growthKey: 'intelligence', growthMultiplier: 1.08, stressGainMultiplier: 0.9 },
      },
      {
        id: 'body-activated',
        label: '身体激活',
        effects: { fatigueGainMultiplier: 0.9 },
      },
    ],
  },
  {
    id: 'action-rest-day',
    label: '休息一天',
    description: '轻度放松，恢复体力和压力，但不碰键盘会让手感略微生疏。',
    apCost: 30,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 5,
      traitBonuses: { steady: 2 },
      traitPenalties: { grinder: 1, obsessed: 1 },
    },
    success: {
      narrative: '好好睡了一觉，整个人状态好多了，就是手有点生。',
      stateDelta: {
        feel: -0.5,
        fatigue: -24,
        stress: -7,
      },
    },
    failure: {
      narrative: '睡不踏实，脑子里还是那几局的画面，准星感觉也跑偏了。',
      stateDelta: {
        feel: -1,
        fatigue: -12,
        stress: -2,
      },
    },
    comboConsumes: [
      {
        id: 'overdrawn',
        label: '透支感',
        effects: { fatigueDelta: -5, stressDelta: -5 },
      },
    ],
  },
  {
    id: 'action-vacation',
    label: '度假断网',
    description: '彻底离开电脑，大幅恢复疲劳和压力，但手感会明显生疏。',
    apCost: 50,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 1,
    },
    success: {
      narrative: '三天没碰键盘，身体完全放松下来，但准星感觉飘了不少。',
      stateDelta: {
        feel: -2.5,
        fatigue: -45,
        stress: -60,
      },
    },
    failure: {
      narrative: '强迫自己放松，效果一般，回来之后手感也生疏了好一阵。',
      stateDelta: {
        feel: -3,
        fatigue: -30,
        stress: -40,
      },
    },
    comboOpens: [
      { id: 'body-reset', label: '身体清空', requireSuccess: false },
    ],
  },
  {
    id: 'action-fitness',
    label: '健身锻炼',
    description: '力量和有氧训练，增强体能素质，训练后会有疲劳积累。',
    apCost: 30,
    eventType: 'routine',
    check: {
      primary: 'constitution',
      dc: 6,
      traitBonuses: { athletic: 2, grinder: 1 },
      traitPenalties: { fragile: 2, streamer: 1 },
    },
    success: {
      narrative: '完成了一组高质量训练，肌肉结实了不少，体能明显提升。',
      dailyGrowth: 'constitution',
      stateDelta: {
        fatigue: 20,
      },
    },
    failure: {
      narrative: '训练过度，身体还没适应这个强度，有点吃不消。',
      stateDelta: {
        fatigue: 18,
      },
    },
    comboOpens: [
      { id: 'body-activated', label: '身体激活', requireSuccess: true },
    ],
  },
  {
    id: 'action-meditation',
    label: '冥想静心',
    description: '专注呼吸与正念练习，快速缓解疲劳和压力，不消耗成长预算。',
    apCost: 15,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 4,
      traitBonuses: { steady: 3, igl: 1 },
      traitPenalties: { solo: 1, obsessed: 1 },
    },
    success: {
      narrative: '静坐了二十分钟，呼吸渐渐平稳，头脑也清晰了许多。',
      stateDelta: {
        fatigue: -8,
        stress: -10,
      },
    },
    failure: {
      narrative: '思绪总是飘到训练赛上，静不下来，效果打了折扣。',
      stateDelta: {
        fatigue: -4,
        stress: -5,
      },
    },
    comboOpens: [
      { id: 'flow-ready', label: '心流准备', requireSuccess: true },
    ],
    comboConsumes: [
      {
        id: 'overdrawn',
        label: '透支感',
        effects: { fatigueDelta: -5, stressDelta: -5 },
      },
    ],
  },
  {
    id: 'action-mental-training',
    label: '心理训练',
    description: '专项心理强化训练，提升抗压能力与心态成长，但强度较高会积累疲劳。',
    apCost: 30,
    eventType: 'training',
    check: {
      primary: 'mentality',
      dc: 7,
      traitBonuses: { steady: 2, igl: 2, grinder: 1 },
      traitPenalties: { solo: 1, obsessed: 2 },
    },
    success: {
      narrative: '高强度的压力模拟训练结束，脑子绷了一整天，但确实感觉抗压能力提升了。',
      dailyGrowth: 'mentality',
      stateDelta: {
        fatigue: 12,
        stress: 6,
      },
    },
    failure: {
      narrative: '心理素质还不足以撑过这个强度的模拟，训练中途崩了，有点挫败感。',
      stateDelta: {
        fatigue: 10,
        stress: 11,
      },
    },
    comboConsumes: [
      {
        id: 'flow-ready',
        label: '心流准备',
        effects: { stressGainMultiplier: 0.85, tiltDelta: -1 },
      },
    ],
  },
  {
    id: 'action-boosting',
    label: '代练接单',
    description: '接几单高强度代练，用反应和枪法换取现金，但身心消耗很大。',
    apCost: 35,
    eventType: 'routine',
    check: {
      primary: 'agility',
      dc: 10,
      traitBonuses: { mechanical: 2, grinder: 1, solo: 1 },
      traitPenalties: { fragile: 1, impulsive: 1 },
    },
    success: {
      narrative: '订单打得干净利落，老板痛快结账，钱包终于鼓了一点。',
      stateDelta: {
        fatigue: 26,
        stress: 13,
      },
      resourceDelta: {
        money: randomMoney(5, 8),
      },
    },
    failure: {
      narrative: '疲劳让操作变形，几局关键失误被扣了尾款，只赚到一点辛苦钱。',
      stateDelta: {
        fatigue: 45,
        stress: 22.5,
      },
      resourceDelta: {
        money: 1,
      },
    },
    comboOpens: [
      { id: 'overdrawn', label: '透支感', requireSuccess: false },
    ],
  },
  {
    id: 'action-coaching',
    label: '陪玩指导',
    description: '靠理解和复盘能力陪练指导新人，收入稳定但也会消耗耐心。',
    apCost: 30,
    eventType: 'routine',
    check: {
      primary: 'intelligence',
      dc: 6,
      traitBonuses: { tactical: 2, igl: 2, steady: 1 },
      traitPenalties: { solo: 1, shy: 1 },
    },
    success: {
      narrative: '讲点位、拆回合、带客户上分都很顺，指导费顺利到账。',
      stateDelta: {
        fatigue: 14,
        stress: 6,
      },
      resourceDelta: {
        money: randomMoney(3, 5),
      },
    },
    failure: {
      narrative: '客户跟不上节奏，你也因为疲劳讲错细节，最后只拿到基础费用。',
      stateDelta: {
        fatigue: 28,
        stress: 12,
      },
      resourceDelta: {
        money: 1,
      },
    },
    comboOpens: [
      { id: 'overdrawn', label: '透支感', requireSuccess: false },
    ],
  },
  {
    id: 'action-net-cafe',
    label: '网吧打工',
    description: '去熟人网吧帮忙值班和处理设备杂事，靠体力换一点周转资金。',
    apCost: 35,
    eventType: 'routine',
    check: {
      primary: 'constitution',
      dc: 4,
      traitBonuses: { athletic: 2, steady: 1, streetwise: 1 },
      traitPenalties: { fragile: 2, streamer: 1 },
    },
    success: {
      narrative: '换外设、看机器、收银都没出岔子，老板按约定把工钱结清。',
      stateDelta: {
        fatigue: 22,
        stress: 10,
      },
      resourceDelta: {
        money: randomMoney(3, 4),
      },
    },
    failure: {
      narrative: '一整天太累，盘点和找零都出了小错，被扣钱后只剩一点收入。',
      stateDelta: {
        fatigue: 38,
        stress: 19,
      },
      resourceDelta: {
        money: 1,
      },
    },
    comboOpens: [
      { id: 'overdrawn', label: '透支感', requireSuccess: false },
    ],
  },
];

export function getAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}
