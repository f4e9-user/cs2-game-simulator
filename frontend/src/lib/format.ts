import type { Buff, DerivedStats, Stage, StatKey, Stats, EventType, VolatileState } from './types';

// ── 核心属性标签 ──────────────────────────────────────────────
export const STAT_LABELS: Record<StatKey, string> = {
  intelligence: '智力',
  agility: '敏捷',
  experience: '经验',
  money: '资金',
  mentality: '心态',
  constitution: '体能',
};

export const STAT_DESCRIPTION: Record<StatKey, string> = {
  intelligence: '战术理解、应变、残局决策',
  agility: '枪法底子、反应速度、对枪能力',
  experience: '比赛阅历、版本适应、大赛稳定性',
  money: '训练资源、设备条件、生活水平',
  mentality: '高压局发挥、逆风承压、舆论承受',
  constitution: '手腕、颈椎、体能储备——能撑多久',
};

// ── 派生属性标签（展示用）────────────────────────────────────
export const DERIVED_LABELS: Record<keyof DerivedStats, string> = {
  aim: '枪法',
  gameSense: '决策',
  stability: '稳定性',
  stamina: '续航',
};

export const DERIVED_ICONS: Record<keyof DerivedStats, string> = {
  aim: '🎯',
  gameSense: '🧠',
  stability: '🧘',
  stamina: '💪',
};

// ── 派生属性计算 ──────────────────────────────────────────────
// 注意：经验是"修正项"，不能主导（权重 0.3）
export function computeDerivedStats(stats: Stats): DerivedStats {
  const aimRaw = stats.agility * 0.7 + stats.experience * 0.3;
  const gsRaw = stats.intelligence * 0.7 + stats.experience * 0.3;
  return {
    aim: Math.round((aimRaw / 20) * 100),
    gameSense: Math.round((gsRaw / 20) * 100),
    stability: Math.round((stats.mentality / 20) * 100),
    stamina: Math.round((stats.constitution / 20) * 100),
  };
}

// ── 状态系统展示 ──────────────────────────────────────────────
export function feelLabel(feel: number): string {
  if (feel >= 2.5) return '手感爆炸 🔥';
  if (feel >= 1.5) return '手感在线';
  if (feel >= 0.5) return '状态不错';
  if (feel >= -0.5) return '正常发挥';
  if (feel >= -1.5) return '手感偏冷';
  if (feel >= -2.5) return '手感欠佳';
  return '状态极差 🧊';
}

export function tiltLabel(tilt: number): string {
  if (tilt <= 0) return '心态稳定';
  if (tilt === 1) return '轻微波动';
  if (tilt === 2) return '心态不稳';
  return '崩盘预警 ⚠️';
}

export function feelColorClass(feel: number): string {
  if (feel >= 1) return 'feel-hot';
  if (feel <= -1) return 'feel-cold';
  return 'feel-neutral';
}

export function tiltColorClass(tilt: number): string {
  if (tilt >= 3) return 'tilt-danger';
  if (tilt >= 2) return 'tilt-warn';
  return '';
}

// ── 进度条显示（████████░░ 风格）────────────────────────────
export function scoreBar(score: number, bars = 10): string {
  const filled = Math.round((score / 100) * bars);
  return '█'.repeat(filled) + '░'.repeat(bars - filled);
}

// ── 阶段标签 ─────────────────────────────────────────────────
export const STAGE_LABELS: Record<Stage, string> = {
  rookie: '路人新人',
  youth: '青训',
  second: '二线队',
  pro: '职业队',
  retired: '退役',
};

// ── 事件类型标签 ──────────────────────────────────────────────
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
  routine: '每日行动',
};

// ── 被动效果标签 ──────────────────────────────────────────────
export const PASSIVE_EFFECT_LABELS: Record<string, string> = {
  'broke-mentality-drain': '资金见底，心态 -1',
  'stress-from-anxiety': '心态偏低，压力上升',
  'stress-decay-mentality': '心态稳定，压力下降',
  'stress-from-failure': '选择翻车，压力 +12',
  'stress-from-broke': '破产加剧，压力 +8',
  'stress-pegged-1': '压力 100 · 即将崩溃',
  'stress-eased': '压力脱离崩溃区间',
  'injury-triggered': '受伤，进入强制休养期',
  'physical-collapse-rest': '体能崩溃，强制休养',
  'rest-completed': '伤愈复出',
  'critical-success-bonus': '天选之刻！手感 +1，压力 -5',
  'critical-failure-penalty': '手滑崩盘…手感 -1，压力 +10',
};

// ── 生涯结局标签 ──────────────────────────────────────────────
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
  'free-agent-legend': '草根传奇——从未签约战队，靠开放赛事打出一片天',
  'loyal-veteran': '忠臣老将——数百回合始终如一，与战队共进退',
};

