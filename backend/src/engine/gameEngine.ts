import { DEFAULT_BACKGROUND_ID, getBackground } from '../data/backgrounds.js';
import {
  getTournament,
  stageRewardDelta,
  synthesizeMatchEvent,
} from '../data/tournaments.js';
import { generateRivals } from '../data/rivals.js';
import {
  addPlayerPoints,
  buildLeaderboard,
  tickLeaderboard,
} from '../data/leaderboard.js';
import { getEventById } from '../data/events/index.js';
import { TRAITS, getTrait } from '../data/traits.js';
import type {
  GameEventPublic,
  GameSession,
  Player,
  RoundResult,
  Stats,
  Trait,
} from '../types.js';
import {
  BASE_STATS,
  BROKE_MENTALITY_DRAIN,
  CONSTITUTION_COLLAPSE,
  FAME_MAX,
  FAME_MIN,
  IMPLICIT_FAILURE_STRESS,
  INJURY_REST_ROUNDS,
  LEGEND_FAME_THRESHOLD,
  MAX_ROUNDS,
  POINT_POOL,
  STAT_KEYS,
  STRESS_GRACE_ROUNDS,
  STRESS_MAX,
  STRESS_MIN,
  STRESS_SCALE,
  passiveStressFromMentality,
} from './constants.js';
import { pickEvent, substituteRivals, toPublicEvent } from './events.js';
import { checkTournamentPromotion } from './stages.js';
import { applyDelta, clampStats, makeRng, resolveChoice } from './resolver.js';

export interface InitInput {
  name: string;
  traitIds: string[];
  backgroundId: string;
  stats?: Stats;
}

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampStress(v: number): number {
  return Math.max(STRESS_MIN, Math.min(STRESS_MAX, Math.round(v)));
}

function clampFame(v: number): number {
  return Math.max(FAME_MIN, Math.min(FAME_MAX, Math.round(v)));
}

