import type {
  Buff,
  ChoiceDef,
  ClubTier,
  EventDef,
  Outcome,
  CoreStatDelta,
  EffectDelta,
  ProgressionDelta,
  ResourceDelta,
  StateDelta,
  TagDelta,
  Player,
  Stage,
  StatDelta,
  StatKey,
  Stats,
  Trait,
} from '../types.js';
import {
  BASE_STATS,
  CORE_STAT_KEYS,
  DAILY_GROWTH_MAX,
  DAILY_GROWTH_MIN,
  EVENT_EXP_GROWTH_PER_DELTA,
  EXPERIENCE_SOFT_CAP,
  FEEL_MAX,
  FEEL_MIN,
  FATIGUE_MAX,
  FATIGUE_MIN,
  GROWTH_CAP,
  MONEY_MAX,
  STAGE_ORDER,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  TILT_MAX,
  TILT_MIN,
  growthFactor,
} from './constants.js';
import { scaleGrowthByAge } from './age.js';
import { applyMoneyDeltaToStats } from './money.js';

export function outcomeCoreGrowth(outcome: Outcome): CoreStatDelta | undefined {
  return outcome.coreGrowth;
}

export function outcomeStateDelta(outcome: Outcome): Required<StateDelta> {
  return {
    feel: outcome.stateDelta?.feel ?? 0,
    tilt: outcome.stateDelta?.tilt ?? 0,
    fatigue: outcome.stateDelta?.fatigue ?? 0,
    stress: outcome.stateDelta?.stress ?? 0,
  };
}

export function outcomeResourceDelta(outcome: Outcome): Required<ResourceDelta> {
  return {
    money: outcome.resourceDelta?.money ?? 0,
    fame: outcome.resourceDelta?.fame ?? 0,
    points: outcome.resourceDelta?.points ?? 0,
    actionPoints: outcome.resourceDelta?.actionPoints ?? 0,
  };
}

export function outcomeProgression(outcome: Outcome): ProgressionDelta {
  return {
    stageSet: outcome.progression?.stageSet,
    stageDelta: outcome.progression?.stageDelta,
    teamTierSet: outcome.progression?.teamTierSet,
    injuryRestRounds: outcome.progression?.injuryRestRounds,
    endRun: outcome.progression?.endRun,
    endReason: outcome.progression?.endReason,
  };
}

export function outcomeTags(outcome: Outcome): Required<TagDelta> {
  return {
    add: outcome.tags?.add ?? [],
    remove: outcome.tags?.remove ?? [],
    cooldowns: outcome.tags?.cooldowns ?? {},
  };
}

export function outcomeEffects(outcome: Outcome): EffectDelta {
  return {
    buffAdd: outcome.effects?.buffAdd,
    buffRemoveId: outcome.effects?.buffRemoveId,
    teamTrustDelta: outcome.effects?.teamTrustDelta,
    teamChemistryDelta: outcome.effects?.teamChemistryDelta,
    targetTeammateChemistryDelta: outcome.effects?.targetTeammateChemistryDelta,
    targetIdentity: outcome.effects?.targetIdentity,
    opposingTargetTeammateChemistryDelta: outcome.effects?.opposingTargetTeammateChemistryDelta,
    opposingTargetIdentity: outcome.effects?.opposingTargetIdentity,
  };
}

export function clampStats(stats: Stats): Stats {
  const out = { ...stats };
  for (const k of STAT_KEYS) {
    const cap = k === 'money' ? MONEY_MAX : STAT_MAX;
    out[k] = Math.max(STAT_MIN, Math.min(cap, out[k]));
  }
  return out;
}

// 应用静态 delta（不走成长曲线，用于背景加成、特质负面）
export function applyDelta(stats: Stats, delta: StatDelta): Stats {
  const out = { ...stats };
  for (const k of STAT_KEYS) {
    if (k === 'money') continue;
    const v = delta[k];
    if (typeof v === 'number') out[k] += v;
  }
  return clampStats(out);
}

export function emptyStats(): Stats {
  return { ...BASE_STATS };
}

export function rollD20(rng: () => number): number {
  return 1 + Math.floor(rng() * 20);
}