// ── RPG 描述性变化标签 ────────────────────────────────────────

export function describeFeelChange(delta: number): string {
  const abs = Math.abs(delta);
  if (delta > 0) {
    if (abs <= 0.5) return '手感微热';
    if (abs <= 1.5) return '手感回升';
    return '手感火热';
  }
  if (abs <= 0.5) return '手感微冷';
  if (abs <= 1.5) return '手感下滑';
  return '手感冰冷';
}

export function describeTiltChange(delta: number): string {
  const abs = Math.abs(delta);
  if (delta > 0) return abs <= 1 ? '心态轻微波动' : '心态明显恶化';
  return abs <= 1 ? '心态趋于稳定' : '心态明显改善';
}

export function describeFatigueChange(delta: number): string {
  const abs = Math.abs(delta);
  if (delta > 0) {
    if (abs <= 10) return '略感疲倦';
    if (abs <= 20) return '疲劳积累';
    if (abs <= 30) return '明显疲惫';
    return '极度消耗';
  }
  if (abs <= 15) return '稍作恢复';
  if (abs <= 30) return '得到休息';
  if (abs <= 45) return '充分休息';
  return '彻底恢复';
}

export function describeStressChange(delta: number): string {
  const abs = Math.abs(delta);
  if (delta > 0) {
    if (abs <= 5) return '压力微增';
    if (abs <= 12) return '压力上升';
    if (abs <= 20) return '压力明显上升';
    return '压力大幅上升';
  }
  if (abs <= 3) return '压力微降';
  if (abs <= 8) return '压力缓解';
  return '压力大幅缓解';
}

export function describeFameChange(delta: number): string {
  const abs = Math.abs(delta);
  if (delta > 0) {
    if (abs <= 2) return '名气略增';
    if (abs <= 5) return '名气提升';
    return '名气大涨';
  }
  return abs <= 2 ? '名气微降' : '名气受损';
}

const STAT_GROWTH_NAMES: Record<StatKey, string> = {
  intelligence: '战术意识',
  agility: '枪法底子',
  experience: '比赛经验',
  money: '资金',
  mentality: '心理素质',
  constitution: '身体状态',
};

export function formatMoney(points: number): string {
  return `${Math.round(points)}K`;
}

export function describeStatChange(key: StatKey, delta: number): string {
  if (key === 'money') {
    const k = Math.round(Math.abs(delta));
    return delta > 0 ? `获得 ${k}K` : `花费 ${k}K`;
  }
  const name = STAT_GROWTH_NAMES[key];
  const dir = delta > 0 ? '提升' : '下降';
  const abs = Math.abs(delta);
  if (abs < 0.08) return `${name}微量${dir}`;
  if (abs < 0.18) return `${name}轻微${dir}`;
  if (abs < 0.26) return `${name}稳步${dir}`;
  return `${name}显著${dir}`;
}

// ── 赛事奖励描述（报名前展示，量纲不同）────────────────────────

export function describeTournamentMoney(v: number): string {
  return `奖金 ${v}K`;
}

export function describeTournamentExp(v: number): string {
  if (v <= 3) return '少量经验';
  if (v <= 5) return '一定经验';
  return '丰富经验';
}

export function describeTournamentFame(v: number): string {
  if (v <= 3) return '小幅曝光';
  if (v <= 8) return '一定声望';
  if (v <= 15) return '显著声望';
  return '大幅声望';
}

export function describeTournamentStress(v: number): string {
  if (v <= 1) return '轻微压力';
  if (v <= 2) return '一定压力';
  if (v <= 3) return '较高压力';
  return '极高压力';
}

export function describeBuffAdded(buff: Buff): string {
  const target = buff.growthKey ? STAT_GROWTH_NAMES[buff.growthKey] : '成长';
  const pct = Math.round((buff.multiplier - 1) * 100);
  return `获得「${buff.label}」· ${target}效率 +${pct}% (${buff.remainingUses}次)`;
}

export function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10; // 保留1位小数
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `${rounded}`;
  return '0';
}

export const POINT_POOL = 12;
export const PER_STAT_MAX = 12;

// 旧版辅助（保留兼容性）
export function psychologicalState(mentality: number): number {
  return Math.round((mentality / 20) * 100);
}
export function physicalState(constitution: number): number {
  return Math.round((constitution / 20) * 100);
}

// HUD stat labels (旧版兼容)
export const HUD_STAT_LABELS: Record<StatKey, string> = {
  intelligence: '战术',
  agility: '手感底子',
  experience: '经验',
  money: '资金',
  mentality: '心态',
  constitution: '体能',
};
