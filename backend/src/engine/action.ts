import { getAction, type ActionDef, type ComboConsume } from '../data/actions.js';
import { getTrait } from '../data/traits.js';
import type {
  ActionResult,
  Buff,
  GameEventPublic,
  GameSession,
  Player,
  RoundCombo,
  StatKey,
} from '../types.js';
import {
  BROKE_MENTALITY_DRAIN,
  CAREER_TIME_EXPERIENCE_RAW,
  CONSTITUTION_COLLAPSE,
  FEEL_CAP_DEFAULT,
  GROWTH_CAP,
  IMPLICIT_FAILURE_STRESS,
  INJURY_REST_ROUNDS,
  STAGE_ORDER,
  STRESS_GRACE_ROUNDS,
  STRESS_MAX,
} from './constants.js';
import {
  applyCareerExperienceGrowth,
  applyDelta,
  clampStats,
  makeRng,
  outcomeEffects,
  outcomeProgression,
  outcomeResourceDelta,
  outcomeStateDelta,
  resolveChoice,
} from './resolver.js';
import { applyStateDeltaModifiers, consumeTriggeredBuffs } from './stateModifiers.js';
import { clampFatigue, clampFeel, clampStress, clampTilt, hashString } from './utils.js';
import { assertNoActiveEventSequence } from './phase.js';

const INJURY_STATE_TAGS = ['minor-injury-risk', 'injury-warning', 'injury-limited', 'forced-rest'] as const;
type InjuryStateTag = typeof INJURY_STATE_TAGS[number];

function matchingActionCombos(player: Player, actionDef: ActionDef): ComboConsume[] {
  const active = new Set((player.roundCombos ?? [])
    .filter((combo) => combo.remainingUses > 0)
    .map((combo) => combo.id));
  return (actionDef.comboConsumes ?? []).filter((combo) => active.has(combo.id));
}

function comboTempBuffs(combos: ComboConsume[], actionTag: string): Buff[] {
  return combos
    .filter((combo) =>
      combo.effects.growthMultiplier !== undefined ||
      combo.effects.fatigueGainMultiplier !== undefined ||
      combo.effects.stressGainMultiplier !== undefined,
    )
    .map((combo) => ({
      id: `combo-${combo.id}`,
      label: combo.label,
      actionTag,
      growthKey: combo.effects.growthKey,
      growthMultiplier: combo.effects.growthMultiplier,
      fatigueGainMultiplier: combo.effects.fatigueGainMultiplier,
      stressGainMultiplier: combo.effects.stressGainMultiplier,
      remainingUses: 1,
      consumeOn: 'any',
    }));
}

function sumComboEffect(combos: ComboConsume[], key: 'feelDelta' | 'tiltDelta' | 'fatigueDelta' | 'stressDelta'): number {
  return combos.reduce((sum, combo) => sum + (combo.effects[key] ?? 0), 0);
}

function consumeRoundCombos(roundCombos: RoundCombo[], consumedIds: Set<string>): RoundCombo[] {
  return roundCombos
    .map((combo) =>
      consumedIds.has(combo.id)
        ? { ...combo, remainingUses: combo.remainingUses - 1 }
        : combo,
    )
    .filter((combo) => combo.remainingUses > 0);
}

function addOpenedCombos(
  roundCombos: RoundCombo[],
  actionDef: ActionDef,
  actionId: string,
  success: boolean,
): RoundCombo[] {
  const out = [...roundCombos];
  const existing = new Set(out.map((combo) => combo.id));
  for (const combo of actionDef.comboOpens ?? []) {
    if (combo.requireSuccess && !success) continue;
    if (existing.has(combo.id)) continue;
    out.push({
      id: combo.id,
      label: combo.label,
      sourceActionId: actionId,
      remainingUses: 1,
    });
    existing.add(combo.id);
  }
  return out;
}

function highestInjuryState(player: Player): InjuryStateTag | null {
  for (const tag of [...INJURY_STATE_TAGS].reverse()) {
    if (player.tags.includes(tag)) return tag;
  }
  return null;
}

function setInjuryState(player: Player, next: InjuryStateTag | null): void {
  player.tags = player.tags.filter((tag) => !INJURY_STATE_TAGS.includes(tag as InjuryStateTag));
  if (next) player.tags = Array.from(new Set([...player.tags, next]));
  if (next === 'forced-rest' && (player.restRounds ?? 0) <= 0) {
    player.restRounds = Math.max(1, INJURY_REST_ROUNDS);
  }
  if (next !== 'forced-rest' && (player.restRounds ?? 0) <= 0) {
    player.tags = player.tags.filter((tag) => tag !== 'injured');
  }
}

