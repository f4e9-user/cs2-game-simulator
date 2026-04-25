import type { Stage, Stats, StatKey } from '../types.js';

export const STAT_KEYS: StatKey[] = [
  'intelligence',
  'agility',
  'experience',
  'money',
  'mentality',
  'constitution',
];

export const STAT_LABELS: Record<StatKey, string> = {
  intelligence: '智力',
  agility: '敏捷',
  experience: '经验',
  money: '金钱',
  mentality: '心态',
  constitution: '体质',
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
  constitution: 0,
};

// Bumped to 12 because we now have 6 stats — average 2 per stat keeps the
// allocation feel intact. Each stat max is still floor + POINT_POOL.
export const POINT_POOL = 12;
export const PER_STAT_MAX = 12;

export const STAT_MIN = 0;
export const STAT_MAX = 20;

// Natural promotion thresholds on `experience`.
export const STAGE_PROMOTION_EXPERIENCE: Record<Stage, number> = {
  rookie: 6,
  youth: 10,
  second: 14,
  pro: 18,
  star: 20,
  veteran: 20,
  retired: 999,
};

export const BROKE_MENTALITY_DRAIN = 1;
// Each round = 1 in-game week. 80 weeks ≈ 1.5 years — short but complete arc.
export const MAX_ROUNDS = 80;
export const WEEKS_PER_YEAR = 48;

// Dynamic state bounds.
export const STRESS_MIN = 0;
export const STRESS_MAX = 100;
export const FAME_MIN = 0;
export const FAME_MAX = 100;

// Stress is the fatal stat. Pegged at MAX → game over immediately (no grace).
// Mentality modulates how fast it accumulates / decays each round.
export const STRESS_GRACE_ROUNDS = 1;

// Mentality → passive stress delta each round. Rescaled for 0-100 stress.
//   mentality >= 7  : stress -6 (calm)
//   mentality >= 4  : stress -3 (mild decay)
//   mentality <= 2  : stress +4 (anxious)
//   mentality <= 0  : stress +8 (panic)
export function passiveStressFromMentality(mentality: number): number {
  if (mentality >= 7) return -6;
  if (mentality >= 4) return -3;
  if (mentality <= 0) return 8;
  if (mentality <= 2) return 4;
  return 0;
}

// Failure outcomes on events that don't explicitly set stressDelta still
// add this baseline amount — so every negative choice costs stress.
export const IMPLICIT_FAILURE_STRESS = 6;

// Rescale factor applied at runtime to event-declared stressDelta values.
// Events were originally tuned for a 0-20 scale; we multiply by 5 to fit 0-100.
export const STRESS_SCALE = 5;

// Injury & rest.
// When constitution drops to this level (physical = constitution*2 <= 0),
// the player is forced into rest events for INJURY_REST_ROUNDS rounds.
export const CONSTITUTION_COLLAPSE = 0;
export const INJURY_REST_ROUNDS = 2;

// Stress thresholds.
export const STRESS_BREAKDOWN = STRESS_MAX;  // stress pegged → breakdown ending
export const STRESS_DECAY_THRESHOLD = 6;     // mentality >= this → -1 stress each round

// Fame thresholds for the "legend" ending at MAX_ROUNDS.
export const LEGEND_FAME_THRESHOLD = 30;
