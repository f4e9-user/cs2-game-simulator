import { DEFAULT_BACKGROUND_ID, getBackground } from '../data/backgrounds.js';
import {
  type Tournament,
  getTournament,
  stageRewardDelta,
  synthesizeMatchEvent,
} from '../data/tournaments.js';
import { generateRivals } from '../data/rivals.js';
import { generateRoster, generateSingleTeammate } from '../data/roster.js';
import {
  addPlayerPoints,
  buildLeaderboard,
  tickLeaderboard,
} from '../data/leaderboard.js';
import { getEventById } from '../data/events/index.js';
import { TRAITS, getTrait } from '../data/traits.js';
import { ACTIONS, getAction, type ActionDef, type ComboConsume } from '../data/actions.js';
import { getShopItem, SHOP_ITEMS, type ShopCategory } from '../data/shop.js';
import { CLUBS, getClub, clubsForStage, PRIZE_SPLIT } from '../data/clubs.js';
import type {
  ActionResult,
  Buff,
  ChoiceDef,
  Club,
  ClubTier,
  EventDef,
  GameEventPublic,
  GameSession,
  Loan,
  MatchStats,
  Outcome,
  PendingApplication,
  PendingDeparture,
  Player,
  PlayerTeam,
  RoundCombo,
  RoundResult,
  Stage,
  StatDelta,
  StatKey,
  Stats,
  Teammate,
  TeammateRole,
  TeamActionResult,
  TeamOffer,
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
  POINT_POOL,
  STAGE_ORDER,
  STAT_KEYS,
  STRESS_GRACE_ROUNDS,
  STRESS_MAX,
  STRESS_MIN,
  TEAMMATE_GROWTH_CAP,
  TILT_MAX,
  TILT_MIN,
  growthFactor,
  passiveStressFromMentality,
} from './constants.js';
import { buildTournamentPrepEvent, pickEvent, ROLE_STAT_REQUIREMENT, substituteRivals, substituteTeammates, toPublicEvent } from './events.js';
import { checkTournamentPromotion } from './stages.js';
import {
  applyDelta,
  applyGrowth,
  clampStats,
  makeRng,
  outcomeEffects,
  outcomeProgression,
  outcomeResourceDelta,
  outcomeStateDelta,
  outcomeTags,
  resolveChoice,
  stageIndex,
  translateStatDelta,
} from './resolver.js';
import { type MatchSimResult, simulateMatch } from './matchSimulator.js';
import { applyStateDeltaModifiers, consumeTriggeredBuffs } from './stateModifiers.js';
import { applyMoneyDeltaToStats, applyMoneyTransaction } from './money.js';
import {
  addQualificationRewardsByOwnerWithExpiry,
  clearTeamQualifications,
  defaultQualificationExpiry,
  expireQualificationBatches,
  formatQualificationRewards,
  normalizeQualificationBatches,
} from './qualification.js';

const WEEKLY_SHOP_LIMITS: Partial<Record<ShopCategory, number>> = {
  consumable: 2,
  service: 1,
};

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

export function applyForLoan(player: Player, amount: number): { success: boolean; message?: string; loan?: Loan } {
  if (!Number.isInteger(amount) || amount < 20 || amount > 100) {
    return { success: false, message: '借款金额必须是 20K 到 100K 的整数' };
  }
  if (player.stage === 'rookie') {
    return { success: false, message: '至少进入青训阶段后才能申请贷款' };
  }
  if ((player.creditScore ?? 100) < 50) {
    return { success: false, message: '信用值过低（< 50），银行拒绝贷款申请' };
  }
  const hasActiveBankLoan = (player.loans ?? []).some((l) => (l.source ?? 'bank') === 'bank' && !l.paid && !l.defaulted);
  if (hasActiveBankLoan) {
    return { success: false, message: '已有未结清银行贷款，不能重复借款' };
  }

  const loan: Loan = {
    id: uuid(),
    source: 'bank',
    principal: amount,
    interestRate: 0.10,
    remainingPrincipal: amount,
    issuedRound: player.round,
    dueRound: player.round + 12,
    paid: false,
    defaulted: false,
  };

  player.loans = [...(player.loans ?? []), loan];
  applyMoneyTransaction(player, amount);

  return { success: true, loan };
}

export function applyFriendLoan(player: Player, amount: number): { success: boolean; message?: string; loan?: Loan } {
  if (!Number.isInteger(amount) || amount < 10 || amount > 30) {
    return { success: false, message: '朋友借款金额必须是 10K 到 30K 的整数' };
  }
  if (player.stage === 'rookie') {
    return { success: false, message: '至少进入青训阶段后才能向朋友借款' };
  }
  if ((player.creditScore ?? 100) < 50) {
    return { success: false, message: '信用值过低（< 50），朋友已无力再借钱给你了' };
  }
  const hasActiveFriendLoan = (player.loans ?? []).some((l) => l.source === 'friend' && !l.paid && !l.defaulted);
  if (hasActiveFriendLoan) {
    return { success: false, message: '已有未还清的朋友借款，不能再借' };
  }

  const loan: Loan = {
    id: uuid(),
    source: 'friend',
    principal: amount,
    interestRate: 0,
    remainingPrincipal: amount,
    issuedRound: player.round,
    dueRound: player.round + 8,
    paid: false,
    defaulted: false,
  };

  player.loans = [...(player.loans ?? []), loan];
  applyMoneyTransaction(player, amount);

  return { success: true, loan };
}

export function processLoanRepayment(player: Player, effects?: string[]): void {
  const activeLoans = (player.loans ?? []).filter((loan) => !loan.paid && !loan.defaulted);

  // Sort by dueRound ascending so earliest-due loans are repaid first
  const dueLoans = activeLoans
    .filter((loan) => player.round >= loan.dueRound)
    .sort((a, b) => a.dueRound - b.dueRound);

  for (const loan of dueLoans) {
    const totalDue = Math.floor(loan.remainingPrincipal * (1 + loan.interestRate));
    const loanSource = loan.source ?? 'bank';
    if (player.stats.money >= totalDue) {
      applyMoneyTransaction(player, -totalDue);
      loan.paid = true;
      loan.remainingPrincipal = 0;
      const label = loanSource === 'friend' ? '朋友借款已还清' : '贷款还款';
      effects?.push(`${label} -${totalDue}K`);
    } else {
      loan.defaulted = true;
      if (loanSource === 'friend') {
        player.creditScore = Math.max(0, (player.creditScore ?? 100) - 15);
        effects?.push('朋友借款违约！信用值-15，关系受损');
      } else {
        player.fame = Math.max(0, (player.fame ?? 0) - 10);
        player.creditScore = Math.max(0, (player.creditScore ?? 100) - 20);
        if (!player.tags.includes('loan-default')) player.tags.push('loan-default');
        if (!player.tags.includes('transfer-ban')) player.tags.push('transfer-ban');
        player.tagExpiry = {
          ...(player.tagExpiry ?? {}),
          'transfer-ban': player.round + 12,
        };
        effects?.push('贷款违约！名气-10，信用值-20，转会禁止12回合');
      }
    }
  }
}