export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function stageFromIndex(i: number): Stage {
  const clamped = Math.max(0, Math.min(STAGE_ORDER.length - 1, i));
  return STAGE_ORDER[clamped] as Stage;
}

// ── 成长系统 ──────────────────────────────────────────────────
// 对核心属性进行一次成长应用，返回实际成长量和更新后的 stats
export function applyGrowth(
  stats: Stats,
  growthKey: StatKey,
  rawAmount: number,
  growthSpent: number,
  buffs: Buff[],
  actionTag: string,
  age?: number,
): { stats: Stats; grown: number } {
  const remainingCap = Math.max(0, GROWTH_CAP - growthSpent);
  if (remainingCap <= 0 || !CORE_STAT_KEYS.includes(growthKey)) {
    return { stats, grown: 0 };
  }
  const coreGrowthKey = growthKey as Exclude<StatKey, 'money'>;

  // 应用 buff 倍率
  const multiplier = buffs
    .filter((b) => (b.actionTag === 'all' || b.actionTag === actionTag) && (!b.growthKey || b.growthKey === growthKey))
    .reduce((acc, b) => acc * (b.growthMultiplier ?? b.multiplier ?? 1), 1);

  const current = stats[growthKey];
  const factor = growthFactor(current);
  const ageScaledRawAmount = typeof age === 'number' ? scaleGrowthByAge(coreGrowthKey, rawAmount, age) : rawAmount;
  const applied = Math.min(ageScaledRawAmount * factor * multiplier, remainingCap, STAT_MAX - current);
  if (applied <= 0) return { stats, grown: 0 };

  const newStats = { ...stats };
  newStats[growthKey] = Math.round((current + applied) * 1000) / 1000; // preserve fraction
  return { stats: clampStats(newStats), grown: applied };
}

export function applyCareerExperienceGrowth(
  stats: Stats,
  rawAmount: number,
  age?: number,
): { stats: Stats; grown: number } {
  if (rawAmount <= 0) return { stats, grown: 0 };
  const ageScaledRawAmount = typeof age === 'number' ? scaleGrowthByAge('experience', rawAmount, age) : rawAmount;
  const current = stats.experience ?? 0;
  const factor =
    current < 5 ? 1 :
    current < 10 ? 0.75 :
    current < 15 ? 0.45 :
    current < EXPERIENCE_SOFT_CAP ? 0.25 :
    0.1;
  const applied = Math.min(ageScaledRawAmount * factor, STAT_MAX - current);
  if (applied <= 0) return { stats, grown: 0 };
  const next = {
    ...stats,
    experience: Math.round((current + applied) * 1000) / 1000,
  };
  return { stats: clampStats(next), grown: applied };
}

// ── 旧版 statDelta → 状态效果转译 ────────────────────────────
// 叙事事件的 statChanges 不再直接修改核心属性，
// 而是转为手感/心态波动/疲劳等状态变化。
// 只有 experience 可以有极小的核心成长（它是"修正项"）。
export interface TranslatedDelta {
  feelDelta: number;
  tiltDelta: number;
  fatigueDelta: number;
  expGrowth: number; // 极小的 experience 核心成长（需再过成长因子+上限）
}

export function translateStatDelta(delta: StatDelta): TranslatedDelta {
  let feelDelta = 0;
  let tiltDelta = 0;
  let fatigueDelta = 0;
  let expGrowth = 0;

  for (const [k, v] of Object.entries(delta) as [StatKey, number][]) {
    if (!v) continue;
    switch (k) {
      case 'agility':
        // 敏捷正向 → 手感提升；负向 → 手感下降
        feelDelta += v > 0 ? Math.min(v * 0.6, 2) : Math.max(v * 0.6, -2);
        break;
      case 'intelligence':
        // 智力正向 → 小幅手感提升（战术领悟）；负向 → 轻微下降
        feelDelta += v > 0 ? Math.min(v * 0.4, 1) : Math.max(v * 0.4, -1);
        break;
      case 'experience':
        // 经验是唯一可以从叙事事件获得极小核心成长的属性
        expGrowth += v * EVENT_EXP_GROWTH_PER_DELTA;
        break;
      case 'mentality':
        // 心态正向 → 手感 + 可能降 tilt；负向 → tilt 升 + 手感降
        feelDelta += v > 0 ? Math.min(v * 0.5, 1.5) : Math.max(v * 0.5, -1.5);
        if (v <= -2) tiltDelta += 1;
        else if (v >= 3) tiltDelta = Math.max(tiltDelta - 1, 0);
        break;
      case 'constitution':
        // 体能负向 → 疲劳增加；正向 → 疲劳轻微恢复
        fatigueDelta += v < 0 ? Math.abs(v) * 8 : -(v * 4);
        break;
    }
  }

  return { feelDelta, tiltDelta, fatigueDelta, expGrowth };
}

