import { DEFAULT_BACKGROUND_ID, getBackground } from '../data/backgrounds.js';
import {
  type Tournament,
  getTournament,
  stageRewardDelta,
  synthesizeMatchEvent,
} from '../data/tournaments.js';
import { generateRivals } from '../data/rivals.js';
import { generateRoster } from '../data/roster.js';
import {
  addPlayerPoints,
  buildLeaderboard,
  tickLeaderboard,
} from '../data/leaderboard.js';
import { getEventById } from '../data/events/index.js';
import { TRAITS, getTrait } from '../data/traits.js';
import { ACTIONS, getAction } from '../data/actions.js';
import { getShopItem, SHOP_ITEMS } from '../data/shop.js';
import { CLUBS, getClub, clubsForStage, PRIZE_SPLIT } from '../data/clubs.js';
import type {
  ActionResult,
  Buff,
  Club,
  GameEventPublic,
  GameSession,
  MatchStats,
  Outcome,
  Player,
  RoundResult,
  StatDelta,
  StatKey,
  Stats,
  Teammate,
  TeammateRole,
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
  FEEL_CAP_DEFAULT,
  FEEL_CAP_MAX,
  FEEL_CAP_MIN,
  FEEL_MAX,
  FEEL_MIN,
  GROWTH_CAP,
  IMPLICIT_FAILURE_STRESS,
  INJURY_REST_ROUNDS,
  LEGEND_FAME_THRESHOLD,
  MAX_ROUNDS,
  PERIPHERAL_PRICES,
  PERIPHERAL_SUCCESS_CHANCE,
  CORE_STAT_KEYS,
  MONEY_MAX,
  POINT_POOL,
  STAGE_ORDER,
  STAT_KEYS,
  STRESS_GRACE_ROUNDS,
  STRESS_MAX,
  STRESS_MIN,
  STRESS_SCALE,
  TEAMMATE_GROWTH_CAP,
  TILT_MAX,
  TILT_MIN,
  growthFactor,
  passiveStressFromMentality,
  fatigueMult,
  stressMult,
  FATIGUE_DELTA_FLOOR_ROUTINE,
  FATIGUE_DELTA_FLOOR_EVENT,
  STRESS_DELTA_FLOOR_ROUTINE,
  STRESS_DELTA_FLOOR_EVENT,
} from './constants.js';
import { buildTournamentPrepEvent, pickEvent, ROLE_STAT_REQUIREMENT, substituteRivals, substituteTeammates, toPublicEvent } from './events.js';
import { checkTournamentPromotion } from './stages.js';
import { applyDelta, applyGrowth, clampStats, makeRng, resolveChoice, stageIndex, translateStatDelta } from './resolver.js';
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

function clampFeel(v: number, feelMax = FEEL_MAX): number {
  return Math.max(FEEL_MIN, Math.min(feelMax, Math.round(v * 2) / 2)); // 0.5 步进
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
    for (const k of CORE_STAT_KEYS) {
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
    const available = CORE_STAT_KEYS.filter((k) => stats[k] < floor[k] + POINT_POOL);
    if (available.length === 0) break;
    const pick = available[Math.floor(Math.random() * available.length)]!;
    stats[pick] += 1;
    remaining -= 1;
  }
  return stats;
}