function processRecoverySystems(player: Player, eventId: string, effects?: string[], choiceDef?: ChoiceDef): void {
  processLoanRepayment(player, effects);

  const isTeamBailout = eventId.startsWith('bailout-team-');
  const isFamilyBailout = !isTeamBailout && eventId.startsWith('bailout-');
  const isRefusal = choiceDef?.isRefusal ?? false;

  if (isTeamBailout) {
    player.teamBailoutCooldown = isRefusal ? 5 : 24;
    if (!isRefusal) player.consecutiveBrokeRounds = 0;
  } else if (isFamilyBailout) {
    player.bailoutCooldown = isRefusal ? 5 : 24;
    if (!isRefusal) {
      player.consecutiveBrokeRounds = 0;
      // 跟踪家人援助次数（老朋友救济单独扣信用值）
      if (eventId === 'bailout-old-friend') {
        player.creditScore = Math.max(0, (player.creditScore ?? 100) - 5);
      } else {
        player.familyBailoutCount = (player.familyBailoutCount ?? 0) + 1;
      }
    }
  }

  if (!isFamilyBailout && (player.bailoutCooldown ?? 0) > 0) {
    player.bailoutCooldown -= 1;
  }

  if (!isTeamBailout && (player.teamBailoutCooldown ?? 0) > 0) {
    player.teamBailoutCooldown -= 1;
  }

  // 家人危机：到达截止回合时自动扣款结清
  if (player.pendingFamilyCrisis && player.round >= player.pendingFamilyCrisis.deadlineRound) {
    const crisis = player.pendingFamilyCrisis;
    if (player.stats.money >= crisis.amountNeeded) {
      applyMoneyTransaction(player, -crisis.amountNeeded);
      player.pendingFamilyCrisis = undefined;
      player.creditScore = Math.min(100, (player.creditScore ?? 100) + 10);
      if (!player.tagExpiry) player.tagExpiry = {};
      player.tagExpiry['family-crisis-cd'] = Number.MAX_SAFE_INTEGER;
      effects?.push(`家人手术费到位 -${crisis.amountNeeded}K（危机解除，信用值+10）`);
    }
    // 如果钱不够，checkEnding 会处理生涯结束
  }
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
    weeklyShopPurchases: {},
    weeklyTeamActions: {},
    team: null,
    pendingApplication: null,
    qualificationSlots: {},
    teamQualificationSlots: {},
    qualificationSlotBatches: [],
    teamQualificationSlotBatches: [],
    forceNextEvent: null,
    forceMatchResult: null,
    bailoutCooldown: 0,
    teamBailoutCooldown: 0,
    consecutiveBrokeRounds: 0,
    creditScore: 100,
    familyBailoutCount: 0,
    pendingOffer: null,
    ownedItems: [],
    loans: [],
    salaryTracker: null,
    pawnedItemIds: [],
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
    roundCombos: [],
  };
}

const TEAM_ACTION_LIMITS: Record<string, number> = {
  'team-meeting': 1,
  'locker-room-talk': 1,
};
const TEAM_PRACTICE_AP_COST = 25;
const TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT = 2;
const TEAM_MEETING_AP_COST = 30;
const LOCKER_ROOM_TALK_AP_COST = 25;

function isCurrentMatchWeek(player: Player): boolean {
  const pm = player.pendingMatch;
  return !!pm && pm.resolveYear === (player.year ?? 1) && pm.resolveWeek === (player.week ?? 1);
}

function teamActionRecordCurrent(
  player: Player,
  key: string,
): { year: number; week: number; count: number } | undefined {
  const record = (player.weeklyTeamActions ?? {})[key];
  if (!record) return undefined;
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  return record.year === year && record.week === week ? record : undefined;
}

function weeklyTeamActionCount(player: Player, key: string): number {
  return teamActionRecordCurrent(player, key)?.count ?? 0;
}

function weeklyPracticeTotal(player: Player): number {
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  return Object.entries(player.weeklyTeamActions ?? {})
    .filter(([key, record]) => key.startsWith('practice:') && record.year === year && record.week === week)
    .reduce((sum, [, record]) => sum + record.count, 0);
}

function bumpWeeklyTeamAction(player: Player, key: string): Record<string, { year: number; week: number; count: number }> {
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  const current = teamActionRecordCurrent(player, key);
  return {
    ...(player.weeklyTeamActions ?? {}),
    [key]: { year, week, count: (current?.count ?? 0) + 1 },
  };
}

function assertTeamActionAvailable(player: Player, apCost: number): void {
  if (!player.team || !player.roster || player.roster.length === 0) {
    throw new Error('当前没有可管理的战队阵容');
  }
  if ((player.actionPoints ?? 0) < apCost) throw new Error('行动力不足');
  if (isCurrentMatchWeek(player)) throw new Error('赛事比赛周无法进行队伍管理');
}

function teammateAverage(tm: Teammate): number {
  return (tm.stats.agility + tm.stats.intelligence + tm.stats.mentality + tm.stats.experience) / 4;
}

function primaryStatForRole(role: TeammateRole): keyof Teammate['stats'] {
  if (role === 'IGL' || role === 'Lurker') return 'intelligence';
  if (role === 'Support') return 'mentality';
  return 'agility';
}

function teammateStatLabel(stat: keyof Teammate['stats']): string {
  if (stat === 'agility') return '敏捷';
  if (stat === 'intelligence') return '智力';
  if (stat === 'mentality') return '心态';
  return '经验';
}

function statBonusForTeamAction(value: number, coefficient = 1.5): number {
  return Math.round(Math.sqrt(Math.max(0, value) * 10) * coefficient);
}

function rollTeamAction(
  player: Player,
  primary: StatKey,
  secondary: StatKey | undefined,
  dc: number,
  seed: string,
): { success: boolean; roll: number; dc: number; naturalRoll: number } {
  const rng = makeRng(hashString(seed));
  const naturalRoll = 1 + Math.floor(rng() * 20);
  const primaryValue = primary === 'money' ? Math.round(player.stats.money / 2) : player.stats[primary];
  const secondaryValue = secondary
    ? secondary === 'money'
      ? Math.round(player.stats.money / 2)
      : player.stats[secondary]
    : 0;
  const roll = naturalRoll + statBonusForTeamAction(primaryValue) + statBonusForTeamAction(secondaryValue, 0.75);
  return { success: naturalRoll === 20 || (naturalRoll !== 1 && roll >= dc), roll, dc, naturalRoll };
}

function applyTeammateGrowth(tm: Teammate, stat: keyof Teammate['stats'], amount: number): Teammate {
  const remaining = Math.max(0, TEAMMATE_GROWTH_CAP - (tm.growthSpent ?? 0));
  if (remaining <= 0 || amount <= 0) return tm;
  const applied = Math.min(amount, remaining);
  return {
    ...tm,
    stats: {
      ...tm.stats,
      [stat]: Math.round((tm.stats[stat] + applied) * 10) / 10,
    },
    growthSpent: Math.round(((tm.growthSpent ?? 0) + applied) * 10) / 10,
  };
}

function advanceWeek(year: number, week: number): { year: number; week: number } {
  const WEEKS = 48;
  if (week >= WEEKS) return { year: year + 1, week: 1 };
  return { year, week: week + 1 };
}

function settleSalaryOnDeparture(player: Player): number {
  if (!player.salaryTracker || !player.team) return 0;
  const weeksServed = Math.max(0, player.round - player.salaryTracker.lastPayRound);
  const settlement = Math.floor(
    (player.team.monthlySalary * weeksServed) / player.salaryTracker.payCycle,
  );
  if (settlement > 0) {
    applyMoneyTransaction(player, settlement);
  }
  player.salaryTracker = null;
  return settlement;
}

export function weekToMonth(week: number): number {
  return Math.min(12, Math.max(1, Math.ceil(week / 4)));
}

export function createSession(player: Player, rngSeed: number): GameSession {
  const rng = makeRng(rngSeed);
  const firstEvent = pickEvent({ player, recentEventIds: [], rng, leaderboard: buildLeaderboard(player) });

  const id = uuid();
  const apiToken = uuid();
  const ts = nowIso();

  return {
    id,
    apiToken,
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
interface MatchReward {
  money: number;
  experience: number;
}

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
  const winReward: MatchReward = isFinal
    ? { money: r.money, experience: r.experience }
    : { money: Math.max(0, Math.floor(r.money / 4)), experience: Math.max(1, Math.floor(r.experience / 4)) };
  const lossReward: MatchReward = {
    money: Math.max(0, Math.floor(r.money * lossShare)),
    experience: Math.max(1, Math.floor(r.experience * lossShare)),
  };
  const winFame = isFinal ? r.fame : Math.floor(r.fame / 5);
  const lossFame = Math.floor(r.fame * lossShare);
  // Win a final still costs stress at high tiers; loss is always stressful.
  const winStressDelta = isFinal ? (r.stressDelta ?? 0) * 5 : 0;
  const lossStressDelta = ((r.stressDelta ?? 1) + 2) * 5;

  // 奖金分成：签约战队后俱乐部从奖金抽成
  const playerShare = player.team
    ? (PRIZE_SPLIT[player.team.tier] ?? 1.0)
    : 1.0;
  const rawMoney = won ? (winReward.money ?? 0) : (lossReward.money ?? 0);
  const moneyDelta = player.team && playerShare < 1.0
    ? Math.round(rawMoney * playerShare)
    : rawMoney;

  // Apply stat changes via translateStatDelta for consistency
  const legacy = translateStatDelta({
    experience: won ? (winReward.experience ?? 0) : (lossReward.experience ?? 0),
  });
  let nextStats = { ...player.stats };
  nextStats = applyMoneyDeltaToStats(nextStats, moneyDelta);

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
    coreGrowth: {
      experience: won ? (winReward.experience ?? 0) : (lossReward.experience ?? 0),
    },
    stateDelta: {
      feel: sim.feelDelta,
      tilt: sim.tiltDelta,
      fatigue: sim.fatigueDelta,
      stress: won ? winStressDelta : lossStressDelta,
    },
    resourceDelta: {
      fame: won ? winFame : lossFame,
    },
    tags: {
      add: tagAdds,
    },
  };

  // roll = rating×100 for display; dc = enemy aim proxy
  const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
  const enemyAimProxy = Math.max(20, Math.min(90, 25 + effectiveDiff * 8));

  return {
    success: won,
    resultTier: won ? 'success' : 'failure',
    roll: Math.round(sim.rating * 100),
    dc: enemyAimProxy,
    naturalRoll: Math.round(sim.rating * 100),
    chosenOutcome,
    nextStats,
    stageAfter: player.stage,
    tagsAdded: tagAdds,
    tagsRemoved: [],
    endRun: false,
    endReason: undefined,
    feelDelta: sim.feelDelta,
    tiltDelta: sim.tiltDelta,
    fatigueDelta: sim.fatigueDelta,
    moneyDelta,
    growthApplied,
    growthKey,
  };
}