// ── Trait modifier 计算 ───────────────────────────────────────
function traitModifier(choice: ChoiceDef, playerTraitTags: Set<string>): number {
  let bonus = 0;
  const { traitBonuses, traitPenalties } = choice.check;
  if (traitBonuses) {
    for (const [tag, value] of Object.entries(traitBonuses)) {
      if (playerTraitTags.has(tag)) bonus += value;
    }
  }
  if (traitPenalties) {
    for (const [tag, value] of Object.entries(traitPenalties)) {
      if (playerTraitTags.has(tag)) bonus -= value;
    }
  }
  return bonus;
}

function stageModifier(stage: Stage): number {
  return Math.floor(stageIndex(stage) / 2);
}

// ── 主解析接口 ────────────────────────────────────────────────

// 非线性属性加成：stat=10 时与原线性公式等值，高属性区间递减回报
// statBonus(10, 2) = sqrt(100)*2 = 20  （原：10*2 = 20，相同）
// statBonus(20, 2) = sqrt(200)*2 ≈ 28  （原：20*2 = 40，高属性封顶效果）
function statBonus(stat: number, coefficient: number): number {
  return Math.round(Math.sqrt(Math.max(0, stat) * 10) * coefficient);
}

// 侦测检定转 DC（保持平均属性时与原概率一致）
// dc = 9 + chanceByStage * 20，d20+stats(coeff 0.5/0.25) 攻击
function detectionDC(chance: number): number {
  return Math.round(9 + chance * 20);
}

export type ResultTier = 'critical_success' | 'success' | 'failure' | 'critical_failure';

export interface ResolveInput {
  player: Player;
  event: EventDef;
  choice: ChoiceDef;
  traits: Trait[];
  rng: () => number;
  rollBonus?: number;
}

export interface ResolveResult {
  success: boolean;
  resultTier: ResultTier;
  roll: number;
  dc: number;
  naturalRoll: number;
  chosenOutcome: Outcome;
  nextStats: Stats;
  stageAfter: Stage;
  teamTierSet?: ClubTier;
  tagsAdded: string[];
  tagsRemoved: string[];
  endRun: boolean;
  endReason?: string;
  // 状态变化
  feelDelta: number;
  tiltDelta: number;
  fatigueDelta: number;
  moneyDelta: number;
  // 核心成长（极小）
  growthApplied: number;
  growthKey?: StatKey;
}