export function validateAllocation(stats: Stats, floor: Stats): string | null {
  let aboveFloor = 0;
  for (const k of CORE_STAT_KEYS) {
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
    feelCap: FEEL_CAP_DEFAULT,
    peripheralTier: 0,
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
    actionPoints: 100,
    shopCooldowns: {},
    team: null,
    pendingApplication: null,
    pendingOffer: null,
    roster: null,
    preferredRole: deriveRoleFromTraits(traits),
    activeRole: null,
    roleCrystallized: false,
    activeRoleRounds: 0,
    roleTransition: null,
    teamTrust: 0,
    consecutiveLosses: 0,
    everHadTeam: false,
    contractRenewals: 0,
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
  const firstEvent = pickEvent({ player, recentEventIds: [], rng, leaderboard: buildLeaderboard(player) });

  const id = uuid();
  const ts = nowIso();

  return {
    id,
    player,
    currentEvent: firstEvent ? toPublicEvent(firstEvent, player.rivals, player.roster ?? []) : null,
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

  // 奖金分成：签约战队后俱乐部从奖金抽成
  const playerShare = player.team
    ? (PRIZE_SPLIT[player.team.tier] ?? 1.0)
    : 1.0;
  if (player.team && playerShare < 1.0 && statChanges.money) {
    statChanges.money = Math.round((statChanges.money as number) * playerShare);
  }

  // Apply stat changes via translateStatDelta for consistency
  const legacy = translateStatDelta(statChanges);
  let nextStats = { ...player.stats };
  nextStats.money = Math.max(0, Math.min(MONEY_MAX, nextStats.money + legacy.moneyDelta));

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
  if (won && isFinal && t.tier === 'major') tagAdds.push('major-champion');

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

  const eventDef = getEventById(session.currentEvent.id) ??
    // Dynamically-generated prep events aren't in EVENT_POOL — reconstruct from pendingMatch
    (session.currentEvent.id.startsWith('tourney-prep-') && session.player.pendingMatch
      ? buildTournamentPrepEvent(session.player.pendingMatch)
      : null);
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

  const dramaAmplify = (session.player.roster ?? []).some((tm) => tm.personality === 'drama');
  const feelDeltaRaw = dramaAmplify ? outcome.feelDelta * 1.2 : outcome.feelDelta;
  const tiltDeltaRaw = dramaAmplify ? outcome.tiltDelta * 1.2 : outcome.tiltDelta;
  const stressDeltaRaw = dramaAmplify && outcome.chosenOutcome.stressDelta != null
    ? outcome.chosenOutcome.stressDelta * 1.2
    : outcome.chosenOutcome.stressDelta;
  const fameDeltaRaw = dramaAmplify && outcome.chosenOutcome.fameDelta != null
    ? outcome.chosenOutcome.fameDelta * 1.2
    : outcome.chosenOutcome.fameDelta;

  // 体能梯度：高体能减少疲劳增量，仅作用于正值，设下限
  const isRoutine = eventDef.type === 'routine';
  const fatigueDeltaBase = dramaAmplify ? outcome.fatigueDelta * 1.2 : outcome.fatigueDelta;
  let fatigueDeltaRaw = fatigueDeltaBase;
  if (fatigueDeltaBase > 0) {
    const floor = isRoutine ? FATIGUE_DELTA_FLOOR_ROUTINE : FATIGUE_DELTA_FLOOR_EVENT;
    fatigueDeltaRaw = Math.max(
      Math.round(fatigueDeltaBase * fatigueMult(statsAfterGrowth.constitution)),
      floor,
    );
  }

  // 疲劳放大系数（高疲劳时压力增益更强）
  const fatigueFactor =
    volatile.fatigue >= FATIGUE_STRESS_THRESHOLD ? FATIGUE_STRESS_MULTIPLIER : 1;

  // 心态梯度：高心态减少压力增量，仅作用于正值，设下限
  const mentalityFactor = stressMult(statsAfterGrowth.mentality);
  const stressFloor = isRoutine ? STRESS_DELTA_FLOOR_ROUTINE : STRESS_DELTA_FLOOR_EVENT;

  if (typeof stressDeltaRaw === 'number' && stressDeltaRaw !== 0) {
    const raw = stressDeltaRaw * STRESS_SCALE;
    if (raw > 0) {
      stress = clampStress(stress + Math.max(raw * mentalityFactor * fatigueFactor, stressFloor));
    } else {
      stress = clampStress(stress + raw);
    }
  } else if (!outcome.success) {
    stress = clampStress(
      stress + Math.max(IMPLICIT_FAILURE_STRESS * mentalityFactor * fatigueFactor, stressFloor),
    );
    passiveEffects.push('stress-from-failure');
  }
  if (fameDeltaRaw) {
    fame = clampFame(fame + fameDeltaRaw);
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
  const feelCap = session.player.feelCap ?? FEEL_CAP_DEFAULT;
  let feel = clampFeel(volatile.feel + feelDeltaRaw, feelCap);
  let tilt = clampTilt(volatile.tilt + tiltDeltaRaw);
  let fatigue = clampFatigue(volatile.fatigue + fatigueDeltaRaw);

  // Tilt 影响手感：tilt >= 2 → 手感上限降低
  if (tilt >= 2 && feel > 1) feel = clampFeel(feel - 0.5, feelCap);
  // 手感很热但疲劳极高 → 自然衰减
  if (fatigue >= 85 && feel > 0) feel = clampFeel(feel - 1, feelCap);

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

  // 连败追踪（基于本回合赛事结果）
  let consecutiveLosses = session.player.consecutiveLosses ?? 0;
  if (eventDef.id.startsWith('tournament-') && !outcome.success) {
    consecutiveLosses += 1;
  } else if (eventDef.id.startsWith('tournament-') && outcome.success) {
    consecutiveLosses = 0;
  }

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

  // ── 行动力重置（赛事比赛周冻结为 0，面试期间减半）────────────────
  const pm = session.player.pendingMatch;
  const isMatchWeek =
    pm !== null &&
    pm !== undefined &&
    pm.resolveYear === nextYear &&
    pm.resolveWeek === nextWeek;
  const isInterviewPhase = nextTags.includes('interview-pending');
  const nextActionPoints = isMatchWeek ? 0 : isInterviewPhase ? 50 : 100;

  // ── 商店冷却修剪（过期 round 已过）──────────────────────────────
  const nextShopCooldowns: Record<string, number> = {};
  for (const [itemId, until] of Object.entries(session.player.shopCooldowns ?? {})) {
    if (until > nextRound) nextShopCooldowns[itemId] = until;
  }

  const nextTeam = outcome.teamTierSet && session.player.team
    ? { ...session.player.team, tier: outcome.teamTierSet }
    : session.player.team;

  const nextPlayer: Player = {
    ...session.player,
    stats: statsAfterGrowth,
    volatile: { feel, tilt, fatigue },
    buffs,
    growthSpent,
    stage: outcome.stageAfter,
    team: nextTeam,
    round: nextRound,
    tags: nextTags,
    tagExpiry: nextTagExpiry,
    stress,
    fame,
    restRounds,
    stressMaxRounds,
    year: nextYear,
    week: nextWeek,
    actionPoints: nextActionPoints,
    shopCooldowns: nextShopCooldowns,
    consecutiveLosses,
  };

  // 面试事件完成后清空 pendingApplication（response 阶段保留，供面试 post-handler 读取 clubId）
  const CLUB_INTERVIEW_IDS = new Set([
    'chain-club-interview',
    'chain-club-interview-open-match',
    'chain-club-interview-talent',
  ]);
  if (CLUB_INTERVIEW_IDS.has(eventDef.id)) {
    nextPlayer.pendingApplication = null;
  }

  // 周薪入账
  if (nextPlayer.team) {
    nextPlayer.stats.money = Math.min(MONEY_MAX, nextPlayer.stats.money + nextPlayer.team.weeklySalary);
    passiveEffects.push(`周薪入账 +${nextPlayer.team.weeklySalary}K`);
  }

  if (!nextPlayer.team && nextPlayer.roster) {
    nextPlayer.roster = null;
  }

  if (!nextPlayer.team) {
    nextPlayer.activeRole = null;
    nextPlayer.teamTrust = 0;
  }

  if (eventDef.id === 'chain-team-joined' && outcome.success) {
    if (choiceDef.id === 'accept-role' && nextPlayer.roster) {
      const filledRoles = new Set(nextPlayer.roster.map((tm) => tm.role));
      const allRoles: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
      const openRoles = allRoles.filter((r) => !filledRoles.has(r));
      const assigned = openRoles.length > 0
        ? openRoles[Math.floor(rng() * openRoles.length)]!
        : (nextPlayer.preferredRole ?? 'Entry');
      nextPlayer.activeRole = assigned;
      nextPlayer.activeRoleRounds = 0;
    } else if (choiceDef.id === 'stay-flexible') {
      nextPlayer.activeRole = null;
      nextPlayer.activeRoleRounds = 0;
    }
  }

  if (nextPlayer.activeRole) {
    nextPlayer.activeRoleRounds = (nextPlayer.activeRoleRounds ?? 0) + 1;
    if (
      nextPlayer.activeRoleRounds >= 24 &&
      !nextPlayer.roleCrystallized
    ) {
      nextPlayer.preferredRole = nextPlayer.activeRole;
      nextPlayer.roleCrystallized = true;
      passiveEffects.push('角色结晶：你已成为公认的 ' + nextPlayer.activeRole);
    }
  }

  if (eventDef.id === 'chain-role-transition-start') {
    if (choiceDef.id === 'commit-transition' && outcome.success) {
      const allRoles: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
      const eligible = allRoles.filter((r) => {
        if (r === nextPlayer.preferredRole) return false;
        const req = ROLE_STAT_REQUIREMENT[r];
        return req && (nextPlayer.stats[req.stat] ?? 0) >= req.min;
      });
      if (eligible.length > 0) {
        const target = eligible[Math.floor(rng() * eligible.length)]!;
        const resolveRound = nextPlayer.round + 3 + Math.floor(rng() * 3);
        nextPlayer.roleTransition = { targetRole: target, startedRound: nextPlayer.round, resolveRound };
      }
    } else {
      nextPlayer.roleTransition = null;
    }
  }

  if (eventDef.id === 'chain-role-transition-resolve') {
    if (choiceDef.id === 'prove-transition' && outcome.success && nextPlayer.roleTransition) {
      nextPlayer.preferredRole = nextPlayer.roleTransition.targetRole;
      nextPlayer.roleCrystallized = true;
      passiveEffects.push('角色转型成功：你已成为公认的 ' + nextPlayer.roleTransition.targetRole);
    }
    nextPlayer.roleTransition = null;
  }

  const isConflictDeparture =
    eventDef.id === 'chain-team-fired' ||
    (eventDef.id === 'chain-team-conflict' && outcome.chosenOutcome.tagAdds?.includes('bad-blood'));
  const isTeamDeparture =
    isConflictDeparture || eventDef.id === 'chain-contract-renewal';

  if (isTeamDeparture) {
    // bad-blood 仅在冲突性离队时添加，合约到期正常分手不加
    if (isConflictDeparture && !tagsAdded.includes('bad-blood')) tagsAdded.push('bad-blood');

    if (nextPlayer.roster && nextPlayer.roster.length > 0 && rng() < 0.5) {
      if (!tagsAdded.includes('old-teammate-contact')) {
        tagsAdded.push('old-teammate-contact');
        passiveEffects.push('留下了一位前队友的联系方式');
      }
    }

    nextPlayer.roster = null;
  }

  // 队友后台成长
  if (nextPlayer.roster) {
    const growthRng = makeRng(
      hashString(session.id) ^ (nextRound * 1299709),
    );
    nextPlayer.roster = nextPlayer.roster.map((tm) => {
      if (tm.growthSpent >= TEAMMATE_GROWTH_CAP) return tm;
      const statKeys: (keyof typeof tm.stats)[] = ['agility', 'intelligence', 'mentality', 'experience'];
      const key = statKeys[Math.floor(growthRng() * statKeys.length)]!;
      const rawGain = 0.08 + growthRng() * 0.10;
      const applied = rawGain * growthFactor(tm.stats[key]);
      const remainingCap = TEAMMATE_GROWTH_CAP - tm.growthSpent;
      if (remainingCap <= 0) return tm;
      const capped = Math.min(applied, remainingCap);
      return {
        ...tm,
        stats: { ...tm.stats, [key]: tm.stats[key] + capped },
        growthSpent: tm.growthSpent + capped,
      };
    });
  }

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

    // 赛事结果驱动 teamTrust 变动（人格影响速率）
    if (nextPlayer.roster) {
      const trustBase = outcome.success ? 2 : -3;
      const personalityMult = calcTrustRateMultiplier(nextPlayer.roster, rng);
      const trustDelta = Math.round(trustBase * personalityMult);
      nextPlayer.teamTrust = clampTeamTrust(
        (nextPlayer.teamTrust ?? 50) + trustDelta,
      );
      passiveEffects.push(
        outcome.success ? '队伍信任上升' : '队伍信任下降',
      );
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
    return pickEvent({ player: nextPlayer, recentEventIds: recent, rng, leaderboard });
  })();

  result.narrative = substituteRivals(result.narrative, nextPlayer.rivals);
  result.narrative = substituteTeammates(result.narrative, nextPlayer.roster ?? []);
  result.eventTitle = substituteRivals(result.eventTitle, nextPlayer.rivals);
  result.eventTitle = substituteTeammates(result.eventTitle, nextPlayer.roster ?? []);

  const updated: GameSession = {
    ...session,
    player: nextPlayer,
    currentEvent: nextEventDef ? toPublicEvent(nextEventDef, nextPlayer.rivals, nextPlayer.roster ?? []) : null,
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
    const proStages = ['pro', 'star', 'veteran'] as const;
    const semipro = ['second', 'pro', 'star', 'veteran'] as const;
    const isProPlus = proStages.includes(player.stage as typeof proStages[number]);
    const isSemiProPlus = semipro.includes(player.stage as typeof semipro[number]);
    // 草根传奇：全程自由人 + 高名气 + 赢过赛事冠军（开放赛打遍天下）
    if (!player.everHadTeam && (player.fame ?? 0) >= 70 &&
        player.tags.includes('tournament-winner') &&
        isSemiProPlus) {
      return 'free-agent-legend';
    }
    // 忠臣老将：同队 200+ 回合 + 续约 3+ 次
    if (player.team && player.team.joinedRound > 0 &&
        player.round - player.team.joinedRound >= 200 &&
        (player.contractRenewals ?? 0) >= 3) {
      return 'loyal-veteran';
    }
    if (isProPlus && (player.fame ?? 0) >= LEGEND_FAME_THRESHOLD) return 'legend';
    if (isSemiProPlus && player.tags.includes('major-champion')) return 'champion';
    return 'retired_on_top';
  }
  if (player.stage === 'retired') return 'quiet_exit';
  return undefined;
}

export interface ApplyActionResult {
  actionResult: ActionResult;
  player: Player;
}

export function applyAction(
  session: GameSession,
  actionId: string,
): ApplyActionResult {
  if (session.status !== 'active') throw new Error('session is not active');

  const actionDef = getAction(actionId);
  if (!actionDef) throw new Error(`未知行动: ${actionId}`);

  const ap = session.player.actionPoints ?? 0;
  if (ap < actionDef.apCost) throw new Error('行动力不足');

  // 赛事比赛周不允许日常行动
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

  // Build synthetic EventDef + ChoiceDef compatible with resolveChoice
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
    player: session.player,
    event: syntheticEvent as Parameters<typeof resolveChoice>[0]['event'],
    choice: syntheticEvent.choices[0]! as Parameters<typeof resolveChoice>[0]['choice'],
    traits,
    rng,
  });

  const volatile = session.player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const actionFeelCap = session.player.feelCap ?? FEEL_CAP_DEFAULT;
  const feel = clampFeel(volatile.feel + outcome.feelDelta, actionFeelCap);
  const tilt = clampTilt(volatile.tilt + outcome.tiltDelta);
  const fatigue = clampFatigue(volatile.fatigue + outcome.fatigueDelta);

  let stress = session.player.stress ?? 0;
  const explicitStress = outcome.chosenOutcome.stressDelta;
  if (typeof explicitStress === 'number' && explicitStress !== 0) {
    stress = clampStress(stress + explicitStress * STRESS_SCALE);
  }

  let growthSpent = (session.player.growthSpent ?? 0) + outcome.growthApplied;
  if (growthSpent > GROWTH_CAP) growthSpent = GROWTH_CAP;

  // Consume buffs if growth applied
  let buffs: Buff[] = (session.player.buffs ?? []).map((b) => {
    if (
      outcome.growthKey &&
      (b.actionTag === 'all' || b.actionTag === actionDef.eventType) &&
      outcome.growthApplied > 0
    ) {
      return { ...b, remainingUses: b.remainingUses - 1 };
    }
    return b;
  }).filter((b) => b.remainingUses > 0);

  if (outcome.chosenOutcome.buffAdd) {
    buffs = [...buffs, outcome.chosenOutcome.buffAdd];
  }

  const newVolatile = { feel, tilt, fatigue };

  const nextPlayer: Player = {
    ...session.player,
    stats: outcome.nextStats,
    volatile: newVolatile,
    buffs,
    growthSpent,
    stress,
    actionPoints: ap - actionDef.apCost,
  };

  const actionResult: ActionResult = {
    actionId,
    actionLabel: actionDef.label,
    success: outcome.success,
    roll: outcome.roll,
    dc: outcome.dc,
    narrative: outcome.chosenOutcome.narrative,
    feelChange: feel - volatile.feel,
    fatigueChange: fatigue - volatile.fatigue,
    stressChange: stress - (session.player.stress ?? 0),
    growthKey: outcome.growthKey,
    growthAmount: outcome.growthApplied > 0 ? outcome.growthApplied : undefined,
    newStats: outcome.nextStats,
    newVolatile,
  };

  return { actionResult, player: nextPlayer };
}

