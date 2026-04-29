import { DEFAULT_BACKGROUND_ID, getBackground } from '../data/backgrounds.js';
import {
  type Tournament,
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
  Buff,
  GameEventPublic,
  GameSession,
  MatchStats,
  Outcome,
  Player,
  RoundResult,
  StatDelta,
  StatKey,
  Stats,
  Trait,
  VolatileState,
} from '../types.js';
import {
  BASE_STATS,
  BROKE_MENTALITY_DRAIN,
  CONSTITUTION_COLLAPSE,
  FAME_MAX,
  FAME_MIN,
  FATIGUE_MAX,
  FATIGUE_MIN,
  FATIGUE_STRESS_MULTIPLIER,
  FATIGUE_STRESS_THRESHOLD,
  FEEL_MAX,
  FEEL_MIN,
  GROWTH_CAP,
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
  TILT_MAX,
  TILT_MIN,
  passiveStressFromMentality,
} from './constants.js';
import { pickEvent, substituteRivals, toPublicEvent } from './events.js';
import { checkTournamentPromotion } from './stages.js';
import { applyDelta, applyGrowth, clampStats, makeRng, resolveChoice, translateStatDelta } from './resolver.js';
import { type MatchSimResult, simulateMatch } from './matchSimulator.js';

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

function clampFeel(v: number): number {
  return Math.max(FEEL_MIN, Math.min(FEEL_MAX, Math.round(v * 2) / 2)); // 0.5 步进
}

function clampTilt(v: number): number {
  return Math.max(TILT_MIN, Math.min(TILT_MAX, Math.round(v)));
}

