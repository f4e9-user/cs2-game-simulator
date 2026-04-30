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
    description: '轻度放松，恢复体力和手感，缓解压力。',
    apCost: 25,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 5,
      traitBonuses: { steady: 2 },
      traitPenalties: { grinder: 1, obsessed: 1 },
    },
    success: {
      narrative: '好好睡了一觉，整个人状态好多了。',
      feelDelta: 1,
      fatigueDelta: -20,
      stressDelta: -1,
    },
    failure: {
      narrative: '睡不踏实，脑子里还是那几局的画面。',
      fatigueDelta: -10,
    },
  },
  {
    id: 'action-vacation',
    label: '度假断网',
    description: '彻底离开电脑，大幅恢复疲劳和压力，手感会生疏。',
    apCost: 25,
    eventType: 'routine',
    check: {
      primary: 'mentality',
      dc: 1,
    },
    success: {
      narrative: '三天没碰键盘，身体完全放松下来。',
      feelDelta: -1,
      fatigueDelta: -30,
      stressDelta: -10, // ×5 = -50 stress
    },
    failure: {
      narrative: '强迫自己放松，但效果一般。',
      fatigueDelta: -20,
      stressDelta: -6, // ×5 = -30 stress
    },
  },
];

export function getAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}