export interface ApplyShopResult {
  player: Player;
  itemName: string;
  shopNarrative?: string;          // 外设升级结果 或 负面事件文字
  shopNarrativePositive?: boolean; // true=好结果(绿色) false=负面(橙色/红色)
}

export function applyShopPurchase(
  session: GameSession,
  itemId: string,
): ApplyShopResult {
  if (session.status !== 'active') throw new Error('session is not active');

  const item = getShopItem(itemId);
  if (!item) throw new Error(`未知商品: ${itemId}`);

  const player = session.player;
  const round = player.round;

  // Stage check
  if (item.requireStage && !item.requireStage.includes(player.stage)) {
    throw new Error('当前阶段无法购买此商品');
  }

  // Fame check
  if (item.requireFame !== undefined && (player.fame ?? 0) < item.requireFame) {
    throw new Error(`名气不足，需要 ≥ ${item.requireFame}`);
  }

  // Cooldown check
  const cooldownUntil = (player.shopCooldowns ?? {})[itemId] ?? 0;
  if (cooldownUntil > round) {
    throw new Error(`商品冷却中，还需 ${cooldownUntil - round} 回合`);
  }

  if (player.stats.money < item.priceMoney) {
    throw new Error(`资金不足，需要 ${item.priceMoney}K`);
  }

  // ── 外设升级：特殊分支处理 ──────────────────────────────────
  if (itemId === 'pro-peripherals') {
    const tier = player.peripheralTier ?? 0;
    if (tier >= PERIPHERAL_PRICES.length) {
      throw new Error('外设已满级，无法继续升级');
    }
    const price = PERIPHERAL_PRICES[tier]!;
    if (player.stats.money < price) {
      throw new Error(`资金不足，需要 ${price}K`);
    }

    const currentCap = player.feelCap ?? FEEL_CAP_DEFAULT;
    const rng = Math.random();
    const success = rng < PERIPHERAL_SUCCESS_CHANCE;

    let newFeelCap: number;
    let newTier: number;
    let shopNarrative: string;
    let newBuffs = [...(player.buffs ?? [])];

    if (success) {
      newFeelCap = Math.min(currentCap + 0.5, FEEL_CAP_MAX);
      newTier = tier + 1;
      shopNarrative = `外设升级成功！手感上限提升至 ${newFeelCap}`;
      if (newTier >= PERIPHERAL_PRICES.length) {
        // 最高级：授予固定 buff
        newBuffs = newBuffs.filter((b) => b.id !== 'pro-gear');
        newBuffs.push({
          id: 'pro-gear',
          label: '顶级外设',
          actionTag: 'ranked',
          growthKey: 'agility',
          multiplier: 1.2,
          remainingUses: 9999,
        });
        shopNarrative += '，外设已达满级，获得固定增益：天梯敏捷成长 +20%';
      }
    } else {
      newFeelCap = Math.max(currentCap - 0.5, FEEL_CAP_MIN);
      newTier = tier; // 被骗，等级不变，价格不变
      shopNarrative = `买到了山寨货，手感上限反而下降至 ${newFeelCap}`;
    }

    const newStats = { ...player.stats };
    newStats.money = Math.max(0, newStats.money - price);

    const nextPlayer: Player = {
      ...player,
      stats: clampStats(newStats),
      feelCap: newFeelCap,
      peripheralTier: newTier,
      buffs: newBuffs,
    };
    return { player: nextPlayer, itemName: item.name, shopNarrative, shopNarrativePositive: success };
  }

  // ── 普通商品流程 ────────────────────────────────────────────
  const { effect } = item;

  // Apply money cost
  let stats = { ...player.stats };
  stats.money = Math.max(0, stats.money - item.priceMoney);

  // Constitution delta
  if (effect.constitutionDelta) {
    stats.constitution = Math.max(0, Math.min(20, stats.constitution + effect.constitutionDelta));
  }

  stats = clampStats(stats);

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  let feel = volatile.feel;
  let tilt = volatile.tilt;
  let fatigue = volatile.fatigue;

  if (effect.fatigueDelta) fatigue = clampFatigue(fatigue + effect.fatigueDelta);
  if (effect.feelReset) feel = clampFeel(0, player.feelCap ?? FEEL_CAP_DEFAULT);

  let stress = player.stress ?? 0;
  let fame = player.fame ?? 0;
  if (effect.stressDelta) stress = clampStress(stress + effect.stressDelta);
  if (effect.fameDelta) fame = clampFame(fame + effect.fameDelta);

  let buffs = [...(player.buffs ?? [])];
  if (effect.buffAdd) {
    buffs = buffs.filter((b) => b.id !== effect.buffAdd!.id);
    buffs.push(effect.buffAdd);
  }

  // Tag removal / addition
  let tags = [...player.tags];
  if (effect.tagRemove) tags = tags.filter((t) => t !== effect.tagRemove);
  if (effect.tagAdd && !tags.includes(effect.tagAdd)) tags.push(effect.tagAdd);

  // Record cooldown
  const nextShopCooldowns = { ...(player.shopCooldowns ?? {}) };
  if (item.cooldownRounds > 0) {
    nextShopCooldowns[itemId] = round + item.cooldownRounds;
  }

  // ── 负面事件随机触发（功能1：team-dinner / fan-meetup）──
  let shopNarrative: string | undefined;
  if (item.negativeEvents) {
    for (const neg of item.negativeEvents) {
      if (Math.random() < neg.chance) {
        if (neg.effect.stressDelta) stress = clampStress(stress + neg.effect.stressDelta);
        if (neg.effect.fatigueDelta) fatigue = clampFatigue(fatigue + neg.effect.fatigueDelta);
        if (neg.effect.fameDelta) fame = clampFame(fame + neg.effect.fameDelta);
        if (neg.effect.tagAdd && !tags.includes(neg.effect.tagAdd)) tags.push(neg.effect.tagAdd);
        if (neg.effect.tagRemove) tags = tags.filter((t) => t !== neg.effect.tagRemove);
        shopNarrative = neg.narrative;
        break; // 每次最多触发一个负面事件
      }
    }
  }

  const nextPlayer: Player = {
    ...player,
    stats,
    volatile: { feel, tilt, fatigue },
    buffs,
    stress,
    fame,
    tags,
    shopCooldowns: nextShopCooldowns,
  };

  return {
    player: nextPlayer,
    itemName: item.name,
    shopNarrative,
    shopNarrativePositive: shopNarrative ? false : undefined,
  };
}

