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
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'action-ranked-grind',
    label: '打天梯',
    description: '通过实战对局磨练枪法，疲劳换取手感与敏捷成长。',
    apCost: 25,
    eventType: 'ranked',
    check: {
      primary: 'agility',
      dc: 7,
      traitBonuses: { solo: 2, mechanical: 2, grinder: 2 },
      traitPenalties: { streamer: 1 },
    },
    success: {
      narrative: '状态在线，几局下来准星越来越稳。',
      dailyGrowth: 'agility' as StatKey,
      feelDelta: 1,
      fatigueDelta: 15,
    },
    failure: {
      narrative: '发挥失常，连输几局，情绪开始走低。',
      fatigueDelta: 10,
      tiltDelta: 1,
    },
  },
  {
    id: 'action-structured-training',
    label: '系统训练',
    description: '按计划进行战术训练，提升智力与决策成长。',
    apCost: 25,
    eventType: 'training',
    check: {
      primary: 'intelligence',
      dc: 6,
      traitBonuses: { tactical: 3, igl: 2, steady: 1 },
    },
    success: {
      narrative: '训练顺畅，身体记住了不少东西。',
      dailyGrowth: 'intelligence' as StatKey,
      fatigueDelta: 12,
    },
    failure: {
      narrative: '注意力散漫，训练质量一般。',
      fatigueDelta: 8,
    },
  },
  {
    id: 'action-rest-day',
    label: '休息一天',
    description: '轻度放松，恢复体力和压力，但不碰键盘会让手感略微生疏。',
    apCost: 25,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 5,
      traitBonuses: { steady: 2 },
      traitPenalties: { grinder: 1, obsessed: 1 },
    },
    success: {
      narrative: '好好睡了一觉，整个人状态好多了，就是手有点生。',
      feelDelta: -0.5,
      fatigueDelta: -20,
      stressDelta: -1,
    },
    failure: {
      narrative: '睡不踏实，脑子里还是那几局的画面，准星感觉也跑偏了。',
      feelDelta: -1,
      fatigueDelta: -10,
    },
  },
  {
    id: 'action-vacation',
    label: '度假断网',
    description: '彻底离开电脑，大幅恢复疲劳和压力，但手感会明显生疏。',
    apCost: 25,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 1,
    },
    success: {
      narrative: '三天没碰键盘，身体完全放松下来，但准星感觉飘了不少。',
      feelDelta: -2,
      fatigueDelta: -30,
      stressDelta: -10, // ×5 = -50 stress
    },
    failure: {
      narrative: '强迫自己放松，效果一般，回来之后手感也生疏了好一阵。',
      feelDelta: -3,
      fatigueDelta: -20,
      stressDelta: -6, // ×5 = -30 stress
    },
  },
  {
    id: 'action-fitness',
    label: '健身锻炼',
    description: '力量和有氧训练，增强体能素质，训练后会有疲劳积累。',
    apCost: 25,
    eventType: 'routine',
    check: {
      primary: 'constitution',
      dc: 6,
      traitBonuses: { athletic: 2, grinder: 1 },
      traitPenalties: { fragile: 2, streamer: 1 },
    },
    success: {
      narrative: '完成了一组高质量训练，肌肉结实了不少，体能明显提升。',
      dailyGrowth: 'constitution' as StatKey,
      fatigueDelta: 18,
    },
    failure: {
      narrative: '训练过度，身体还没适应这个强度，有点吃不消。',
      fatigueDelta: 14,
    },
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
      fatigueDelta: -8,
      stressDelta: -2, // ×5 = -10 stress
    },
    failure: {
      narrative: '思绪总是飘到训练赛上，静不下来，效果打了折扣。',
      fatigueDelta: -4,
      stressDelta: -1, // ×5 = -5 stress
    },
  },
  {
    id: 'action-mental-training',
    label: '心理训练',
    description: '专项心理强化训练，提升抗压能力与心态成长，但强度较高会积累疲劳。',
    apCost: 25,
    eventType: 'training',
    check: {
      primary: 'mentality',
      dc: 7,
      traitBonuses: { steady: 2, igl: 2, grinder: 1 },
      traitPenalties: { solo: 1, obsessed: 2 },
    },
    success: {
      narrative: '高强度的压力模拟训练结束，脑子绷了一整天，但确实感觉抗压能力提升了。',
      dailyGrowth: 'mentality' as StatKey,
      fatigueDelta: 10,
      stressDelta: 1, // ×5 = +5 stress，训练本身有压力
    },
    failure: {
      narrative: '心理素质还不足以撑过这个强度的模拟，训练中途崩了，有点挫败感。',
      fatigueDelta: 8,
      stressDelta: 2, // ×5 = +10 stress
    },
  },
];

export function getAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}