export function applyInjuryRiskTick(
  player: Player,
  context: 'routine' | 'match' | 'rest' | 'shop',
  effects: string[],
): Player {
  const next = { ...player, tags: [...player.tags], volatile: { ...player.volatile } };
  if ((next.restRounds ?? 0) > 0) {
    setInjuryState(next, 'forced-rest');
    if (!next.tags.includes('injured')) next.tags.push('injured');
    return next;
  }

  const fatigue = next.volatile.fatigue ?? 0;
  const constitution = next.stats.constitution ?? 0;
  const current = highestInjuryState(next);

  if (context === 'rest' || context === 'shop') {
    if (fatigue <= 45) {
      if (current) effects.push('伤病风险解除');
      setInjuryState(next, null);
    } else if (current === 'injury-limited') {
      setInjuryState(next, 'injury-warning');
      effects.push('伤病状态缓解');
    } else if (current === 'injury-warning') {
      setInjuryState(next, 'minor-injury-risk');
      effects.push('伤病警告缓解');
    }
    return next;
  }

  const highStrain =
    fatigue >= 82 ||
    constitution <= 4 ||
    (context === 'match' && fatigue >= 70);
  const mediumStrain =
    fatigue >= 70 ||
    constitution <= 6 ||
    context === 'match';

  if (!mediumStrain) return next;

  if (current === 'injury-limited' && highStrain) {
    next.restRounds = Math.max(next.restRounds ?? 0, 2);
    setInjuryState(next, 'forced-rest');
    if (!next.tags.includes('injured')) next.tags.push('injured');
    effects.push('强制休养：伤病风险升级');
  } else if (current === 'injury-warning' && highStrain) {
    setInjuryState(next, 'injury-limited');
    effects.push('伤病状态受限');
  } else if (current === 'minor-injury-risk' && highStrain) {
    setInjuryState(next, 'injury-warning');
    effects.push('队医警告：继续硬练可能伤停');
  } else if (!current && mediumStrain) {
    setInjuryState(next, highStrain ? 'injury-warning' : 'minor-injury-risk');
    effects.push(highStrain ? '队医警告：身体风险上升' : '轻微伤病风险');
  }

  return next;
}

export interface ApplyActionResult {
  actionResult: ActionResult;
  player: Player;
  currentEvent: GameEventPublic | null;
  pickedEvent: any;
}