// ── 战队申请 ──────────────────────────────────────────────────
import type { ClubTier, PendingApplication, PlayerTeam, Stage, TeamOffer } from '../types.js';

export function applyClubRequest(
  session: GameSession,
  clubId: string,
): Player {
  if (session.status !== 'active') throw new Error('session is not active');
  const club = getClub(clubId);
  if (!club) throw new Error('未知俱乐部');

  const player = session.player;
  if (player.team) throw new Error('你已经有战队了');
  if (player.pendingApplication) throw new Error('已经有一个进行中的申请');

  const stageOrder = ['rookie', 'youth', 'second', 'pro', 'star', 'veteran', 'retired'];
  // Rookie 申请 youth 档俱乐部时跳过阶段门槛，后续的 Rookie 专属资格检查会接管
  const isRookieApplyingToYouth = player.stage === 'rookie' && club.requiredStage === 'youth';
  if (!isRookieApplyingToYouth && stageOrder.indexOf(player.stage) < stageOrder.indexOf(club.requiredStage)) {
    throw new Error('当前阶段不满足该俱乐部的门槛');
  }
  if (club.requiredFame !== undefined && (player.fame ?? 0) < club.requiredFame) {
    throw new Error(`名气不足，需要 ≥ ${club.requiredFame}`);
  }

  const ap = player.actionPoints ?? 0;
  if (ap < 25) throw new Error('行动力不足');

  // Rookie-specific eligibility: must have proven themselves before clubs will respond.
  // Path A: 3+ open-match participations (netcafe/city/platform) AND 1+ championship.
  // Path B: holds 枪法天才 (aimer trait tag); 天赋之子 reserved for future trait 'prodigy'.
  let pathTag: 'application-path-open-match' | 'application-path-talent' | null = null;
  if (player.stage === 'rookie') {
    const tp = player.tierParticipations ?? {};
    const tc = player.tierChampionships ?? {};
    const openParticipations = (tp['netcafe'] ?? 0) + (tp['city'] ?? 0) + (tp['platform'] ?? 0);
    const openChampionships = (tc['netcafe'] ?? 0) + (tc['city'] ?? 0) + (tc['platform'] ?? 0);
    const hasOpenMatchPath = openParticipations >= 3 && openChampionships >= 1;

    const traitTags = player.traits.flatMap((id) => getTrait(id)?.tags ?? []);
    const hasTalentPath = traitTags.includes('aimer'); // 'prodigy' reserved for 天赋之子

    if (!hasOpenMatchPath && !hasTalentPath) {
      throw new Error(
        '需要先在公开赛积累经验（参赛 ≥ 3 场 + 夺冠 ≥ 1 次），或拥有枪法天才特质',
      );
    }
    pathTag = hasOpenMatchPath ? 'application-path-open-match' : 'application-path-talent';
  }

  const responseDelay = 2 + Math.floor(Math.random() * 3); // 2-4 回合
  const pending: PendingApplication = {
    clubId,
    clubName: club.name,
    appliedRound: player.round,
    responseRound: player.round + responseDelay,
  };

  const nextTags = dedupe([...player.tags, 'applying']);
  if (pathTag && !nextTags.includes(pathTag)) nextTags.push(pathTag);

  return {
    ...player,
    actionPoints: ap - 25,
    pendingApplication: pending,
    tags: nextTags,
  };
}