function clampFatigue(v: number): number {
  return Math.max(FATIGUE_MIN, Math.min(FATIGUE_MAX, Math.round(v)));
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
    volatile: { feel: 0, tilt: 0, fatigue: 0 },
    buffs: [],
    growthSpent: 0,
    traits: traits.map((t) => t.id),
    backgroundId: bg.id,
    stage: bg.startStage,
    round: 0,
    tags: [...bg.tags],
    tagExpiry: {},
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

function advanceWeek(year: number, week: number): { year: number; week: number } {
  const WEEKS = 48;
  if (week >= WEEKS) return { year: year + 1, week: 1 };
  return { year, week: week + 1 };
}

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

// Build a synthetic ResolveResult from a match simulation, bypassing d20.
function buildMatchResolveResult(
  player: Player,
  sim: MatchSimResult,
  t: Tournament,
  stageIdx: number,
): ReturnType<typeof resolveChoice> {
  const won = sim.won;
  const isFinal = stageIdx >= t.bracket.length - 1;
  const r = t.reward;
  const stage = t.bracket[stageIdx]!;
  const lossShare = stage.rewardShareOnEarlyExit;

  // Reward calculation mirrors old synthesizeMatchEvent logic
  const winReward: StatDelta = isFinal
    ? { money: r.money, experience: r.experience }
    : { money: Math.max(0, Math.floor(r.money / 4)), experience: Math.max(1, Math.floor(r.experience / 4)) };
  const lossReward: StatDelta = {
    money: Math.max(0, Math.floor(r.money * lossShare)),
    experience: Math.max(1, Math.floor(r.experience * lossShare)),
  };
  const winFame = isFinal ? r.fame : Math.floor(r.fame / 5);
  const lossFame = Math.floor(r.fame * lossShare);
  // Win a final still costs stress at high tiers; loss is always stressful.
  const winStressDelta = isFinal ? (r.stressDelta ?? 0) : 0;
  const lossStressDelta = (r.stressDelta ?? 1) + 2;

  const statChanges: StatDelta = won ? winReward : lossReward;

  // Apply stat changes via translateStatDelta for consistency
  const legacy = translateStatDelta(statChanges);
  let nextStats = { ...player.stats };
  nextStats.money = Math.max(0, Math.min(20, nextStats.money + legacy.moneyDelta));

  let growthApplied = 0;
  let growthKey: StatKey | undefined;
  if (legacy.expGrowth > 0) {
    const res = applyGrowth(
      nextStats,
      'experience',
      legacy.expGrowth,
      player.growthSpent,
      player.buffs,
      'match',
    );
    nextStats = res.stats;
    growthApplied = res.grown;
    growthKey = 'experience';
  }
  nextStats = clampStats(nextStats);

  const tagAdds = won && isFinal ? ['tournament-winner'] : [];

  const chosenOutcome: Outcome = {
    narrative: sim.summary,
    statChanges,
    feelDelta: sim.feelDelta,
    tiltDelta: sim.tiltDelta,
    fatigueDelta: sim.fatigueDelta,
    stressDelta: won ? winStressDelta : lossStressDelta,
    fameDelta: won ? winFame : lossFame,
    tagAdds,
  };

  // roll = rating×100 for display; dc = enemy aim proxy
  const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
  const enemyAimProxy = Math.max(20, Math.min(90, 25 + effectiveDiff * 8));

  return {
    success: won,
    roll: Math.round(sim.rating * 100),
    dc: enemyAimProxy,
    chosenOutcome,
    nextStats,
    stageAfter: player.stage,
    tagsAdded: tagAdds,
    tagsRemoved: [],
    endRun: false,
    feelDelta: sim.feelDelta,
    tiltDelta: sim.tiltDelta,
    fatigueDelta: sim.fatigueDelta,
    moneyDelta: legacy.moneyDelta,
    growthApplied,
    growthKey,
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

  // ── 比赛模拟拦截（tournament-* 事件走数值模拟而非 d20）──
  let pendingMatchSim: MatchSimResult | undefined;
  const tournamentMatch = /^tournament-(.+)--(\d+)$/.exec(eventDef.id);

  const outcome = (() => {
    if (tournamentMatch) {
      const t = getTournament(tournamentMatch[1]!);
      const stageIdx = parseInt(tournamentMatch[2]!, 10);
      const stage = t?.bracket[stageIdx];
      if (t && stage) {
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
        pendingMatchSim = simulateMatch(session.player, effectiveDiff, rng);
        return buildMatchResolveResult(session.player, pendingMatchSim, t, stageIdx);
      }
    }
    return resolveChoice({
      player: session.player,
      event: eventDef,
      choice: choiceDef,
      traits,
      rng,
    });
  })();

  const stageBefore = session.player.stage;
  const wasBroke = session.player.stats.money <= 0;

  // ── 核心属性（resolver 已应用成长）──
  let statsAfterGrowth = outcome.nextStats;
  const passiveEffects: string[] = [];
  const tagsAdded = [...outcome.tagsAdded];
  const tagsRemoved = [...outcome.tagsRemoved];

  // ── 成长上限更新 ──
  let growthSpent = (session.player.growthSpent ?? 0) + outcome.growthApplied;
  if (growthSpent > GROWTH_CAP) growthSpent = GROWTH_CAP;

  // ── Buff 消耗 & 新增 ──
  let buffs: Buff[] = (session.player.buffs ?? []).map((b) => {
    if (
      outcome.growthKey &&
      (b.actionTag === 'all' || b.actionTag === eventDef.type) &&
      outcome.growthApplied > 0
    ) {
      return { ...b, remainingUses: b.remainingUses - 1 };
    }
    return b;
  }).filter((b) => b.remainingUses > 0);

  if (outcome.chosenOutcome.buffAdd) {
    buffs = [...buffs, outcome.chosenOutcome.buffAdd];
  }

  // ── 破产处理（money 仍在 stats 中）──
  let brokeStressBump = 0;
  if (statsAfterGrowth.money <= 0) {
    statsAfterGrowth = applyDelta(statsAfterGrowth, { mentality: -BROKE_MENTALITY_DRAIN });
    passiveEffects.push('broke-mentality-drain');
    brokeStressBump = 8;
    if (!wasBroke && !tagsAdded.includes('broke')) tagsAdded.push('broke');
  }

  // ── 压力计算 ──
  let stress = session.player.stress ?? 0;
  let fame = session.player.fame ?? 0;
  const stressBefore = stress;
  const fameBefore = fame;

  const volatile = session.player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };

  // 疲劳放大系数（高疲劳时压力增益更强）
  const fatigueFactor =
    volatile.fatigue >= FATIGUE_STRESS_THRESHOLD ? FATIGUE_STRESS_MULTIPLIER : 1;

  const explicitStress = outcome.chosenOutcome.stressDelta;
  if (typeof explicitStress === 'number' && explicitStress !== 0) {
    const raw = explicitStress * STRESS_SCALE;
    stress = clampStress(stress + (raw > 0 ? raw * fatigueFactor : raw));
  } else if (!outcome.success) {
    stress = clampStress(stress + IMPLICIT_FAILURE_STRESS * fatigueFactor);
    passiveEffects.push('stress-from-failure');
  }
  if (outcome.chosenOutcome.fameDelta) {
    fame = clampFame(fame + outcome.chosenOutcome.fameDelta);
  }

  // 心态被动压力（基于 mentality 核心属性）
  const mentalityStress = passiveStressFromMentality(statsAfterGrowth.mentality);
  if (mentalityStress !== 0) {
    stress = clampStress(stress + mentalityStress);
    passiveEffects.push(mentalityStress > 0 ? 'stress-from-anxiety' : 'stress-decay-mentality');
  }
  if (brokeStressBump > 0) {
    stress = clampStress(stress + brokeStressBump * fatigueFactor);
    passiveEffects.push('stress-from-broke');
  }

  // ── 状态系统更新（feel / tilt / fatigue）──
  let feel = clampFeel(volatile.feel + outcome.feelDelta);
  let tilt = clampTilt(volatile.tilt + outcome.tiltDelta);
  let fatigue = clampFatigue(volatile.fatigue + outcome.fatigueDelta);

  // Tilt 影响手感：tilt >= 2 → 手感上限降低
  if (tilt >= 2 && feel > 1) feel = clampFeel(feel - 0.5);
  // 手感很热但疲劳极高 → 自然衰减
  if (fatigue >= 85 && feel > 0) feel = clampFeel(feel - 1);

  const feelChange = feel - volatile.feel;
  const tiltChange = tilt - volatile.tilt;
  const fatigueChange = fatigue - volatile.fatigue;

  // ── 受伤/强制休养 ──
  let restRounds = session.player.restRounds ?? 0;
  if (outcome.chosenOutcome.injuryRestRounds && outcome.chosenOutcome.injuryRestRounds > 0) {
    restRounds = Math.max(restRounds, outcome.chosenOutcome.injuryRestRounds);
    if (!tagsAdded.includes('injured')) tagsAdded.push('injured');
    passiveEffects.push('injury-triggered');
  }
  if (statsAfterGrowth.constitution <= CONSTITUTION_COLLAPSE && restRounds <= 0) {
    restRounds = INJURY_REST_ROUNDS;
    if (!tagsAdded.includes('injured')) tagsAdded.push('injured');
    passiveEffects.push('physical-collapse-rest');
  }
  if (restRounds > 0 && eventDef.type === 'rest') {
    restRounds -= 1;
    if (restRounds === 0) {
      if (!tagsRemoved.includes('injured')) tagsRemoved.push('injured');
      passiveEffects.push('rest-completed');
    }
  }

  // ── 压力崩溃检查 ──
  let stressMaxRounds = session.player.stressMaxRounds ?? 0;
  if (stress >= STRESS_MAX) {
    stressMaxRounds += 1;
    passiveEffects.push(`stress-pegged-${Math.min(stressMaxRounds, STRESS_GRACE_ROUNDS)}`);
    if (!tagsAdded.includes('breaking-down')) tagsAdded.push('breaking-down');
  } else {
    if (stressMaxRounds > 0) passiveEffects.push('stress-eased');
    stressMaxRounds = 0;
    tagsRemoved.push('breaking-down');
  }

  // ── 属性变化 delta（用于 RoundResult）──
  const statChanges: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const diff = statsAfterGrowth[k] - session.player.stats[k];
    if (Math.abs(diff) > 0.001) statChanges[k] = diff;
  }

  const nextRound = session.player.round + 1;

  // ── 冷却 tag 处理 ──────────────────────────────────────────────
  // 1. 先剪掉已过期的冷却 tag
  const nextTagExpiry: Record<string, number> = { ...(session.player.tagExpiry ?? {}) };
  const expiredCdTags = Object.entries(nextTagExpiry)
    .filter(([, exp]) => exp <= nextRound)
    .map(([t]) => t);
  for (const t of expiredCdTags) delete nextTagExpiry[t];

  // 2. 组装 nextTags（先去掉 tagsRemoved 和过期冷却 tag，再加 tagsAdded）
  const nextTags = dedupe([
    ...session.player.tags.filter((t) => !tagsRemoved.includes(t) && !expiredCdTags.includes(t)),
    ...tagsAdded,
  ]);

  // 3. 写入本次事件新增的冷却 tag
  const newCooldowns = outcome.chosenOutcome.tagCooldowns ?? {};
  for (const [tag, duration] of Object.entries(newCooldowns)) {
    if (!nextTags.includes(tag)) nextTags.push(tag);
    nextTagExpiry[tag] = nextRound + duration;
  }

  const { year: nextYear, week: nextWeek } = advanceWeek(
    session.player.year ?? 1,
    session.player.week ?? 1,
  );

  const nextPlayer: Player = {
    ...session.player,
    stats: statsAfterGrowth,
    volatile: { feel, tilt, fatigue },
    buffs,
    growthSpent,
    stage: outcome.stageAfter,
    round: nextRound,
    tags: nextTags,
    tagExpiry: nextTagExpiry,
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
    statChanges,
    newStats: nextPlayer.stats,
    stageBefore,
    stageAfter: outcome.stageAfter,
    tagsAdded,
    passiveEffects,
    stressChange: stress - stressBefore,
    fameChange: fame - fameBefore,
    feelChange,
    tiltChange,
    fatigueChange,
    buffsAdded: outcome.chosenOutcome.buffAdd ? [outcome.chosenOutcome.buffAdd] : [],
    matchStats: pendingMatchSim
      ? {
          kills: pendingMatchSim.kills,
          deaths: pendingMatchSim.deaths,
          assists: pendingMatchSim.assists,
          headshotRate: pendingMatchSim.headshotRate,
          rating: pendingMatchSim.rating,
          teamScore: pendingMatchSim.teamScore,
          enemyScore: pendingMatchSim.enemyScore,
        } satisfies MatchStats
      : undefined,
    createdAt: nowIso(),
  };

  const ending = checkEnding(nextPlayer, outcome.endRun, outcome.endReason);

  // ── 赛事进度 ──
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
      if (totalPoints !== 0) leaderboard = addPlayerPoints(leaderboard, totalPoints);

      if (idx === 0) {
        const tierPart = { ...(nextPlayer.tierParticipations ?? {}) };
        tierPart[t.tier] = (tierPart[t.tier] ?? 0) + 1;
        nextPlayer.tierParticipations = tierPart;
        nextPlayer.tournamentParticipations = (nextPlayer.tournamentParticipations ?? 0) + 1;
      }
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

    if (!nextPlayer.promotionPending) {
      const promoCheck = checkTournamentPromotion(nextPlayer);
      if (promoCheck.canPromote && promoCheck.to) {
        const cooldownOk = (nextPlayer.promotionCooldown ?? 0) <= nextPlayer.round;
        if (cooldownOk) nextPlayer.promotionPending = promoCheck.to;
      }
    }
  }

  if (eventDef.id.startsWith('promotion-')) {
    if (nextPlayer.stage !== stageBefore) {
      nextPlayer.promotionPending = null;
    } else {
      nextPlayer.promotionPending = null;
      nextPlayer.promotionCooldown = nextPlayer.round + 8;
    }
  }

  leaderboard = tickLeaderboard(leaderboard);

  const recent = [...session.history.slice(-2).map((r) => r.eventId), eventDef.id];
  const nextEventDef = (() => {
    if (ending) return null;
    const pm = nextPlayer.pendingMatch;
    if (pm && pm.resolveYear === nextYear && pm.resolveWeek === nextWeek) {
      const t = getTournament(pm.tournamentId);
      if (t) return synthesizeMatchEvent(t, pm.stageIndex);
    }
    return pickEvent({ player: nextPlayer, recentEventIds: recent, rng });
  })();

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

function checkEnding(player: Player, endRun: boolean, endReason?: string): string | undefined {
  if (endRun) return endReason ?? 'career_ended';
  if ((player.stressMaxRounds ?? 0) >= STRESS_GRACE_ROUNDS) return 'stress_breakdown';
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