export function applyAction(
  session: GameSession,
  actionId: string,
  aiEvents?: any[],
  aiEventCache?: any,
): ApplyActionResult {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const sessionPhase = session.phase ?? (session.currentEvent ? 'event' : 'action');
  if (sessionPhase !== 'action') throw new Error('not in action phase');

  const actionDef = getAction(actionId);
  if (!actionDef) throw new Error(`未知行动: ${actionId}`);

  if ((session.player.restRounds ?? 0) > 0) {
    throw new Error('休养期间不能进行日常行动');
  }
  const ap = session.player.actionPoints ?? 0;
  if (ap < actionDef.apCost) throw new Error('行动力不足');

  const pm = session.player.pendingMatch;
  if (
    pm &&
    pm.resolveYear === (session.player.year ?? 1) &&
    pm.resolveWeek === (session.player.week ?? 1)
  ) {
    throw new Error('赛事比赛周无法进行日常行动');
  }

  const traits = session.player.traits
    .map(getTrait)
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const rng = makeRng(
    hashString(session.id) ^ ((session.player.round * 1000 + ap) * 2654435761),
  );
  const consumedCombos = matchingActionCombos(session.player, actionDef);
  const consumedComboIds = new Set(consumedCombos.map((combo) => combo.id));
  const comboBuffs = comboTempBuffs(consumedCombos, actionDef.eventType);
  const comboFeelDelta = sumComboEffect(consumedCombos, 'feelDelta');
  const comboTiltDelta = sumComboEffect(consumedCombos, 'tiltDelta');
  const comboFatigueDelta = sumComboEffect(consumedCombos, 'fatigueDelta');
  const comboStressDelta = sumComboEffect(consumedCombos, 'stressDelta');
  const comboPlayer: Player = comboBuffs.length > 0
    ? { ...session.player, buffs: [...(session.player.buffs ?? []), ...comboBuffs] }
    : session.player;

  const syntheticEvent = {
    id: `action-${actionId}`,
    type: actionDef.eventType,
    title: actionDef.label,
    narrative: '',
    stages: STAGE_ORDER,
    difficulty: 0,
    choices: [
      {
        id: 'do',
        label: actionDef.label,
        description: actionDef.description,
        check: actionDef.check,
        success: actionDef.success,
        failure: actionDef.failure,
      },
    ],
  };

  const outcome = resolveChoice({
    player: comboPlayer,
    event: syntheticEvent as any,
    choice: syntheticEvent.choices[0]! as any,
    traits,
    rng,
  });
  const chosenStateDelta = outcomeStateDelta(outcome.chosenOutcome);
  const chosenEffects = outcomeEffects(outcome.chosenOutcome);

  const volatile = session.player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const actionFeelCap = session.player.feelCap ?? FEEL_CAP_DEFAULT;
  const feel = clampFeel(volatile.feel + outcome.feelDelta + comboFeelDelta, actionFeelCap);
  const tilt = clampTilt(volatile.tilt + outcome.tiltDelta + comboTiltDelta);

  let stress = session.player.stress ?? 0;
  const explicitStress = chosenStateDelta.stress;
  const stressDeltaBase = typeof explicitStress === 'number' ? explicitStress : 0;
  const stateContext = { actionTag: actionDef.eventType, source: 'routine' as const };
  const modifiedState = applyStateDeltaModifiers(
    { ...comboPlayer, stats: outcome.nextStats },
    { fatigueDelta: outcome.fatigueDelta, stressDelta: stressDeltaBase },
    stateContext,
  );
  const fatigue = clampFatigue(volatile.fatigue + modifiedState.fatigueDelta + comboFatigueDelta);
  const totalStressDelta = modifiedState.stressDelta + comboStressDelta;
  if (totalStressDelta !== 0) {
    stress = clampStress(stress + totalStressDelta);
  }

  let growthSpent = (session.player.growthSpent ?? 0) + outcome.growthApplied;
  if (growthSpent > GROWTH_CAP) growthSpent = GROWTH_CAP;

  let buffs: Buff[] = consumeTriggeredBuffs(session.player.buffs ?? [], stateContext, {
    growthApplied: outcome.growthApplied > 0,
    growthKey: outcome.growthKey,
    fatigueApplied: modifiedState.fatigueApplied,
    stressApplied: modifiedState.stressApplied,
    fatigueReduced: modifiedState.fatigueReduced,
    stressReduced: modifiedState.stressReduced,
  });

  if (chosenEffects.buffAdd) {
    buffs = [...buffs, chosenEffects.buffAdd];
  }

  const newVolatile = { feel, tilt, fatigue };
  const consumedRoundCombos = consumeRoundCombos(session.player.roundCombos ?? [], consumedComboIds);
  const roundCombos = addOpenedCombos(
    consumedRoundCombos,
    actionDef,
    actionId,
    outcome.success,
  );

  let nextPlayer: Player = {
    ...session.player,
    stats: outcome.nextStats,
    volatile: newVolatile,
    buffs,
    growthSpent,
    stress,
    actionPoints: ap - actionDef.apCost,
    roundCombos,
  };
  const injuryEffects: string[] = [];
  const injuryContext =
    actionId.includes('rest') ||
    actionId.includes('vacation') ||
    newVolatile.fatigue < volatile.fatigue
      ? 'rest'
      : 'routine';
  nextPlayer = applyInjuryRiskTick(nextPlayer, injuryContext, injuryEffects);

  const actionResult: ActionResult = {
    actionId,
    actionLabel: actionDef.label,
    success: outcome.success,
    roll: outcome.roll,
    dc: outcome.dc,
    naturalRoll: outcome.naturalRoll,
    narrative: injuryEffects.length > 0
      ? `${outcome.chosenOutcome.narrative} ${injuryEffects.join('。')}`
      : outcome.chosenOutcome.narrative,
    feelChange: feel - volatile.feel,
    fatigueChange: fatigue - volatile.fatigue,
    stressChange: stress - (session.player.stress ?? 0),
    growthKey: outcome.growthKey,
    growthAmount: outcome.growthApplied > 0 ? outcome.growthApplied : undefined,
    newStats: outcome.nextStats,
    newVolatile,
    comboTriggeredLabels: consumedCombos.map((combo) => combo.label),
    comboAddedLabels: roundCombos
      .filter((combo) => !consumedRoundCombos.some((before) => before.id === combo.id))
      .map((combo) => combo.label),
  };

  return {
    actionResult,
    player: nextPlayer,
    currentEvent: null,
    pickedEvent: null,
  };
}