export function respondTeamOffer(
  session: GameSession,
  accept: boolean,
): Player {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  const offer = player.pendingOffer;
  if (!offer) throw new Error('没有待处理的入队邀请');

  if (accept) {
    const team: PlayerTeam = {
      clubId: offer.clubId,
      name: offer.clubName,
      tag: offer.tag,
      region: offer.region,
      tier: offer.tier,
      weeklySalary: offer.weeklySalary,
      joinedRound: player.round,
    };

    // Advance stage to match the minimum required by the new team's tier.
    const TIER_MIN_STAGE: Record<ClubTier, Stage> = {
      youth: 'youth',
      'semi-pro': 'second',
      pro: 'pro',
      top: 'star',
    };
    const minStage = TIER_MIN_STAGE[offer.tier];
    const nextStage = stageIndex(minStage) > stageIndex(player.stage) ? minStage : player.stage;

    const rosterRng = makeRng(hashString(session.id) ^ (player.round * 7919));
    const roster = generateRoster(offer.tier, rosterRng);

    return {
      ...player,
      team,
      stage: nextStage,
      everHadTeam: true,
      pendingOffer: null,
      pendingApplication: null,
      roster,
      teamTrust: 40,
      tags: player.tags.filter((t) => t !== 'applying' && t !== 'interview-pending'),
    };
  } else {
    // Add 10-round cooldown so the same poach event doesn't re-trigger immediately
    const cooldownTag = 'poach-cd';
    const nextTagExpiry = { ...(player.tagExpiry ?? {}), [cooldownTag]: player.round + 10 };
    const cleanedTags = player.tags.filter((t) => t !== 'applying' && t !== 'interview-pending');
    const nextTags = cleanedTags.includes(cooldownTag) ? cleanedTags : [...cleanedTags, cooldownTag];
    return {
      ...player,
      pendingOffer: null,
      pendingApplication: null,
      tags: nextTags,
      tagExpiry: nextTagExpiry,
    };
  }
}

