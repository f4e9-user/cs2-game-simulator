import type { Stage, StatKey, Stats } from '../types.js';

export const STAT_KEYS: StatKey[] = [
  'intelligence',
  'agility',
  'experience',
  'money',
  'mentality',
  'constitution',
];

// 核心属性 key（money 单独处理，不计入成长系统）
export const CORE_STAT_KEYS: StatKey[] = [
  'intelligence',
  'agility',
  'experience',
  'mentality',
  'constitution',
];

export const STAT_LABELS: Record<StatKey, string> = {
  intelligence: '智力',
  agility: '敏捷',
  experience: '经验',
  money: '资金',
  mentality: '心态',
  constitution: '体能',
};

export const STAGE_ORDER: Stage[] = [
  'rookie',
  'youth',
  'second',
  'pro',
  'star',
  'veteran',
  'retired',
];

export const STAGE_LABELS: Record<Stage, string> = {
  rookie: '路人新人',
  youth: '青训',
  second: '二线队',
  pro: '职业队',
  star: '明星选手',
  veteran: '老将',
  retired: '退役',
};

export const BASE_STATS: Stats = {
  intelligence: 0,
  agility: 0,
  experience: 0,
  money: 0,
  mentality: 0,
  constitution: 3, // 基础体能底线：所有人都有基本的身体素质，不花属性点
};

export const POINT_POOL = 12;
export const PER_STAT_MAX = 12;
export const STAT_MIN = 0;
export const STAT_MAX = 20;

// ── 成长系统 ──────────────────────────────────────────────────
// 生涯总成长上限（money 不计入）
export const GROWTH_CAP = 30;

// 队友成长上限（低于玩家的 30，队友成长空间略小）
export const TEAMMATE_GROWTH_CAP = 20;

// 成长曲线：属性越高，成长越慢
export function growthFactor(level: number): number {
  if (level < 5) return 1.0;
  if (level < 10) return 0.7;
  if (level < 15) return 0.4;
  return 0.15;
}

// 每日行动基础成长范围（由 resolver 在 [min, max] 内随机）
export const DAILY_GROWTH_MIN = 0.1;
export const DAILY_GROWTH_MAX = 0.3;

// 普通叙事事件对 experience 的微小成长（每 1 点旧版 delta → 0.04 增长）
export const EVENT_EXP_GROWTH_PER_DELTA = 0.04;

// ── 状态系统 ──────────────────────────────────────────────────
export const FEEL_MIN = -3;
export const FEEL_MAX = 3;
export const TILT_MIN = 0;
export const TILT_MAX = 3;
export const FATIGUE_MIN = 0;
export const FATIGUE_MAX = 100;

// ── 压力系统 ──────────────────────────────────────────────────
export const STRESS_MIN = 0;
export const STRESS_MAX = 100;
export const FAME_MIN = 0;
export const FAME_MAX = 100;

// 压力挂满后多少回合崩溃（3 = 撑满三轮再终结）
export const STRESS_GRACE_ROUNDS = 3;

// 心态对每回合压力的被动影响（基于 0-20 心态值）
export function passiveStressFromMentality(mentality: number): number {
  if (mentality >= 14) return -8;
  if (mentality >= 10) return -5;
  if (mentality >= 6) return -2;
  if (mentality <= 2) return 8;
  if (mentality <= 4) return 4;
  return 0;
}

// 疲劳超过阈值时，压力增益被放大
export const FATIGUE_STRESS_THRESHOLD = 70;
export const FATIGUE_STRESS_MULTIPLIER = 1.4;

// 失败时没有显式 stressDelta 的默认压力增量（提高至 12）
export const IMPLICIT_FAILURE_STRESS = 12;

// 旧版事件 stressDelta 的倍率（旧版基于 0-20 scale，×5 映射到 0-100）
export const STRESS_SCALE = 5;

// 破产时心态减损
export const BROKE_MENTALITY_DRAIN = 1;

// 体能崩溃（constitution ≤ 这个值 → 强制休养）
export const CONSTITUTION_COLLAPSE = -2;
export const INJURY_REST_ROUNDS = 2;

// ── 游戏周期 ──────────────────────────────────────────────────
export const MAX_ROUNDS = 576; // 12年 × 48周，约16岁入行到28岁退役
export const WEEKS_PER_YEAR = 48;

// ── 名气阈值 ──────────────────────────────────────────────────
export const LEGEND_FAME_THRESHOLD = 70;

// 旧版使用（保留避免引用断裂）
export const STRESS_BREAKDOWN = STRESS_MAX;
export const STRESS_DECAY_THRESHOLD = 6;

// ── 历史遗留（旧版晋级体系，已替换为赛事记录晋级）─────────────
export const STAGE_PROMOTION_EXPERIENCE: Record<Stage, number> = {
  rookie: 6,
  youth: 10,
  second: 14,
  pro: 18,
  star: 20,
  veteran: 20,
  retired: 999,
};