export function rollRandomTraits(count = 3): Trait[] {
  const pool = [...TRAITS];
  const out: Trait[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return out;
}

export function computeTraitMods(traits: Trait[]): {
  floor: Stats;
  negative: Stats;
} {
  const floor: Stats = { ...BASE_STATS };
  const negative: Stats = { ...BASE_STATS };
  for (const t of traits) {
    for (const k of STAT_KEYS) {
      const v = t.modifiers[k];
      if (typeof v !== 'number') continue;
      if (v > 0) floor[k] += v;
      else if (v < 0) negative[k] += v;
    }
  }
  return { floor, negative };
}

function randomStatsWithFloor(floor: Stats): Stats {
  const stats: Stats = { ...floor };
  let remaining = POINT_POOL;
  while (remaining > 0) {
    const available = STAT_KEYS.filter((k) => stats[k] < floor[k] + POINT_POOL);
    if (available.length === 0) break;
    const pick = available[Math.floor(Math.random() * available.length)]!;
    stats[pick] += 1;
    remaining -= 1;
  }
  return stats;
}

export function validateAllocation(stats: Stats, floor: Stats): string | null {
  let aboveFloor = 0;
  for (const k of STAT_KEYS) {
    const v = stats[k];
    if (!Number.isInteger(v)) return `属性 ${k} 必须是整数`;
    if (v < floor[k]) return `属性 ${k} 不能低于特质底线 ${floor[k]}`;
    if (v > floor[k] + POINT_POOL) return `属性 ${k} 最多 ${floor[k] + POINT_POOL}`;
    aboveFloor += v - floor[k];
  }
  if (aboveFloor !== POINT_POOL) {
    return `可分配点数必须恰好为 ${POINT_POOL}，当前已分配 ${aboveFloor}`;
  }
  return null;
}

export function initPlayer(input: InitInput): Player {
  const bgId = input.backgroundId || DEFAULT_BACKGROUND_ID;
  const bg = getBackground(bgId);
  if (!bg) throw new Error(`unknown background: ${bgId}`);

  const traits = input.traitIds.map((id) => {
    const t = getTrait(id);
    if (!t) throw new Error(`unknown trait: ${id}`);
    return t;
  });
  if (traits.length !== 3) throw new Error('must choose exactly 3 traits');
  if (new Set(traits.map((t) => t.id)).size !== 3) {
    throw new Error('traits must be distinct');
  }

  const { floor, negative } = computeTraitMods(traits);

  const allocation = input.stats ? { ...input.stats } : randomStatsWithFloor(floor);
  const err = validateAllocation(allocation, floor);
  if (err) throw new Error(err);

  let finalStats = applyDelta(allocation, negative);
  finalStats = applyDelta(finalStats, bg.statBias);

  return {
    name: input.name.trim() || 'nameless',
    stats: clampStats(finalStats),
    traits: traits.map((t) => t.id),
    backgroundId: bg.id,
    stage: bg.startStage,
    round: 0,
    tags: [...bg.tags],
    stress: 0,
    fame: 0,
    restRounds: 0,
    stressMaxRounds: 0,
    year: 1,
    week: 1,
    pendingMatch: null,
    rivals: generateRivals(4),
    tournamentParticipations: 0,
    tournamentChampionships: 0,
    tierParticipations: {},
    tierChampionships: {},
    promotionPending: null,
    promotionCooldown: 0,
  };
}

// Step time forward by one week, wrapping at year-end (48 weeks / year).
function advanceWeek(year: number, week: number): { year: number; week: number } {
  const WEEKS = 48;
  if (week >= WEEKS) return { year: year + 1, week: 1 };
  return { year, week: week + 1 };
}

// Convert week index (1-48) → month (1-12) for display only.
export function weekToMonth(week: number): number {
  return Math.min(12, Math.max(1, Math.ceil(week / 4)));
}


export function createSession(player: Player, rngSeed: number): GameSession {
  const rng = makeRng(rngSeed);
  const firstEvent = pickEvent({ player, recentEventIds: [], rng });

  const id = uuid();
  const ts = nowIso();

  return {
    id,
    player,
    currentEvent: firstEvent ? toPublicEvent(firstEvent, player.rivals) : null,
    history: [],
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
    leaderboard: buildLeaderboard(player),
  };
}

export interface ApplyChoiceResult {
  session: GameSession;
  result: RoundResult;
}

export function applyChoice(
  session: GameSession,
  choiceId: string,
): ApplyChoiceResult {
  if (session.status !== 'active') throw new Error('session is not active');
  if (!session.currentEvent) throw new Error('no pending event on this session');

  const eventDef = getEventById(session.currentEvent.id);
  if (!eventDef) throw new Error(`unknown event: ${session.currentEvent.id}`);

  const choiceDef = eventDef.choices.find((c) => c.id === choiceId);
  if (!choiceDef) throw new Error(`unknown choice: ${choiceId}`);

  const traits = session.player.traits
    .map(getTrait)
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const rng = makeRng(
    hashString(session.id) ^ ((session.player.round + 1) * 2654435761),
  );

  const outcome = resolveChoice({
    player: session.player,
    event: eventDef,
    choice: choiceDef,
    traits,
    rng,
  });

  const stageBefore = session.player.stage;
  const wasBroke = session.player.stats.money <= 0;

  let statsAfterPassive = outcome.nextStats;
  const passiveEffects: string[] = [];
  const tagsAdded = [...outcome.tagsAdded];
  const tagsRemoved = [...outcome.tagsRemoved];

  // --- Broke drain ---
  // Declared here so passive stress can read it even if the actual
  // addition happens below.
  let brokeStressBump = 0;
  if (statsAfterPassive.money <= 0) {
    statsAfterPassive = applyDelta(statsAfterPassive, {
      mentality: -BROKE_MENTALITY_DRAIN,
    });
    passiveEffects.push('broke-mentality-drain');
    brokeStressBump = 8;
    if (!wasBroke && !tagsAdded.includes('broke')) tagsAdded.push('broke');
  }

  // --- Dynamic state: stress & fame deltas from outcome ---
  let stress = session.player.stress ?? 0;
  let fame = session.player.fame ?? 0;
  const stressBefore = stress;
  const fameBefore = fame;
  // Rescale event-declared stressDelta from the old 0-20 scale to 0-100.
  const explicitStress = outcome.chosenOutcome.stressDelta;
  if (typeof explicitStress === 'number' && explicitStress !== 0) {
    stress = clampStress(stress + explicitStress * STRESS_SCALE);
  } else if (!outcome.success) {
    // Failure outcomes with no explicit stressDelta still push stress up —
    // every negative choice should hurt.
    stress = clampStress(stress + IMPLICIT_FAILURE_STRESS);
    passiveEffects.push('stress-from-failure');
  }
  if (outcome.chosenOutcome.fameDelta) {
    fame = clampFame(fame + outcome.chosenOutcome.fameDelta);
  }

  // Passive stress driven by mentality:
  //   high mentality bleeds stress off; low mentality piles it on.
  const mentalityStress = passiveStressFromMentality(statsAfterPassive.mentality);
  if (mentalityStress !== 0) {
    stress = clampStress(stress + mentalityStress);
    if (mentalityStress > 0) passiveEffects.push('stress-from-anxiety');
    else passiveEffects.push('stress-decay-mentality');
  }
  if (brokeStressBump > 0) {
    stress = clampStress(stress + brokeStressBump);
    passiveEffects.push('stress-from-broke');
  }

  // --- Injury & forced rest ---
  let restRounds = session.player.restRounds ?? 0;
  if (outcome.chosenOutcome.injuryRestRounds && outcome.chosenOutcome.injuryRestRounds > 0) {
    restRounds = Math.max(restRounds, outcome.chosenOutcome.injuryRestRounds);
    if (!tagsAdded.includes('injured')) tagsAdded.push('injured');
    passiveEffects.push('injury-triggered');
  }
  // Constitution collapse: 身体状态 = constitution * 2 <= 0 → forced rest
  if (statsAfterPassive.constitution <= CONSTITUTION_COLLAPSE && restRounds <= 0) {
    restRounds = INJURY_REST_ROUNDS;
    if (!tagsAdded.includes('injured')) tagsAdded.push('injured');
    passiveEffects.push('physical-collapse-rest');
  }
  if (restRounds > 0 && eventDef.type === 'rest') {
    // Completed a forced rest round — decrement counter.
    restRounds -= 1;
    if (restRounds === 0) {
      if (!tagsRemoved.includes('injured')) tagsRemoved.push('injured');
      passiveEffects.push('rest-completed');
    }
  }

  // --- Stress breakdown grace ---
  // The fatal mental-health gauge is now stress, not mentality. Mentality
  // controls how fast it accumulates (above) but doesn't end the game directly.
  let stressMaxRounds = session.player.stressMaxRounds ?? 0;
  if (stress >= STRESS_MAX) {
    stressMaxRounds += 1;
    passiveEffects.push(
      `stress-pegged-${Math.min(stressMaxRounds, STRESS_GRACE_ROUNDS)}`,
    );
    if (!tagsAdded.includes('breaking-down')) tagsAdded.push('breaking-down');
  } else {
    if (stressMaxRounds > 0) passiveEffects.push('stress-eased');
    stressMaxRounds = 0;
    tagsRemoved.push('breaking-down');
  }

  const totalStatChanges: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const diff = statsAfterPassive[k] - session.player.stats[k];
    if (diff !== 0) totalStatChanges[k] = diff;
  }

  const nextTags = dedupe([
    ...session.player.tags.filter((t) => !tagsRemoved.includes(t)),
    ...tagsAdded,
  ]);

  const { year: nextYear, week: nextWeek } = advanceWeek(
    session.player.year ?? 1,
    session.player.week ?? 1,
  );

  const nextPlayer: Player = {
    ...session.player,
    stats: statsAfterPassive,
    stage: outcome.stageAfter,
    round: session.player.round + 1,
    tags: nextTags,
    stress,
    fame,
    restRounds,
    stressMaxRounds,
    year: nextYear,
    week: nextWeek,
  };

  const result: RoundResult = {
    round: nextPlayer.round,
    eventId: eventDef.id,
    eventType: eventDef.type,
    eventTitle: eventDef.title,
    choiceId: choiceDef.id,
    choiceLabel: choiceDef.label,
    success: outcome.success,
    roll: outcome.roll,
    dc: outcome.dc,
    narrative: outcome.chosenOutcome.narrative,
    statChanges: totalStatChanges,
    newStats: nextPlayer.stats,
    stageBefore,
    stageAfter: outcome.stageAfter,
    tagsAdded,
    passiveEffects,
    stressChange: stress - stressBefore,
    fameChange: fame - fameBefore,
    createdAt: nowIso(),
  };

  const ending = checkEnding(nextPlayer, outcome.endRun, outcome.endReason);

  // Multi-stage tournament progression: handle stage advance / elimination,
  // credit leaderboard points, and track career participation/championship records.
  let leaderboard = session.leaderboard ?? buildLeaderboard(session.player);
  if (
    nextPlayer.pendingMatch &&
    eventDef.id.startsWith(`tournament-${nextPlayer.pendingMatch.tournamentId}--`)
  ) {
    const t = getTournament(nextPlayer.pendingMatch.tournamentId);
    const idx = nextPlayer.pendingMatch.stageIndex;
    const isFinal = t ? idx >= t.bracket.length - 1 : true;

    if (t) {
      const reward = stageRewardDelta(t, idx, outcome.success);
      const extraPoints = outcome.chosenOutcome.pointsDelta ?? 0;
      const totalPoints = reward.points + extraPoints;
      if (totalPoints !== 0) {
        leaderboard = addPlayerPoints(leaderboard, totalPoints);
      }

      // Count participation when first stage (stageIndex 0) resolves.
      if (idx === 0) {
        const tierPart = { ...(nextPlayer.tierParticipations ?? {}) };
        tierPart[t.tier] = (tierPart[t.tier] ?? 0) + 1;
        nextPlayer.tierParticipations = tierPart;
        nextPlayer.tournamentParticipations = (nextPlayer.tournamentParticipations ?? 0) + 1;
      }
      // Count championship when final stage is won.
      if (isFinal && outcome.success) {
        const tierChamp = { ...(nextPlayer.tierChampionships ?? {}) };
        tierChamp[t.tier] = (tierChamp[t.tier] ?? 0) + 1;
        nextPlayer.tierChampionships = tierChamp;
        nextPlayer.tournamentChampionships = (nextPlayer.tournamentChampionships ?? 0) + 1;
      }
    }

    if (!t || !outcome.success || isFinal) {
      nextPlayer.pendingMatch = null;
    } else {
      const adv = advanceWeek(nextYear, nextWeek);
      nextPlayer.pendingMatch = {
        ...nextPlayer.pendingMatch,
        stageIndex: idx + 1,
        resolveYear: adv.year,
        resolveWeek: adv.week,
      };
    }

    // After updating tournament record, check whether the player has met
    // the gate conditions for the next stage. Only trigger if no cooldown active.
    if (!nextPlayer.promotionPending) {
      const promoCheck = checkTournamentPromotion(nextPlayer);
      if (promoCheck.canPromote && promoCheck.to) {
        const cooldownOk = (nextPlayer.promotionCooldown ?? 0) <= nextPlayer.round;
        if (cooldownOk) {
          nextPlayer.promotionPending = promoCheck.to;
        }
      }
    }
  }

  // Promotion event resolution:
  //   - If stage advanced via stageSet in a promotion event → clear pending.
  //   - If player picked decline (stage unchanged after promotion event) → clear
  //     pending and set cooldown so they're not immediately re-triggered.
  if (eventDef.id.startsWith('promotion-')) {
    if (nextPlayer.stage !== stageBefore) {
      // Successfully accepted promotion.
      nextPlayer.promotionPending = null;
    } else {
      // Declined or failed — clear pending and set an 8-round cooldown.
      nextPlayer.promotionPending = null;
      nextPlayer.promotionCooldown = nextPlayer.round + 8;
    }
  }

  // Each round, opponents gain points naturally so the board feels alive.
  leaderboard = tickLeaderboard(leaderboard);

  // Schedule resolution: if a pending match matures NEXT month, force its
  // synthesized event onto the queue. Otherwise pick from the regular pool.
  const recent = [...session.history.slice(-2).map((r) => r.eventId), eventDef.id];
  const nextEventDef = (() => {
    if (ending) return null;
    const pm = nextPlayer.pendingMatch;
    if (
      pm &&
      pm.resolveYear === nextYear &&
      pm.resolveWeek === nextWeek
    ) {
      const t = getTournament(pm.tournamentId);
      if (t) return synthesizeMatchEvent(t, pm.stageIndex);
    }
    return pickEvent({ player: nextPlayer, recentEventIds: recent, rng });
  })();

  // Substitute rival placeholders in the result narrative as well.
  result.narrative = substituteRivals(result.narrative, nextPlayer.rivals);
  result.eventTitle = substituteRivals(result.eventTitle, nextPlayer.rivals);

  const updated: GameSession = {
    ...session,
    player: nextPlayer,
    currentEvent: nextEventDef ? toPublicEvent(nextEventDef, nextPlayer.rivals) : null,
    history: [...session.history, result],
    status: ending ? 'ended' : 'active',
    ending: ending ?? session.ending,
    updatedAt: nowIso(),
    leaderboard,
  };

  return { session: updated, result };
}

function checkEnding(
  player: Player,
  endRun: boolean,
  endReason?: string,
): string | undefined {
  if (endRun) return endReason ?? 'career_ended';
  // Stress is the fatal mental-health gauge: pegged at MAX for K rounds → break.
  if ((player.stressMaxRounds ?? 0) >= STRESS_GRACE_ROUNDS) return 'stress_breakdown';
  // Career-ending injury: chronic injury-prone player whose body has collapsed.
  if (player.tags.includes('injury-prone') && player.stats.constitution <= 0) {
    return 'injury_ended_career';
  }
  if (player.round >= MAX_ROUNDS) {
    if ((player.fame ?? 0) >= LEGEND_FAME_THRESHOLD) return 'legend';
    if (player.tags.includes('tournament-winner')) return 'champion';
    return 'retired_on_top';
  }
  if (player.stage === 'retired') return 'quiet_exit';
  return undefined;
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export { TRAITS };