export function generateTeamOffer(clubId: string): TeamOffer {
  const club = getClub(clubId);
  if (!club) throw new Error('未知俱乐部');

  const [min, max] = club.salaryRange;
  const salary = min + Math.floor(Math.random() * (max - min + 1));

  return {
    clubId: club.id,
    clubName: club.name,
    tag: club.tag,
    tier: club.tier,
    region: club.region,
    weeklySalary: salary,
  };
}

// Expose ACTIONS and SHOP_ITEMS for routes
export { ACTIONS, SHOP_ITEMS };

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

function deriveRoleFromTraits(traits: Trait[]): TeammateRole | null {
  const tags = new Set(traits.flatMap((t) => t.tags));
  if (tags.has('igl')) return 'IGL';
  if (tags.has('aimer')) return 'AWPer';
  if (tags.has('mechanical')) return 'Entry';
  if (tags.has('support') || tags.has('selfless')) return 'Support';
  if (tags.has('tactical') && tags.has('solo')) return 'Lurker';
  return null;
}

function clampTeamTrust(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function calcTrustRateMultiplier(roster: Teammate[], rng: () => number): number {
  const counts: Record<string, number> = {};
  for (const tm of roster) {
    counts[tm.personality] = (counts[tm.personality] ?? 0) + 1;
  }
  let mult = 1;
  if (counts.strict) mult *= 0.7;
  if (counts.supportive) mult *= 1.3;
  if (counts.drama) mult *= (0.7 + rng() * 0.6);
  return mult;
}

