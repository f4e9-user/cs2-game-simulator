import type { Stage, StatKey, EventType } from './types';

export const STAT_LABELS: Record<StatKey, string> = {
  intelligence: '智力',
  agility: '敏捷',
  experience: '经验',
  money: '金钱',
  mentality: '心态',
  constitution: '体质',
};

export const STAT_DESCRIPTION: Record<StatKey, string> = {
  intelligence: '战术理解、应变、残局决策',
  agility: '枪法、反应、对枪能力',
  experience: '比赛经验、版本适应、大赛稳定性',
  money: '训练资源、设备、生活条件、恢复投入',
  mentality: '高压局发挥、逆风承压、舆论承受能力',
  constitution: '手腕、颈椎、肝脏—能撑多久不掉链子',
};

export const STAGE_LABELS: Record<Stage, string> = {
  rookie: '路人新人',
  youth: '青训',
  second: '二线队',
  pro: '职业队',
  star: '明星选手',
  veteran: '老将',
  retired: '退役',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  training: '训练',
  ranked: '路人局',
  team: '队内',
  tryout: '试训/转会',
  match: '正式比赛',
  media: '舆论/采访',
  life: '现实生活',
  betting: '博彩',
  cheat: '外挂风险',
  rest: '强制休养',
};

export const PASSIVE_EFFECT_LABELS: Record<string, string> = {
  'broke-mentality-drain': '破产，心态 -1',
  'stress-from-anxiety': '心态偏低，压力上升',
  'stress-decay-mentality': '心态稳定，压力下降',
  'stress-from-failure': '选择翻车，压力 +6',
  'stress-from-broke': '破产加剧，压力 +8',
  'stress-pegged-1': '压力 100 · 生涯结束',
  'stress-eased': '压力脱离崩溃区间',
  'injury-triggered': '受伤，进入强制休养期',
  'physical-collapse-rest': '身体状态崩溃，被强制休养',
  'rest-completed': '伤愈复出',
};

export const ENDING_LABELS: Record<string, string> = {
  career_ended: '职业生涯因突发事件戛然而止',
  banned_for_match_fixing: '假赛被查实，永久禁赛',
  banned_for_cheating: '外挂被查实，永久禁赛',
  stress_breakdown: '压力拉满，神经崩断，退赛离场',
  injury_ended_career: '伤病彻底毁了职业生涯',
  champion: '带着冠军戒指退役',
  retired_on_top: '选择在巅峰退役',
  legend: '登上传奇榜，被写进电竞史',
  quiet_exit: '低调退役',
};

export function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '0';
}

export const POINT_POOL = 12;
export const PER_STAT_MAX = 12;

// Derived display helpers.
export function psychologicalState(mentality: number): number {
  return mentality * 2;
}
export function physicalState(constitution: number): number {
  return constitution * 2;
}
