import { getTrait } from '../data/traits.js';
import type { Buff, Player } from '../types.js';
import {
  FATIGUE_DELTA_FLOOR_EVENT,
  FATIGUE_DELTA_FLOOR_MATCH,
  FATIGUE_DELTA_FLOOR_ROUTINE,
  FATIGUE_STRESS_MULTIPLIER,
  FATIGUE_STRESS_THRESHOLD,
  STRESS_DELTA_FLOOR_EVENT,
  STRESS_DELTA_FLOOR_ROUTINE,
  fatigueMult,
  stressMult,
} from './constants.js';

export type StateModifierSource = 'event' | 'routine' | 'match' | 'shop';

export interface StateModifierContext {
  actionTag: string;
  source: StateModifierSource;
}

export interface StateModifierResult {
  fatigueDelta: number;
  stressDelta: number;
  fatigueApplied: boolean;
  stressApplied: boolean;
  fatigueReduced: boolean;
  stressReduced: boolean;
  passiveEffects: string[];
}

export interface BuffConsumeTrigger {
  growthApplied?: boolean;
  growthKey?: string;
  fatigueApplied?: boolean;
  stressApplied?: boolean;
  fatigueReduced?: boolean;
  stressReduced?: boolean;
}

const TRAIT_STATE_MULTIPLIERS: Record<string, {
  fatigueGainMultiplier?: number;
  stressGainMultiplier?: number;
}> = {
  athletic: { fatigueGainMultiplier: 0.9 },
  fragile: { fatigueGainMultiplier: 1.2, stressGainMultiplier: 1.1 },
  obsessed: { fatigueGainMultiplier: 1.1, stressGainMultiplier: 1.05 },
  grinder: { fatigueGainMultiplier: 1.05 },
  steady: { stressGainMultiplier: 0.9 },
  clutch: { stressGainMultiplier: 0.9 },
  volatile: { stressGainMultiplier: 1.15 },
};

function buffMatches(buff: Buff, context: StateModifierContext): boolean {
  return buff.actionTag === 'all' || buff.actionTag === context.actionTag;
}

function playerTraitTags(player: Player): Set<string> {
  const tags = new Set<string>();
  for (const id of player.traits ?? []) {
    const trait = getTrait(id);
    for (const tag of trait?.tags ?? []) tags.add(tag);
  }
  return tags;
}

function traitFatigueMultiplier(player: Player): number {
  let multiplier = 1;
  for (const tag of playerTraitTags(player)) {
    multiplier *= TRAIT_STATE_MULTIPLIERS[tag]?.fatigueGainMultiplier ?? 1;
  }
  return multiplier;
}

function traitStressMultiplier(player: Player): number {
  let multiplier = 1;
  for (const tag of playerTraitTags(player)) {
    multiplier *= TRAIT_STATE_MULTIPLIERS[tag]?.stressGainMultiplier ?? 1;
  }
  return multiplier;
}

function buffFatigueMultiplier(buffs: Buff[], context: StateModifierContext): number {
  return buffs
    .filter((buff) => buffMatches(buff, context))
    .reduce((acc, buff) => acc * (buff.fatigueGainMultiplier ?? 1), 1);
}

function buffStressMultiplier(buffs: Buff[], context: StateModifierContext): number {
  return buffs
    .filter((buff) => buffMatches(buff, context))
    .reduce((acc, buff) => acc * (buff.stressGainMultiplier ?? 1), 1);
}

function fatigueFloor(source: StateModifierSource): number {
  if (source === 'routine') return FATIGUE_DELTA_FLOOR_ROUTINE;
  if (source === 'match') return FATIGUE_DELTA_FLOOR_MATCH;
  return FATIGUE_DELTA_FLOOR_EVENT;
}

function stressFloor(source: StateModifierSource): number {
  return source === 'routine' ? STRESS_DELTA_FLOOR_ROUTINE : STRESS_DELTA_FLOOR_EVENT;
}

export function applyStateDeltaModifiers(
  player: Player,
  input: { fatigueDelta: number; stressDelta: number },
  context: StateModifierContext,
): StateModifierResult {
  const buffs = player.buffs ?? [];
  const passiveEffects: string[] = [];

  let fatigueDelta = input.fatigueDelta;
  let fatigueReduced = false;
  if (fatigueDelta > 0) {
    const base = fatigueDelta;
    const multiplier =
      fatigueMult(player.stats.constitution) *
      traitFatigueMultiplier(player) *
      buffFatigueMultiplier(buffs, context);
    fatigueDelta = Math.max(Math.round(base * multiplier), fatigueFloor(context.source));
    fatigueReduced = fatigueDelta < base;
    if (fatigueReduced) passiveEffects.push('fatigue-mult-reduced');
    if (fatigueDelta > base) passiveEffects.push('fatigue-mult-increased');
  }

  let stressDelta = input.stressDelta;
  let stressReduced = false;
  if (stressDelta > 0) {
    const base = stressDelta;
    const fatiguePressureMultiplier =
      (player.volatile?.fatigue ?? 0) >= FATIGUE_STRESS_THRESHOLD
        ? FATIGUE_STRESS_MULTIPLIER
        : 1;
    const multiplier =
      stressMult(player.stats.mentality) *
      traitStressMultiplier(player) *
      buffStressMultiplier(buffs, context) *
      fatiguePressureMultiplier;
    stressDelta = Math.max(Math.round(base * multiplier), stressFloor(context.source));
    stressReduced = stressDelta < base;
    if (stressReduced) passiveEffects.push('stress-mult-reduced');
    if (stressDelta > base) passiveEffects.push('stress-mult-increased');
  }

  return {
    fatigueDelta,
    stressDelta,
    fatigueApplied: input.fatigueDelta > 0,
    stressApplied: input.stressDelta > 0,
    fatigueReduced,
    stressReduced,
    passiveEffects,
  };
}

function inferredConsumeOn(buff: Buff): NonNullable<Buff['consumeOn']> {
  if (buff.consumeOn) return buff.consumeOn;
  if (buff.fatigueGainMultiplier !== undefined) return 'fatigue';
  if (buff.stressGainMultiplier !== undefined) return 'stress';
  return 'growth';
}

function shouldConsumeBuff(
  buff: Buff,
  context: StateModifierContext,
  trigger: BuffConsumeTrigger,
): boolean {
  if (!buffMatches(buff, context)) return false;

  const growthMatches =
    !!trigger.growthApplied &&
    (!buff.growthKey || !trigger.growthKey || buff.growthKey === trigger.growthKey) &&
    ((buff.growthMultiplier ?? buff.multiplier) !== undefined);

  const fatigueMatches =
    !!trigger.fatigueApplied &&
    buff.fatigueGainMultiplier !== undefined;

  const stressMatches =
    !!trigger.stressApplied &&
    buff.stressGainMultiplier !== undefined;

  switch (inferredConsumeOn(buff)) {
    case 'growth':
      return growthMatches;
    case 'fatigue':
      return fatigueMatches;
    case 'stress':
      return stressMatches;
    case 'match':
      return false;
    case 'any':
      return growthMatches || fatigueMatches || stressMatches;
  }
}

export function consumeTriggeredBuffs(
  buffs: Buff[],
  context: StateModifierContext,
  trigger: BuffConsumeTrigger,
): Buff[] {
  return buffs
    .map((buff) =>
      shouldConsumeBuff(buff, context, trigger)
        ? { ...buff, remainingUses: buff.remainingUses - 1 }
        : buff,
    )
    .filter((buff) => buff.remainingUses > 0);
}