export function resolveChoice(input: ResolveInput): ResolveResult {
  const { player, event, choice, traits, rng } = input;
  const traitTagSet = new Set<string>(traits.flatMap((t) => t.tags));

  let success: boolean;
  let resultTier: ResultTier;
  let roll: number;
  let dc: number;
  let naturalRoll: number;

  if (choice.check.detection) {
    // 侦测检定：统一进 d20+属性 框架（智力 + 心态*0.5）
    // 低系数确保属性有影响但不压制随机性
    const chance = choice.check.detection.chanceByStage[player.stage] ?? 0;
    const intel = player.stats.intelligence;
    const mental = player.stats.mentality;
    const d20 = rollD20(rng);
    naturalRoll = d20;
    const attack = d20 + statBonus(intel, 0.5) + statBonus(mental, 0.25) + (input.rollBonus ?? 0);
    dc = detectionDC(chance);
    roll = attack;

    if (d20 === 20) {
      resultTier = 'critical_success';
      success = true;
    } else if (d20 === 1) {
      resultTier = 'critical_failure';
      success = false;
    } else {
      success = attack >= dc;
      resultTier = success ? 'success' : 'failure';
    }
  } else {
    const primaryKey = choice.check.primary;
    // money 不是核心属性，用 money / 2 近似（0-20 scale）
    const primary =
      primaryKey === 'money' ? Math.round(player.stats.money / 2) : player.stats[primaryKey];

    const secondaryKey = choice.check.secondary;
    const secondary = secondaryKey
      ? secondaryKey === 'money'
        ? Math.round(player.stats.money / 2)
        : player.stats[secondaryKey]
      : 0;

    // 手感修正：feel -3~+3 直接加入攻击值，代表临场状态对判定的影响
    const feelBonus = Math.round(player.volatile?.feel ?? 0);

    const d20 = rollD20(rng);
    naturalRoll = d20;
    const attack = d20
      + statBonus(primary, 2)
      + statBonus(secondary, 1)
      + traitModifier(choice, traitTagSet)
      + feelBonus
      + (input.rollBonus ?? 0);
    dc = choice.check.dc + event.difficulty * 2 + stageModifier(player.stage);
    roll = attack;

    if (d20 === 20) {
      resultTier = 'critical_success';
      success = true;
    } else if (d20 === 1) {
      resultTier = 'critical_failure';
      success = false;
    } else {
      success = attack >= dc;
      resultTier = success ? 'success' : 'failure';
    }
  }

  const chosenOutcome = success ? choice.success : choice.failure;

  // ── 状态变化 ──
  const stateDelta = outcomeStateDelta(chosenOutcome);
  let feelDelta = stateDelta.feel;
  let tiltDelta = stateDelta.tilt;
  let fatigueDelta = stateDelta.fatigue;
  const coreGrowth = outcomeCoreGrowth(chosenOutcome);
  const translatedStatChanges = coreGrowth
    ? translateStatDelta(coreGrowth)
    : null;
  if (translatedStatChanges) {
    feelDelta += translatedStatChanges.feelDelta;
    tiltDelta += translatedStatChanges.tiltDelta;
    fatigueDelta += translatedStatChanges.fatigueDelta;
  }
  const resourceDelta = outcomeResourceDelta(chosenOutcome);
  let moneyDelta = resourceDelta.money;

  // ── 核心成长 ──
  let nextStats = { ...player.stats };
  // money 变化直接写入 stats.money
  nextStats = applyMoneyDeltaToStats(nextStats, moneyDelta);

  let growthApplied = 0;
  let growthKey: StatKey | undefined;

  if (chosenOutcome.dailyGrowth) {
    // 每日行动：随机成长量 [DAILY_GROWTH_MIN, DAILY_GROWTH_MAX]
    const rawGrowth = DAILY_GROWTH_MIN + rng() * (DAILY_GROWTH_MAX - DAILY_GROWTH_MIN);
    const result = applyGrowth(
      nextStats,
      chosenOutcome.dailyGrowth,
      rawGrowth,
      player.growthSpent,
      player.buffs,
      event.type,
      player.age,
    );
    nextStats = result.stats;
    growthApplied = result.grown;
    growthKey = chosenOutcome.dailyGrowth;
  }

  nextStats = clampStats(nextStats);

  // ── Stage 变化 ──
  const progression = outcomeProgression(chosenOutcome);
  let stageAfter = player.stage;
  if (progression.stageSet) {
    stageAfter = progression.stageSet;
  } else if (progression.stageDelta) {
    stageAfter = stageFromIndex(stageIndex(player.stage) + progression.stageDelta);
  }

  const tagDelta = outcomeTags(chosenOutcome);
  const tagsAdded = tagDelta.add;
  const tagsRemoved = tagDelta.remove;

  return {
    success,
    resultTier,
    roll,
    dc,
    naturalRoll,
    chosenOutcome,
    nextStats,
    stageAfter,
    teamTierSet: progression.teamTierSet,
    tagsAdded,
    tagsRemoved,
    endRun: Boolean(progression.endRun),
    endReason: progression.endReason,
    feelDelta,
    tiltDelta,
    fatigueDelta,
    moneyDelta,
    growthApplied,
    growthKey,
  };
}
