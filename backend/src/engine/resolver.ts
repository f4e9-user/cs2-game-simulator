import type {
  ChoiceDef,
  EventDef,
  Outcome,
  Player,
  Stage,
  StatDelta,
  Stats,
  Trait,
} from '../types.js';
import {
  BASE_STATS,
  STAGE_ORDER,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
} from './constants.js';
import { checkNaturalPromotion } from './stages.js';

export function clampStats(stats: Stats): Stats {
  const out = { ...stats };
  for (const k of STAT_KEYS) {
    out[k] = Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(out[k])));
  }
  return out;
}

// Apply a delta without any scaling — used by background bias and trait
// negatives, where the value should just land as-is.
export function applyDelta(stats: Stats, delta: StatDelta): Stats {
  const out = { ...stats };
  for (const k of STAT_KEYS) {
    const v = delta[k];
    if (typeof v === 'number') out[k] += v;
  }
  return clampStats(out);
}

// Growth curve: positive gains diminish as the stat grows.
//   scaled = base / (1 + current/10)
// Negative deltas are NOT scaled — penalties hit full force.
// Money is exempt so income/expense keeps its face value.
export function applyGrowthDelta(stats: Stats, delta: StatDelta): Stats {
  const out = { ...stats };
  for (const k of STAT_KEYS) {
    const v = delta[k];
    if (typeof v !== 'number' || v === 0) continue;
    if (v < 0 || k === 'money') {
      out[k] += v;
      continue;
    }
    const divisor = 1 + out[k] / 10;
    const scaled = v / divisor;
    // Always apply at least 1 point of growth so choices aren't reduced to noise.
    const applied = scaled >= 1 ? Math.round(scaled) : scaled > 0 ? 1 : 0;
    out[k] += applied;
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

function traitModifier(
  choice: ChoiceDef,
  playerTraitTags: Set<string>,
): number {
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

export interface ResolveInput {
  player: Player;
  event: EventDef;
  choice: ChoiceDef;
  traits: Trait[];
  rng: () => number;
}

export interface ResolveResult {
  success: boolean;
  roll: number;
  dc: number;
  chosenOutcome: Outcome;
  nextStats: Stats;
  stageAfter: Stage;
  tagsAdded: string[];
  tagsRemoved: string[];
  endRun: boolean;
  endReason?: string;
}

export function resolveChoice(input: ResolveInput): ResolveResult {
  const { player, event, choice, traits, rng } = input;
  const traitTagSet = new Set<string>(traits.flatMap((t) => t.tags));

  let success: boolean;
  let roll: number;
  let dc: number;

  if (choice.check.detection) {
    const chance = choice.check.detection.chanceByStage[player.stage] ?? 0;
    const r = rng();
    roll = Math.floor(r * 100) + 1;
    dc = Math.round(chance * 100);
    success = r >= chance;
  } else {
    const primary = player.stats[choice.check.primary];
    const secondary = choice.check.secondary
      ? player.stats[choice.check.secondary]
      : 0;

    const d20 = rollD20(rng);
    const attack =
      d20 + primary * 2 + secondary + traitModifier(choice, traitTagSet);

    dc = choice.check.dc + event.difficulty * 2 + stageModifier(player.stage);
    roll = attack;
    success = attack >= dc;
  }

  const chosenOutcome = success ? choice.success : choice.failure;
  const nextStats = applyGrowthDelta(player.stats, chosenOutcome.statChanges);

  const tagsAdded = chosenOutcome.tagAdds ?? [];
  const tagsRemoved = chosenOutcome.tagRemoves ?? [];

  let stageAfter = player.stage;
  if (chosenOutcome.stageSet) {
    // Outcome-driven set bypasses natural gates (e.g. signed contract).
    stageAfter = chosenOutcome.stageSet;
  } else if (chosenOutcome.stageDelta) {
    stageAfter = stageFromIndex(
      stageIndex(player.stage) + chosenOutcome.stageDelta,
    );
  } else {
    // Natural promotion: requires the stage gate (exp + fame/tag) to pass.
    // We use a snapshot of the player with updated stats so freshly-earned
    // experience counts toward this check.
    const probe = { ...player, stats: nextStats };
    const promo = checkNaturalPromotion(probe);
    if (promo.canPromote && promo.to) stageAfter = promo.to;
  }

  return {
    success,
    roll,
    dc,
    chosenOutcome,
    nextStats,
    stageAfter,
    tagsAdded,
    tagsRemoved,
    endRun: Boolean(chosenOutcome.endRun),
    endReason: chosenOutcome.endReason,
  };
}