function applyForcedMatchResult(sim: MatchSimResult, forcedResult: 'win' | 'loss'): MatchSimResult {
  if ((forcedResult === 'win') === sim.won) {
    return {
      ...sim,
      summary: `调试强制${forcedResult === 'win' ? '胜利' : '失利'}：${sim.summary}`,
    };
  }

  if (forcedResult === 'win') {
    return {
      ...sim,
      won: true,
      teamScore: Math.max(13, sim.teamScore),
      enemyScore: Math.min(12, sim.enemyScore),
      summary: `调试强制胜利：${sim.summary}`,
    };
  }

  return {
    ...sim,
    won: false,
    teamScore: Math.min(12, sim.teamScore),
    enemyScore: Math.max(13, sim.enemyScore),
    summary: `调试强制失利：${sim.summary}`,
  };
}

export interface ApplyChoiceResult {
  session: GameSession;
  result: RoundResult;
}

export function applyChoice(
  session: GameSession,
  choiceId: string,
  rollBonus = 0,
  aiEvents?: EventDef[],
): ApplyChoiceResult {
  if (session.status !== 'active') throw new Error('session is not active');
  if (!session.currentEvent) throw new Error('no pending event on this session');

  const eventDef = getEventById(session.currentEvent.id) ??
    aiEvents?.find((e) => e.id === session.currentEvent!.id) ??
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
        if (session.player.forceMatchResult) {
          pendingMatchSim = applyForcedMatchResult(pendingMatchSim, session.player.forceMatchResult);
        }
        return buildMatchResolveResult(session.player, pendingMatchSim, t, stageIdx);
      }
    }
    return resolveChoice({
      player: session.player,
      event: eventDef,
      choice: choiceDef,
      traits,
      rng,
      rollBonus,
    });
  })();

  const chosenStateDelta = outcomeStateDelta(outcome.chosenOutcome);
  const chosenResourceDelta = outcomeResourceDelta(outcome.chosenOutcome);
  const chosenProgression = outcomeProgression(outcome.chosenOutcome);
  const chosenTags = outcomeTags(outcome.chosenOutcome);
  const chosenEffects = outcomeEffects(outcome.chosenOutcome);

  const stageBefore = session.player.stage;
  const wasBroke = session.player.stats.money <= 0;

  // ── 核心属性（resolver 已应用成长）──
  let statsAfterGrowth = outcome.nextStats;
  const passiveEffects: string[] = [];
  const qualificationChanges: string[] = [];
  const tagsAdded = [...outcome.tagsAdded];
  const tagsRemoved = [...outcome.tagsRemoved];

  // ── 成长上限更新 ──
  let growthSpent = (session.player.growthSpent ?? 0) + outcome.growthApplied;
  if (growthSpent > GROWTH_CAP) growthSpent = GROWTH_CAP;

  const existingBuffs = session.player.buffs ?? [];

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
  const stressDeltaRaw = dramaAmplify && chosenStateDelta.stress !== 0
    ? chosenStateDelta.stress * 1.2
    : chosenStateDelta.stress;
  const fameDeltaRaw = dramaAmplify && chosenResourceDelta.fame !== 0
    ? chosenResourceDelta.fame * 1.2
    : chosenResourceDelta.fame;

  const stateContext = {
    actionTag: eventDef.type,
    source: eventDef.type === 'routine'
      ? 'routine' as const
      : eventDef.type === 'match'
        ? 'match' as const
        : 'event' as const,
  };
  const fatigueDeltaBase = dramaAmplify ? outcome.fatigueDelta * 1.2 : outcome.fatigueDelta;
  let stressDeltaBase = 0;
  let stressFromFailure = false;
  if (typeof stressDeltaRaw === 'number' && stressDeltaRaw !== 0) {
    stressDeltaBase = stressDeltaRaw;
  } else if (!outcome.success) {
    stressDeltaBase = IMPLICIT_FAILURE_STRESS;
    stressFromFailure = true;
  }

  const modifierPlayer = { ...session.player, stats: statsAfterGrowth, buffs: existingBuffs };
  const modifiedState = applyStateDeltaModifiers(
    modifierPlayer,
    { fatigueDelta: fatigueDeltaBase, stressDelta: stressDeltaBase },
    stateContext,
  );
  passiveEffects.push(...modifiedState.passiveEffects);
  const fatigueDeltaRaw = modifiedState.fatigueDelta;
  if (stressDeltaBase !== 0) {
    stress = clampStress(stress + modifiedState.stressDelta);
  }
  if (stressFromFailure) {
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
    const brokeState = applyStateDeltaModifiers(
      modifierPlayer,
      { fatigueDelta: 0, stressDelta: brokeStressBump },
      { actionTag: 'life', source: 'event' },
    );
    stress = clampStress(stress + brokeState.stressDelta);
    passiveEffects.push(...brokeState.passiveEffects);
    modifiedState.stressReduced = modifiedState.stressReduced || brokeState.stressReduced;
    passiveEffects.push('stress-from-broke');
  }

  let buffs: Buff[] = consumeTriggeredBuffs(existingBuffs, stateContext, {
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

  // ── 状态系统更新（feel / tilt / fatigue）──
  const feelCap = session.player.feelCap ?? FEEL_CAP_DEFAULT;
  let feel = clampFeel(volatile.feel + feelDeltaRaw, feelCap);
  let tilt = clampTilt(volatile.tilt + tiltDeltaRaw);
  let fatigue = clampFatigue(volatile.fatigue + fatigueDeltaRaw);

  // Tilt 影响手感：tilt >= 2 → 手感上限降低
  if (tilt >= 2 && feel > 1) feel = clampFeel(feel - 0.5, feelCap);
  // 手感很热但疲劳极高 → 自然衰减
  if (fatigue >= 85 && feel > 0) feel = clampFeel(feel - 1, feelCap);

  // ── 大成功 / 大失败 附加效果 ──
  if (outcome.resultTier === 'critical_success') {
    feel = clampFeel(feel + 1, feelCap);
    stress = clampStress(stress - 5);
    passiveEffects.push('critical-success-bonus');
  } else if (outcome.resultTier === 'critical_failure') {
    feel = clampFeel(feel - 1, feelCap);
    stress = clampStress(stress + 10);
    passiveEffects.push('critical-failure-penalty');
  }

  const feelChange = feel - volatile.feel;
  const tiltChange = tilt - volatile.tilt;
  const fatigueChange = fatigue - volatile.fatigue;

  // ── 受伤/强制休养 ──
  let restRounds = session.player.restRounds ?? 0;
  if (chosenProgression.injuryRestRounds && chosenProgression.injuryRestRounds > 0) {
    restRounds = Math.max(restRounds, chosenProgression.injuryRestRounds);
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

  // 破产连续轮次追踪：用于家人救济事件触发
  let consecutiveBrokeRounds = session.player.consecutiveBrokeRounds ?? 0;
  if (statsAfterGrowth.money <= 0) {
    consecutiveBrokeRounds += 1;
  } else {
    consecutiveBrokeRounds = 0;
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
  const newCooldowns = chosenTags.cooldowns;
  for (const [tag, duration] of Object.entries(newCooldowns)) {
    if (!nextTags.includes(tag)) nextTags.push(tag);
    nextTagExpiry[tag] = nextRound + duration;
  }

  const { year: nextYear, week: nextWeek } = advanceWeek(
    session.player.year ?? 1,
    session.player.week ?? 1,
  );

  const fallbackQualificationExpiry = defaultQualificationExpiry(nextYear, nextWeek);
  const normalizedPlayerQualifications = normalizeQualificationBatches(
    session.player.qualificationSlots ?? {},
    session.player.qualificationSlotBatches,
    fallbackQualificationExpiry,
  );
  const normalizedTeamQualifications = normalizeQualificationBatches(
    session.player.teamQualificationSlots ?? {},
    session.player.teamQualificationSlotBatches,
    fallbackQualificationExpiry,
  );
  const activePlayerQualifications = expireQualificationBatches(
    normalizedPlayerQualifications.batches,
    { year: nextYear, week: nextWeek },
  );
  const activeTeamQualifications = expireQualificationBatches(
    normalizedTeamQualifications.batches,
    { year: nextYear, week: nextWeek },
  );
  let nextQualificationSlots = activePlayerQualifications.slots;
  let nextTeamQualificationSlots = activeTeamQualifications.slots;
  let nextQualificationSlotBatches = activePlayerQualifications.batches;
  let nextTeamQualificationSlotBatches = activeTeamQualifications.batches;
  const expiredQualificationCount =
    activePlayerQualifications.expiredCount + activeTeamQualifications.expiredCount;
  if (expiredQualificationCount > 0) {
    qualificationChanges.push(`资格过期：失去 ${expiredQualificationCount} 张资格门票`);
  }

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

  let nextPlayer: Player = {
    ...session.player,
    stats: statsAfterGrowth,
    volatile: { feel, tilt, fatigue },
    buffs,
    growthSpent,
    stage: outcome.stageAfter,
    team: session.player.team,
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
    roundCombos: [],
    shopCooldowns: nextShopCooldowns,
    qualificationSlots: nextQualificationSlots,
    teamQualificationSlots: nextTeamQualificationSlots,
    qualificationSlotBatches: nextQualificationSlotBatches,
    teamQualificationSlotBatches: nextTeamQualificationSlotBatches,
    consecutiveLosses,
    consecutiveBrokeRounds,
  };

  if (eventDef.id.startsWith('promotion-') && outcome.success && outcome.teamTierSet) {
    const promotedClub = pickPromotionClub(outcome.teamTierSet, session.id, nextRound);
    if (promotedClub) {
      const offer = generateTeamOffer(promotedClub.id);
      nextPlayer = joinTeamFromOffer(
        session,
        { ...nextPlayer, pendingOffer: offer },
        offer,
        { contractDispute: false },
      );
      passiveEffects.push(`签约 ${offer.clubName}`);
    }
  }

  // ── 明星/老将 tag 检查与首次获得奖励 ─────────────────────────────
  // veteran tag：顶级赛事（s-main/major）累计参加 4 场即可获得
  const topParticipations =
    (nextPlayer.tierParticipations?.['s-main'] ?? 0) +
    (nextPlayer.tierParticipations?.['major'] ?? 0);
  if (topParticipations >= 4 && !nextTags.includes('veteran')) {
    nextTags.push('veteran');
    tagsAdded.push('veteran');
  }
  // 首次获得 veteran tag：+2 心态 -15 压力
  if (tagsAdded.includes('veteran') && !session.player.tags.includes('veteran')) {
    nextPlayer.stats = { ...nextPlayer.stats, mentality: nextPlayer.stats.mentality + 2 };
    nextPlayer.stress = Math.max(0, (nextPlayer.stress ?? 0) - 15);
  }

  if (tournamentMatch && session.player.forceMatchResult) {
    nextPlayer.forceMatchResult = null;
  }

  // 面试事件完成后清空 pendingApplication（response 阶段保留，供面试 post-handler 读取 clubId）
  const CLUB_INTERVIEW_IDS = new Set([
    'chain-club-interview',
    'chain-club-interview-open-match',
    'chain-club-interview-talent',
  ]);
  if (CLUB_INTERVIEW_IDS.has(eventDef.id)) {
    nextPlayer.pendingApplication = null;
  }

  // 家人危机事件触发：无论哪种选择都设永久 CD 防止重复触发
  if (eventDef.id === 'family-crisis-illness' && !nextPlayer.pendingFamilyCrisis) {
    nextPlayer.tagExpiry = { ...(nextPlayer.tagExpiry ?? {}), 'family-crisis-cd': Number.MAX_SAFE_INTEGER };
    if (choiceDef.id !== 'abandon-family') {
      nextPlayer.pendingFamilyCrisis = { amountNeeded: 80, deadlineRound: nextPlayer.round + 4 };
      passiveEffects.push('危机倒计时：4 回合内筹集 80K 手术费，否则职业生涯结束');
    }
  }

  if (
    eventDef.id.startsWith('bailout-team-') &&
    !choiceDef.isRefusal &&
    nextPlayer.team &&
    nextPlayer.salaryTracker &&
    !nextPlayer.salaryTracker.salaryRestoreRound
  ) {
    const originalMonthlySalary = nextPlayer.team.monthlySalary;
    nextPlayer.team = {
      ...nextPlayer.team,
      monthlySalary: Math.floor(originalMonthlySalary * 0.8),
    };
    nextPlayer.salaryTracker = {
      ...nextPlayer.salaryTracker,
      originalMonthlySalary,
      salaryRestoreRound: nextPlayer.round + 12,
    };
    passiveEffects.push('战队垫款：未来 12 周薪资临时下调 20%');
  }

  // 月薪入账：每 4 回合结算一次，入队后从 salaryTracker.lastPayRound 起算
  // 必须在 processRecoverySystems 之前结算，确保到期的家人危机检查能看到当回合薪资
  if (nextPlayer.team && nextPlayer.salaryTracker) {
    if (
      nextPlayer.salaryTracker.salaryRestoreRound &&
      nextPlayer.round >= nextPlayer.salaryTracker.salaryRestoreRound
    ) {
      nextPlayer.team = {
        ...nextPlayer.team,
        monthlySalary: nextPlayer.salaryTracker.originalMonthlySalary ?? nextPlayer.team.monthlySalary,
      };
      const restoredTracker = { ...nextPlayer.salaryTracker };
      delete restoredTracker.originalMonthlySalary;
      delete restoredTracker.salaryRestoreRound;
      nextPlayer.salaryTracker = restoredTracker;
      passiveEffects.push('临时薪资下调结束，周薪恢复');
    }

    const roundsSinceLastPay = nextPlayer.round - nextPlayer.salaryTracker.lastPayRound;
    if (roundsSinceLastPay >= nextPlayer.salaryTracker.payCycle) {
      applyMoneyTransaction(nextPlayer, nextPlayer.team.monthlySalary);
      nextPlayer.salaryTracker = {
        ...nextPlayer.salaryTracker,
        lastPayRound: nextPlayer.round,
      };
      passiveEffects.push(`月薪入账 +${nextPlayer.team.monthlySalary}K`);
    }
  }

  const recoveryEffects: string[] = [];
  processRecoverySystems(nextPlayer, eventDef.id, recoveryEffects, choiceDef);
  passiveEffects.push(...recoveryEffects);

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

  // ── 队友转会预警：更新 pendingDeparture 状态 ─────────────────────
  if (eventDef.id === 'chain-teammate-transfer-rumor' && nextPlayer.pendingDeparture) {
    nextPlayer.pendingDeparture = { ...nextPlayer.pendingDeparture, rumorShown: true };
  }

  if (eventDef.id === 'chain-teammate-transfer-reveal' && nextPlayer.pendingDeparture) {
    nextPlayer.pendingDeparture = { ...nextPlayer.pendingDeparture, revealed: true };
    const isEarlyAction =
      (choiceDef.id === 'contact-coach' && outcome.success) ||
      (choiceDef.id === 'confront-teammate' && outcome.success);
    if (isEarlyAction) {
      nextPlayer.pendingDeparture = { ...nextPlayer.pendingDeparture, earlyRecruit: true };
    }
    // 质询成功：队友承认，信任小幅下滑
    if (choiceDef.id === 'confront-teammate' && outcome.success && nextPlayer.roster) {
      nextPlayer.teamTrust = clampTeamTrust((nextPlayer.teamTrust ?? 50) - 5);
    }
  }

  const isConflictDeparture =
    eventDef.id === 'chain-team-fired' ||
    (eventDef.id === 'chain-team-conflict' && chosenTags.add.includes('bad-blood'));
  const isTeamDeparture =
    (eventDef.id === 'chain-team-fired' && (choiceDef.id === 'accept-gracefully' || !outcome.success)) ||
    (eventDef.id === 'chain-contract-renewal' && choiceDef.id === 'leave-team') ||
    (eventDef.id === 'chain-team-conflict' && chosenTags.add.includes('bad-blood'));

  if (isTeamDeparture) {
    const settlement = settleSalaryOnDeparture(nextPlayer);
    if (settlement > 0) passiveEffects.push(`离队薪资结清 +${settlement}K`);

    // bad-blood 仅在冲突性离队时添加，合约到期正常分手不加
    if (isConflictDeparture && !tagsAdded.includes('bad-blood')) tagsAdded.push('bad-blood');

    if (nextPlayer.roster && nextPlayer.roster.length > 0 && rng() < 0.5) {
      if (!tagsAdded.includes('old-teammate-contact')) {
        tagsAdded.push('old-teammate-contact');
        passiveEffects.push('留下了一位前队友的联系方式');
      }
    }

    nextPlayer.roster = null;
    Object.assign(nextPlayer, clearTeamQualifications(nextPlayer, qualificationChanges));
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
    resultTier: outcome.resultTier,
    roll: outcome.roll,
    dc: outcome.dc,
    naturalRoll: outcome.naturalRoll,
    narrative: outcome.chosenOutcome.narrative,
    statChanges,
    newStats: nextPlayer.stats,
    stageBefore,
    stageAfter: outcome.stageAfter,
    tagsAdded,
    passiveEffects,
    qualificationChanges,
    stressChange: stress - stressBefore,
    fameChange: fame - fameBefore,
    feelChange,
    tiltChange,
    fatigueChange,
    buffsAdded: chosenEffects.buffAdd ? [chosenEffects.buffAdd] : [],
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
      const extraPoints = chosenResourceDelta.points;
      const totalPoints = reward.points + extraPoints;
      if (totalPoints !== 0) leaderboard = addPlayerPoints(leaderboard, totalPoints);

      if (idx === 0) {
        const tierPart = { ...(nextPlayer.tierParticipations ?? {}) };
        tierPart[t.tier] = (tierPart[t.tier] ?? 0) + 1;
        tierPart[t.progressionTier] = (tierPart[t.progressionTier] ?? 0) + 1;
        nextPlayer.tierParticipations = tierPart;
        nextPlayer.tournamentParticipations = (nextPlayer.tournamentParticipations ?? 0) + 1;
      }
      if (outcome.success && t.qualificationMilestones?.length) {
        const matchedMilestones = t.qualificationMilestones.filter(
          (milestone) => milestone.stageIndex === idx && (milestone.requireWin ?? true),
        );
        const milestoneRewards = matchedMilestones.flatMap((milestone) => milestone.rewards);
        if (milestoneRewards.length > 0) {
          const rewardsByOwner = addQualificationRewardsByOwnerWithExpiry(
            nextPlayer.qualificationSlots ?? {},
            nextPlayer.teamQualificationSlots ?? {},
            nextPlayer.qualificationSlotBatches,
            nextPlayer.teamQualificationSlotBatches,
            milestoneRewards,
            defaultQualificationExpiry(nextPlayer.year ?? 1, nextPlayer.week ?? 1),
          );
          nextPlayer.qualificationSlots = rewardsByOwner.playerSlots;
          nextPlayer.teamQualificationSlots = rewardsByOwner.teamSlots;
          nextPlayer.qualificationSlotBatches = rewardsByOwner.playerBatches;
          nextPlayer.teamQualificationSlotBatches = rewardsByOwner.teamBatches;
          for (const milestone of matchedMilestones) {
            qualificationChanges.push(`获得资格：${milestone.label}，${formatQualificationRewards(milestone.rewards)}`);
          }
        }
      }
      if (isFinal && outcome.success) {
        const tierChamp = { ...(nextPlayer.tierChampionships ?? {}) };
        tierChamp[t.tier] = (tierChamp[t.tier] ?? 0) + 1;
        tierChamp[t.progressionTier] = (tierChamp[t.progressionTier] ?? 0) + 1;
        nextPlayer.tierChampionships = tierChamp;
        nextPlayer.tournamentChampionships = (nextPlayer.tournamentChampionships ?? 0) + 1;
        if (t.qualificationRewards?.length) {
          const rewardsByOwner = addQualificationRewardsByOwnerWithExpiry(
            nextPlayer.qualificationSlots ?? {},
            nextPlayer.teamQualificationSlots ?? {},
            nextPlayer.qualificationSlotBatches,
            nextPlayer.teamQualificationSlotBatches,
            t.qualificationRewards,
            defaultQualificationExpiry(nextPlayer.year ?? 1, nextPlayer.week ?? 1),
          );
          nextPlayer.qualificationSlots = rewardsByOwner.playerSlots;
          nextPlayer.teamQualificationSlots = rewardsByOwner.teamSlots;
          nextPlayer.qualificationSlotBatches = rewardsByOwner.playerBatches;
          nextPlayer.teamQualificationSlotBatches = rewardsByOwner.teamBatches;
          qualificationChanges.push(`获得资格：${formatQualificationRewards(t.qualificationRewards)}`);
        }

        // 明星选手判定：Major ≥1 / S级正赛 ≥3
        const tc = nextPlayer.tierChampionships;
        const isStar =
          (tc['major'] ?? 0) >= 1 ||
          (tc['s-main'] ?? 0) >= 3;
        if (isStar && !nextPlayer.tags.includes('star-player')) {
          nextPlayer.tags = dedupe([...nextPlayer.tags, 'star-player']);
          nextPlayer.stats = { ...nextPlayer.stats, experience: nextPlayer.stats.experience + 1 };
          nextPlayer.fame = (nextPlayer.fame ?? 0) + 10;
        }
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

  // ── 队友转会到期：执行替换 + 重新调度 ────────────────────────────
  if (
    nextPlayer.pendingDeparture &&
    nextPlayer.round >= nextPlayer.pendingDeparture.departureRound &&
    nextPlayer.roster &&
    nextPlayer.team &&
    !nextPlayer.pendingMatch // 赛事进行中延后处理
  ) {
    const { slotId, earlyRecruit, destTeamName } = nextPlayer.pendingDeparture;
    const departingIdx = nextPlayer.roster.findIndex((tm) => tm.id === slotId);
    if (departingIdx !== -1) {
      const departingTm = nextPlayer.roster[departingIdx]!;
      const replaceRng = makeRng(hashString(session.id) ^ (nextPlayer.round * 31337));
      const newTm = generateSingleTeammate(
        nextPlayer.team.tier,
        replaceRng,
        earlyRecruit ? 'good' : 'poor',
        slotId,
      );
      const newRoster = [...nextPlayer.roster];
      newRoster[departingIdx] = newTm;
      nextPlayer.roster = newRoster;
      const trustDrop = earlyRecruit ? -10 : -20;
      nextPlayer.teamTrust = clampTeamTrust((nextPlayer.teamTrust ?? 50) + trustDrop);
      passiveEffects.push(
        `${departingTm.name} 正式转会至 ${destTeamName}，` +
        `${earlyRecruit ? '提前招募的新秀' : '临时从青训提拔的'} ${newTm.name} 补位（默契 ${trustDrop}）`,
      );
    }
    // 调度下一次转会（赛季内持续发生）
    const nextOffset = 20 + Math.floor(rng() * 21);
    const nextRoster = nextPlayer.roster ?? [];
    if (nextRoster.length > 0) {
      const nextSlot = nextRoster[Math.floor(rng() * nextRoster.length)]!.id;
      const rivals = nextPlayer.rivals.length > 0 ? nextPlayer.rivals : [{ name: '某支战队', tag: '???', region: '' }];
      const nextDest = rivals[Math.floor(rng() * rivals.length)]!.name;
      nextPlayer.pendingDeparture = {
        slotId: nextSlot,
        departureRound: nextPlayer.round + nextOffset,
        rumorShown: false,
        revealed: false,
        destTeamName: nextDest,
        earlyRecruit: false,
      };
    } else {
      nextPlayer.pendingDeparture = undefined;
    }
  }

  // 离队后清除 pendingDeparture（玩家自己离队）
  if (!nextPlayer.team) {
    nextPlayer.pendingDeparture = undefined;
  }

  const recent = [...session.history.slice(-2).map((r) => r.eventId), eventDef.id];
  const nextEventDef = (() => {
    if (ending) return null;
    const pm = nextPlayer.pendingMatch;
    if (pm && pm.resolveYear === nextYear && pm.resolveWeek === nextWeek) {
      const t = getTournament(pm.tournamentId);
      if (t) return synthesizeMatchEvent(t, pm.stageIndex);
    }
    return pickEvent({ player: nextPlayer, recentEventIds: recent, rng, leaderboard, aiEvents });
  })();

  if (nextPlayer.forceNextEvent && nextEventDef?.id === nextPlayer.forceNextEvent) {
    nextPlayer.forceNextEvent = null;
  }

  result.narrative = substituteRivals(result.narrative, nextPlayer.rivals);
  result.narrative = substituteTeammates(result.narrative, nextPlayer.roster ?? []);
  result.eventTitle = substituteRivals(result.eventTitle, nextPlayer.rivals);
  result.eventTitle = substituteTeammates(result.eventTitle, nextPlayer.roster ?? []);

  const transferTarget = nextPlayer.pendingDeparture
    ? (nextPlayer.roster ?? []).find((tm) => tm.id === nextPlayer.pendingDeparture!.slotId)?.name
    : undefined;

  const updated: GameSession = {
    ...session,
    player: nextPlayer,
    currentEvent: nextEventDef ? toPublicEvent(nextEventDef, nextPlayer.rivals, nextPlayer.roster ?? [], transferTarget) : null,
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
  // 家人危机逾期且资金不足 → 被迫退出职业
  if (
    player.pendingFamilyCrisis &&
    player.round >= player.pendingFamilyCrisis.deadlineRound &&
    player.stats.money < player.pendingFamilyCrisis.amountNeeded
  ) {
    return 'family_crisis_career_ended';
  }
  if ((player.stressMaxRounds ?? 0) >= STRESS_GRACE_ROUNDS) return 'stress_breakdown';
  if (player.tags.includes('injury-prone') && player.stats.constitution <= 0) {
    return 'injury_ended_career';
  }
  if (player.round >= MAX_ROUNDS) {
    const isProPlus = player.stage === 'pro';
    const isSemiProPlus = ['second', 'pro'].includes(player.stage);
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
  aiEvents?: EventDef[],
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
    player: comboPlayer,
    event: syntheticEvent as Parameters<typeof resolveChoice>[0]['event'],
    choice: syntheticEvent.choices[0]! as Parameters<typeof resolveChoice>[0]['choice'],
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

  const nextPlayer: Player = {
    ...session.player,
    stats: outcome.nextStats,
    volatile: newVolatile,
    buffs,
    growthSpent,
    stress,
    actionPoints: ap - actionDef.apCost,
    roundCombos,
  };

  const actionResult: ActionResult = {
    actionId,
    actionLabel: actionDef.label,
    success: outcome.success,
    roll: outcome.roll,
    dc: outcome.dc,
    naturalRoll: outcome.naturalRoll,
    narrative: outcome.chosenOutcome.narrative,
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

  return { actionResult, player: nextPlayer };
}

export interface ApplyShopResult {
  player: Player;
  itemName: string;
  shopNarrative?: string;          // 外设升级结果 或 负面事件文字
  shopNarrativePositive?: boolean; // true=好结果(绿色) false=负面(橙色/红色)
  shopBuffLabelsAdded?: string[];
  shopBuffLabelsRemoved?: string[];
  shopTagsAdded?: string[];
  shopTagsRemoved?: string[];
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
  const weeklyLimit = WEEKLY_SHOP_LIMITS[item.category];
  const purchaseRecord = (player.weeklyShopPurchases ?? {})[itemId];
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const purchaseCount = purchaseRecord?.year === currentYear && purchaseRecord.week === currentWeek
    ? purchaseRecord.count
    : 0;

  if ((player.pawnedItemIds ?? []).includes(itemId)) {
    throw new Error('该装备已永久典当，无法重新购买');
  }
  if (item.category === 'equipment' && itemId !== 'pro-peripherals' && (player.ownedItems ?? []).includes(itemId)) {
    throw new Error('已经拥有该装备');
  }

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
  if (weeklyLimit !== undefined && purchaseCount >= weeklyLimit) {
    throw new Error(`本周购买次数已达上限（${purchaseCount}/${weeklyLimit}）`);
  }

  if (player.stats.money < item.priceMoney) {
    throw new Error(`资金不足，需要 ${item.priceMoney}K`);
  }

  if (itemId === 'hire-agent' && player.tags.includes('has-agent')) {
    throw new Error('已经签约经纪人，无需重复购买');
  }

  if (itemId === 'fire-agent' && !player.tags.includes('has-agent')) {
    throw new Error('当前没有经纪人可解约');
  }

  // ── 外设升级：特殊分支处理（priceMoney:0 是占位，价格由此分支动态决定）──
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
          growthMultiplier: 1.2,
          remainingUses: 9999,
          consumeOn: 'growth',
        });
        shopNarrative += '，外设已达满级，获得固定增益：天梯敏捷成长 +20%';
      }
    } else {
      newFeelCap = Math.max(currentCap - 0.5, FEEL_CAP_MIN);
      newTier = tier; // 被骗，等级不变，价格不变
      shopNarrative = `买到了山寨货，手感上限反而下降至 ${newFeelCap}`;
    }

    const newStats = applyMoneyDeltaToStats(player.stats, -price);

    const nextPlayer: Player = {
      ...player,
      stats: clampStats(newStats),
      feelCap: newFeelCap,
      peripheralTier: newTier,
      buffs: newBuffs,
      ownedItems: success && !(player.ownedItems ?? []).includes(itemId)
        ? [...(player.ownedItems ?? []), itemId]
        : player.ownedItems,
    };
    return { player: nextPlayer, itemName: item.name, shopNarrative, shopNarrativePositive: success };
  }

  // ── 普通商品流程 ────────────────────────────────────────────
  // pro-peripherals uses dynamic pricing and must be handled by the special branch above
  if (itemId === 'pro-peripherals') throw new Error('外设升级走了非预期的购买路径');
  const { effect } = item;

  // Apply money cost
  let stats = applyMoneyDeltaToStats(player.stats, -item.priceMoney);

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
  if (effect.buffRemoveId) {
    buffs = buffs.filter((b) => b.id !== effect.buffRemoveId);
  }
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
  const nextWeeklyShopPurchases = { ...(player.weeklyShopPurchases ?? {}) };
  if (weeklyLimit !== undefined) {
    nextWeeklyShopPurchases[itemId] = {
      year: currentYear,
      week: currentWeek,
      count: purchaseCount + 1,
    };
  }

  // ── 负面事件随机触发（team-dinner / fan-meetup 等）──
  // 概率检定是顺序独立的：第一个未触发才检定第二个，break 保证每次最多触发一个。
  // 实际触发率 ≈ chance[0] + (1-chance[0])*chance[1] + ...，非累加。
  let shopNarrative: string | undefined;
  if (item.negativeEvents) {
    for (const neg of item.negativeEvents) {
      if (Math.random() < neg.chance) {
        if (neg.effect.stressDelta) stress = clampStress(stress + neg.effect.stressDelta);
        if (neg.effect.fatigueDelta) fatigue = clampFatigue(fatigue + neg.effect.fatigueDelta);
        if (neg.effect.fameDelta) fame = clampFame(fame + neg.effect.fameDelta);
        if (neg.effect.feelReset) feel = clampFeel(0, player.feelCap ?? FEEL_CAP_DEFAULT);
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
    weeklyShopPurchases: nextWeeklyShopPurchases,
    ownedItems: item.category === 'equipment' && !(player.ownedItems ?? []).includes(itemId)
      ? [...(player.ownedItems ?? []), itemId]
      : player.ownedItems,
  };

  return {
    player: nextPlayer,
    itemName: item.name,
    shopNarrative:
      shopNarrative
      ?? (itemId === 'hire-agent'
        ? '签约成功：获得长期增益「经纪团队」，并添加标签「has-agent」。后续回合将有概率触发经纪人相关事件。'
        : itemId === 'fire-agent'
          ? '经纪合作已结束：移除长期增益「经纪团队」，并删除标签「has-agent」。'
          : undefined),
    shopNarrativePositive:
      shopNarrative ? false : (itemId === 'hire-agent' || itemId === 'fire-agent' ? true : undefined),
    shopBuffLabelsAdded: effect.buffAdd ? [effect.buffAdd.label] : undefined,
    shopBuffLabelsRemoved: effect.buffRemoveId
      ? (player.buffs ?? []).filter((b) => b.id === effect.buffRemoveId).map((b) => b.label)
      : undefined,
    shopTagsAdded: effect.tagAdd ? [effect.tagAdd] : undefined,
    shopTagsRemoved: effect.tagRemove ? [effect.tagRemove] : undefined,
  };
}

export function pawnItem(
  player: Player,
  itemId: string,
): { success: boolean; message?: string; pawnValue?: number; player?: Player } {
  if (!player.ownedItems.includes(itemId)) {
    return { success: false, message: '未拥有该装备，无法典当' };
  }
  if ((player.pawnedItemIds ?? []).includes(itemId)) {
    return { success: false, message: '该装备已经典当过了' };
  }
  if (itemId !== 'ergo-chair' && itemId !== 'pro-peripherals') {
    return { success: false, message: '只有装备类物品可以典当' };
  }

  let pawnValue: number;
  let nextPlayer: Player;

  if (itemId === 'ergo-chair') {
    pawnValue = Math.floor(35 * 0.6);
    const newStats = clampStats({
      ...applyMoneyDeltaToStats(player.stats, pawnValue),
      constitution: Math.max(0, player.stats.constitution - 2),
    });
    nextPlayer = {
      ...player,
      stats: newStats,
      buffs: (player.buffs ?? []).filter((b) => b.id !== 'ergo-recovery'),
      ownedItems: player.ownedItems.filter((id) => id !== itemId),
      pawnedItemIds: [...(player.pawnedItemIds ?? []), itemId],
    };
  } else {
    const tier = player.peripheralTier ?? 0;
    if (tier <= 0) {
      return { success: false, message: '当前没有可典当的外设升级' };
    }
    let totalValue = 0;
    for (let i = 0; i < tier; i++) {
      totalValue += PERIPHERAL_PRICES[i] ?? 0;
    }
    pawnValue = Math.floor(totalValue * 0.5);
    const newFeelCap = FEEL_CAP_DEFAULT;
    const newStats = clampStats({
      ...applyMoneyDeltaToStats(player.stats, pawnValue),
    });
    nextPlayer = {
      ...player,
      stats: newStats,
      peripheralTier: 0,
      feelCap: newFeelCap,
      volatile: {
        ...(player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 }),
        feel: clampFeel(player.volatile?.feel ?? 0, newFeelCap),
      },
      buffs: (player.buffs ?? []).filter((b) => b.id !== 'pro-gear'),
      ownedItems: player.ownedItems.filter((id) => id !== itemId),
      pawnedItemIds: [...(player.pawnedItemIds ?? []), itemId],
    };
  }

  return { success: true, pawnValue, player: nextPlayer };
}

// ── 战队申请 ──────────────────────────────────────────────────

export function applyClubRequest(
  session: GameSession,
  clubId: string,
): Player {
  if (session.status !== 'active') throw new Error('session is not active');
  const club = getClub(clubId);
  if (!club) throw new Error('未知俱乐部');

  const player = session.player;
  if (player.tags.includes('transfer-ban')) {
    throw new Error('因贷款违约，你目前被禁止转会（还有' + ((player.tagExpiry?.['transfer-ban'] ?? player.round) - player.round) + '回合）');
  }
  if (player.team && clubId === player.team.clubId) throw new Error('已经在这支战队了');
  if (player.team) throw new Error('你已经有战队了');
  if (player.pendingApplication) throw new Error('已经有一个进行中的申请');

  // Rookie 申请 youth 档俱乐部时跳过阶段门槛，后续的 Rookie 专属资格检查会接管
  const isRookieApplyingToYouth = player.stage === 'rookie' && club.requiredStage === 'youth';
  if (!isRookieApplyingToYouth && STAGE_ORDER.indexOf(player.stage) < STAGE_ORDER.indexOf(club.requiredStage)) {
    throw new Error('当前阶段不满足该俱乐部的门槛');
  }
  if (club.requiredFame !== undefined && (player.fame ?? 0) < club.requiredFame) {
    throw new Error(`名气不足，需要 ≥ ${club.requiredFame}`);
  }

  const ap = player.actionPoints ?? 0;
  if (ap < 25) throw new Error('行动力不足');

  // Rookie-specific eligibility: must have proven themselves before clubs will respond.
  // Path A: 3+ C/B-tier participations, at least 1 B-tier participation, and 1+ C/B championship.
  // Path B: holds 枪法天才 (aimer trait tag); 天赋之子 reserved for future trait 'prodigy'.
  let pathTag: 'application-path-open-match' | 'application-path-talent' | null = null;
  if (player.stage === 'rookie') {
    const tp = player.tierParticipations ?? {};
    const tc = player.tierChampionships ?? {};
    const rookieParticipations = (tp['c'] ?? 0) + (tp['b'] ?? 0);
    const bParticipations = tp['b'] ?? 0;
    const rookieChampionships = (tc['c'] ?? 0) + (tc['b'] ?? 0);
    const hasOpenMatchPath = rookieParticipations >= 3 && bParticipations >= 1 && rookieChampionships >= 1;

    const traitTags = player.traits.flatMap((id) => getTrait(id)?.tags ?? []);
    const hasTalentPath = traitTags.includes('aimer'); // 'prodigy' reserved for 天赋之子

    if (!hasOpenMatchPath && !hasTalentPath) {
      throw new Error(
        '需要先在 C/B 级赛事积累经验（C/B 级参赛 ≥ 3 场、B 级参赛 ≥ 1 场、C/B 级夺冠 ≥ 1 次），或拥有枪法天才特质',
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
    return joinTeamFromOffer(session, player, offer, { contractDispute: true });
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

export function applyTeamPractice(
  session: GameSession,
  teammateId: string,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  if (!teammateId) throw new Error('teammateId 必填');
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_PRACTICE_AP_COST);

  const roster = player.roster ?? [];
  const targetIndex = roster.findIndex((tm) => tm.id === teammateId);
  if (targetIndex === -1) throw new Error('未知队友');

  const actionKey = `practice:${teammateId}`;
  if (weeklyTeamActionCount(player, actionKey) >= 1) {
    throw new Error('本周已经和这名队友加练过');
  }
  if (weeklyPracticeTotal(player) >= TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT) {
    throw new Error(`本周队友加练次数已达上限（${TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT} 次）`);
  }

  const target = roster[targetIndex]!;
  const primaryStat = primaryStatForRole(target.role);
  const primaryStatLabel = teammateStatLabel(primaryStat);
  const dc = 8 + Math.floor(teammateAverage(target) / 4);
  const check = rollTeamAction(
    player,
    primaryStat as StatKey,
    'experience',
    dc,
    `${session.id}:team-practice:${player.round}:${player.actionPoints}:${teammateId}`,
  );
  const growth = check.success ? 0.4 + Math.min(0.4, Math.max(0, (check.roll - dc) * 0.05)) : 0.1;
  const nextRoster = [...roster];
  nextRoster[targetIndex] = applyTeammateGrowth(target, primaryStat, growth);

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = check.success ? 12 : 10;
  const stressDelta = check.success ? 4 : 8;
  const trustDelta = check.success ? 0 : target.personality === 'drama' ? -1 : 0;
  const nextPlayer: Player = {
    ...player,
    roster: nextRoster,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    volatile: {
      ...volatile,
      fatigue: clampFatigue(volatile.fatigue + fatigueDelta),
    },
    actionPoints: (player.actionPoints ?? 0) - TEAM_PRACTICE_AP_COST,
    weeklyTeamActions: bumpWeeklyTeamAction(player, actionKey),
  };

  return {
    player: nextPlayer,
    result: {
      actionId: 'team-practice',
      label: `和 ${target.name} 加练`,
      teammateId,
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? `你和 ${target.name} 把几个配合细节练顺了，对方的${primaryStatLabel}有了小幅提升。`
        : `你和 ${target.name} 练得有些拧巴，身体消耗不少，真正沉淀下来的东西有限。`,
      effects: [
        check.success ? `${target.name}${primaryStatLabel}小幅提升` : `${target.name}训练收益有限`,
        trustDelta < 0 ? '队伍信任小幅下降' : '队伍信任不变',
        `疲劳 +${fatigueDelta}`,
        `压力 +${stressDelta}`,
      ],
    },
  };
}

export function applyTeamMeeting(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_MEETING_AP_COST);
  const actionKey = 'team-meeting';
  const limit = TEAM_ACTION_LIMITS[actionKey] ?? 1;
  if (weeklyTeamActionCount(player, actionKey) >= limit) {
    throw new Error('本周已经开过战术会议');
  }

  let dc = 10;
  if ((player.teamTrust ?? 50) < 30) dc += 2;
  if (player.tags.includes('locker-tension')) dc += 2;
  const check = rollTeamAction(
    player,
    'intelligence',
    'mentality',
    dc,
    `${session.id}:team-meeting:${player.round}:${player.actionPoints}`,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = check.success ? 6 : 5;
  const stressDelta = check.success ? 3 : 10;
  const trustDelta = check.success ? 4 : -2;
  const nextTags = check.success || player.tags.includes('locker-tension')
    ? player.tags
    : [...player.tags, 'locker-tension'];
  const nextBuffs = check.success
    ? [
        ...(player.buffs ?? []).filter((buff) => buff.id !== 'team-tactical-ready'),
        {
          id: 'team-tactical-ready',
          label: '战术统一',
          actionTag: 'match',
          stressGainMultiplier: 0.9,
          remainingUses: 1,
          consumeOn: 'stress' as const,
        },
      ]
    : player.buffs;

  const nextPlayer: Player = {
    ...player,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    volatile: {
      ...volatile,
      fatigue: clampFatigue(volatile.fatigue + fatigueDelta),
    },
    buffs: nextBuffs,
    tags: nextTags,
    actionPoints: (player.actionPoints ?? 0) - TEAM_MEETING_AP_COST,
    weeklyTeamActions: bumpWeeklyTeamAction(player, actionKey),
  };

  return {
    player: nextPlayer,
    result: {
      actionId: 'team-meeting',
      label: '战术会议',
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? '你把几套默认处理讲清楚了，队友们对下一场的沟通口径更统一。'
        : '会议越开越乱，几个细节没有说清，反而让更衣室气氛更紧。',
      effects: [
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        check.success ? '获得增益：战术统一' : '更衣室气氛承压',
        `疲劳 +${fatigueDelta}`,
        `压力 +${stressDelta}`,
      ],
    },
  };
}

export function applyLockerRoomTalk(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  assertTeamActionAvailable(player, LOCKER_ROOM_TALK_AP_COST);
  if (!player.tags.includes('locker-tension') && (player.teamTrust ?? 50) >= 30) {
    throw new Error('当前更衣室没有需要安抚的明显问题');
  }
  const actionKey = 'locker-room-talk';
  const limit = TEAM_ACTION_LIMITS[actionKey] ?? 1;
  if (weeklyTeamActionCount(player, actionKey) >= limit) {
    throw new Error('本周已经安抚过更衣室');
  }

  const roster = player.roster ?? [];
  let dc = 10;
  if (roster.some((tm) => tm.personality === 'drama')) dc += 2;
  if (roster.some((tm) => tm.personality === 'supportive')) dc -= 1;
  const check = rollTeamAction(
    player,
    'mentality',
    'experience',
    dc,
    `${session.id}:locker-room-talk:${player.round}:${player.actionPoints}`,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = check.success ? 3 : 0;
  const stressDelta = check.success ? -5 : 10;
  const trustDelta = check.success ? 5 : -3;
  const nextTags = check.success
    ? player.tags.filter((tag) => tag !== 'locker-tension')
    : player.tags;
  const nextPlayer: Player = {
    ...player,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    volatile: {
      ...volatile,
      fatigue: clampFatigue(volatile.fatigue + fatigueDelta),
    },
    tags: nextTags,
    actionPoints: (player.actionPoints ?? 0) - LOCKER_ROOM_TALK_AP_COST,
    weeklyTeamActions: bumpWeeklyTeamAction(player, actionKey),
  };

  return {
    player: nextPlayer,
    result: {
      actionId: 'locker-room-talk',
      label: '安抚更衣室',
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? '你把话题拉回到比赛本身，几个人终于愿意把不满说开。'
        : '你试着缓和气氛，但话没落到点上，更衣室反而更沉默。',
      effects: [
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        check.success ? '移除 locker-tension' : 'locker-tension 保留',
        fatigueDelta !== 0 ? `疲劳 +${fatigueDelta}` : '疲劳不变',
        `压力 ${stressDelta > 0 ? '+' : ''}${stressDelta}`,
      ],
    },
  };
}

function joinTeamFromOffer(
  session: GameSession,
  sourcePlayer: Player,
  offer: TeamOffer,
  options: { contractDispute: boolean },
): Player {
  let player = { ...sourcePlayer };
  const hadTeam = player.team !== null;

  if (hadTeam) {
    player = clearTeamQualifications(player);
    if (options.contractDispute) {
      player.fame = Math.max(0, (player.fame ?? 0) - 15);
      player.stress = Math.min(100, (player.stress ?? 0) + 25);
      player.tagExpiry = { ...(player.tagExpiry ?? {}), 'contract-dispute': player.round + 12 };
    }
  }

  const team: PlayerTeam = {
    clubId: offer.clubId,
    name: offer.clubName,
    tag: offer.tag,
    region: offer.region,
    tier: offer.tier,
    monthlySalary: offer.monthlySalary,
    joinedRound: player.round,
  };

  const TIER_MIN_STAGE: Record<ClubTier, Stage> = {
    youth: 'youth',
    'semi-pro': 'second',
    pro: 'pro',
    top: 'pro',
  };
  const minStage = TIER_MIN_STAGE[offer.tier];
  const nextStage = stageIndex(minStage) > stageIndex(player.stage) ? minStage : player.stage;

  const rosterRng = makeRng(hashString(session.id) ^ (player.round * 7919));
  const roster = generateRoster(offer.tier, rosterRng);

  const cleanTags = player.tags.filter((t) => t !== 'applying' && t !== 'interview-pending');
  const nextTags = hadTeam && options.contractDispute
    ? dedupe([...cleanTags, 'contract-dispute'])
    : cleanTags;

  // 初始化队友转会计划
  const deptOffset = 20 + Math.floor(rosterRng() * 21); // 20-40 回合后首次转会
  const deptSlot = roster[Math.floor(rosterRng() * roster.length)]!.id;
  const deptRivals = player.rivals.length > 0 ? player.rivals : [{ name: '某支战队', tag: '???', region: '' }];
  const deptDestTeam = deptRivals[Math.floor(rosterRng() * deptRivals.length)]!.name;
  const initialPendingDeparture: PendingDeparture = {
    slotId: deptSlot,
    departureRound: player.round + deptOffset,
    rumorShown: false,
    revealed: false,
    destTeamName: deptDestTeam,
    earlyRecruit: false,
  };

  return {
    ...player,
    team,
    stage: nextStage,
    everHadTeam: true,
    salaryTracker: {
      lastPayRound: player.round,
      joinedRound: player.round,
      payCycle: 4,
    },
    pendingOffer: null,
    pendingApplication: null,
    roster,
    teamTrust: hadTeam ? (options.contractDispute ? 25 : 35) : 40,
    tags: nextTags,
    tagExpiry: player.tagExpiry,
    pendingDeparture: initialPendingDeparture,
  };
}

function pickPromotionClub(tier: ClubTier, sessionId: string, round: number): Club | null {
  const candidates = CLUBS.filter((club) => club.tier === tier && !club.isRival);
  if (candidates.length === 0) return null;
  const idx = Math.abs(hashString(`${sessionId}:${round}:${tier}`)) % candidates.length;
  return candidates[idx]!;
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
    monthlySalary: salary,
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
