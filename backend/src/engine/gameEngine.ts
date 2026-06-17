import { DEFAULT_BACKGROUND_ID, getBackground } from '../data/backgrounds.js';
import {
  type Tournament,
  getTournament,
  stageRewardDelta,
  synthesizeMatchEvent,
} from '../data/tournaments.js';
import { generateRivals } from '../data/rivals.js';
import { generateRoster, generateSingleTeammate } from '../data/roster.js';
import { addPlayerPoints, buildLeaderboard } from '../data/leaderboard.js';
import { getEventById } from '../data/events/index.js';
import { TRAITS, getTrait } from '../data/traits.js';
import { ACTIONS, getAction, type ActionDef, type ComboConsume } from '../data/actions.js';
import { getShopItem, SHOP_ITEMS, type ShopCategory } from '../data/shop.js';
import { CLUBS, getClub, clubsForStage, PRIZE_SPLIT } from '../data/clubs.js';
import { getClubProfile } from '../data/clubProfiles.js';
import type {
  ActionResult,
  Buff,
  ChoiceDef,
  Club,
  ClubPlayer,
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
  RoleOverlap,
  PlayerTeam,
  RosterNeed,
  RoundCombo,
  RoundResult,
  Stage,
  StatDelta,
  StatKey,
  Stats,
  Teammate,
  TeammateRole,
  TeamIdentity,
  TeamActionResult,
  TeamOffer,
  Trait,
  VolatileState,
} from '../types.js';
import {
  BASE_STATS,
  BROKE_MENTALITY_DRAIN,
  CAREER_TIME_EXPERIENCE_RAW,
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
  ALLOCATABLE_STAT_KEYS,
  OPENING_STAT_INVEST_MAX,
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
import { buildInjuryAwareTournamentEvent, buildTournamentPrepEvent, pickEvent, ROLE_STAT_REQUIREMENT, substituteRivals, substituteTeammates, toPublicEvent } from './events.js';
import {
  advanceEventSequence,
  getCurrentSequenceStep,
  isSequenceFinalStep,
  resolveSequenceEventForStep,
  sequenceResultFields,
} from './eventSequence.js';
import { checkTournamentPromotion } from './stages.js';
import {
  applyDelta,
  applyCareerExperienceGrowth,
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
import { deriveTeamChemistry } from './synergy.js';
import {
  buildAiPickCandidates,
  resolveAiEventById,
  type AiEventCacheEnvelope,
} from '../ai/eventCache.js';
import {
  addQualificationRewardsByOwnerWithExpiry,
  clearTeamQualifications,
  defaultQualificationExpiry,
  expireQualificationBatches,
  formatQualificationRewards,
  normalizeQualificationBatches,
} from './qualification.js';
import {
  canInfluenceByCalling,
  canInfluenceByStarPower,
  canInfluenceTeamStrategy,
  derivePlayerTeamIdentities,
  deriveTeammateIdentities,
  findTeamCaller,
  findTeamStar,
  refreshVisibleTeamIdentities,
} from './teamIdentity.js';
import {
  advanceTournamentContextStage,
  cleanupTournamentContext,
  markTournamentContextEventConsumed,
  recordTournamentContextMatchResult,
} from './tournamentContext.js';
import {
  createTournamentSeriesSequence,
  requiredWins,
  type TournamentMapResult,
  type TournamentSeriesContext,
} from './tournamentSeries.js';
import {
  assignPendingMatchOpponent,
  deriveRosterNeed,
  activateClubRuntime,
  ensureWorldClubPool,
  previewClubRuntime,
  recordWorldTournamentResult,
  tickWorldClubRuntimes,
} from './worldClubs.js';

const WEEKLY_SHOP_LIMITS: Partial<Record<ShopCategory, number>> = {
  consumable: 2,
  service: 1,
};
const INJURY_STATE_TAGS = ['minor-injury-risk', 'injury-warning', 'injury-limited', 'forced-rest'] as const;
type InjuryStateTag = typeof INJURY_STATE_TAGS[number];
const PROMOTION_DECLINE_COOLDOWN_ROUNDS = 4;
const DEFAULT_TAG_LIFETIME_ROUNDS: Partial<Record<string, number>> = {
  'team-trust': 12,
  'clean-record': 24,
  'dirty-money': 24,
  'banned': 24,
  'cheater': 24,
  'scammed': 24,
  'phished': 24,
  'social-circle': 18,
  'trusted-trader': 18,
  'suspicious-debt': 18,
  'gambling-spiral': 18,
  'fan-favorite': 18,
  'highlight-clip': 18,
  'media-backlash': 18,
  'bad-rep': 18,
  'family-strain': 18,
  'guilt-spiral': 18,
  'guilt-processed': 18,
  'abandoned-family': 18,
  'family-support': 12,
  'injured': 12,
  'minor-injury-risk': 12,
  'injury-warning': 12,
  'injury-limited': 12,
  'forced-rest': 12,
  'broke': 12,
  'veteran': 72,
  'star-player': 72,
  'natural-igl': 24,
  'role-confusion': 12,
  'caller-discipline': 12,
  'caller-star-aligned': 12,
  'star-freedom': 12,
  'team-carries-through-you': 12,
  'shared-calling': 12,
  'star-system-ready': 12,
  'late-round-clarity': 12,
  'coach-neutral': 12,
  'coach-backs-star': 12,
  'coach-lost-control': 12,
  'main-awper': 24,
  'team-focus-firepower': 12,
  'team-focus-tactics': 12,
  'team-focus-defense': 12,
  'team-focus-mental': 12,
  'team-tactical-ready': 12,
  'team-meeting-ready': 12,
  'locker-tension': 8,
  'suppressed-anger': 12,
  'team-conflict': 12,
  'team-positive-voice-cd': 8,
  'team-resource-tilt-cd': 8,
  'team-lineup-advice-cd': 8,
  'team-ordinary-politics-cd': 8,
  'team-politics-cd': 8,
  'team-conflict-cd': 8,
  'club-rejected-notify': 12,
  'application-response-ready': 8,
  'application-path-open-match': 12,
  'application-path-talent': 12,
  'interview-pending': 8,
  'interview-ready': 8,
  'just-joined-team': 4,
  'old-teammate-contact': 36,
  'role-transition-active': 12,
  'role-transition-cd': 24,
  'transfer-ban': 24,
  'loan-default': 24,
  'scouted': 12,
  'promote-offer-cd': 24,
  'rival-scout-cd': 12,
  'poach-cd': 12,
  'trash-talk-cd': 8,
  'contract-cd': 48,
  'old-friend-cd': 24,
  'team-finance-cd': 12,
  'tournament-winner': 72,
  'major-champion': 72,
};

function championshipTierKeys(tournament: Tournament): string[] {
  if (tournament.tier === 'c') return ['c'];
  if (tournament.tier === 'b') return ['b'];
  if (tournament.tier === 'a') return ['a'];
  if (tournament.tier === 'major') return ['s', 'major'];
  if (
    tournament.tier === 's-open' ||
    tournament.tier === 's-closed' ||
    tournament.tier === 's-class' ||
    tournament.progressionTier === 's-qualifier' ||
    tournament.progressionTier === 's-main'
  ) {
    return ['s'];
  }
  return [tournament.tier];
}

function championshipSeriesKeys(tournament: Tournament): string[] {
  const out: string[] = [];
  const brand = tournament.brand.toLowerCase();
  if (brand.includes('pgl')) out.push('pgl');
  if (brand.includes('blast')) out.push('blast');
  if (tournament.tier === 'major' || tournament.subtype === 'major') out.push('major');
  return out;
}

function hasGrandSlam(player: Player): boolean {
  const series = player.championshipSeries ?? {};
  return (series.pgl ?? 0) > 0 && (series.blast ?? 0) > 0 && (series.major ?? 0) > 0;
}

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

function consumeMatchBuffsForScope(
  buffs: Buff[],
  scope: 'series' | 'per-map',
): Buff[] {
  return buffs
    .map((buff) => {
      if (buff.consumeOn !== 'match') return buff;
      if (buff.actionTag !== 'match' && buff.actionTag !== 'all') return buff;
      const matchScope = buff.matchScope ?? 'series';
      if (matchScope !== scope) return buff;
      return { ...buff, remainingUses: buff.remainingUses - 1 };
    })
    .filter((buff) => buff.remainingUses > 0);
}

function matchBuffsForScope(
  buffs: Buff[],
  scope: 'series' | 'per-map',
): Buff[] {
  return buffs.filter((buff) =>
    buff.remainingUses > 0 &&
    buff.consumeOn === 'match' &&
    (buff.actionTag === 'match' || buff.actionTag === 'all') &&
    (buff.matchScope ?? 'series') === scope
  );
}

function playerWithSeriesBuffSnapshot(player: Player, context: TournamentSeriesContext): Player {
  const seriesBuffs = context.seriesBuffSnapshot ?? [];
  const perMapBuffs = matchBuffsForScope(player.buffs ?? [], 'per-map');
  const nonMatchBuffs = (player.buffs ?? []).filter((buff) => buff.consumeOn !== 'match');
  return {
    ...player,
    buffs: [...nonMatchBuffs, ...seriesBuffs, ...perMapBuffs],
  };
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

interface TeamActionComboOpen {
  id: string;
  label: string;
  requireSuccess?: boolean;
}

interface TeamActionComboConsume {
  id: string;
  label: string;
  effects: {
    dcDelta?: number;
    fatigueDelta?: number;
    stressDelta?: number;
    trustDelta?: number;
    chemistryDelta?: number;
  };
}

const TEAM_ACTION_COMBO_OPENS: Record<string, TeamActionComboOpen[]> = {
  'team-practice': [
    { id: 'team-practice-link', label: '配合手感延续', requireSuccess: true },
  ],
  'team-meeting': [
    { id: 'team-meeting-ready', label: '战术会议铺垫', requireSuccess: true },
  ],
  'locker-room-talk': [
    { id: 'locker-room-open', label: '更衣室气氛打开', requireSuccess: true },
  ],
};

const TEAM_ACTION_COMBO_CONSUMES: Record<string, TeamActionComboConsume[]> = {
  'team-practice': [
    {
      id: 'locker-room-open',
      label: '更衣室气氛打开',
      effects: { dcDelta: -1, stressDelta: -2, chemistryDelta: 1 },
    },
  ],
  'team-meeting': [
    {
      id: 'team-practice-link',
      label: '配合手感延续',
      effects: { dcDelta: -1, trustDelta: 1, chemistryDelta: 1 },
    },
  ],
  'retain-core-teammate': [
    {
      id: 'locker-room-open',
      label: '更衣室气氛打开',
      effects: { dcDelta: -2, stressDelta: -1 },
    },
  ],
  'team-training-focus': [
    {
      id: 'team-meeting-ready',
      label: '战术会议铺垫',
      effects: { dcDelta: -2, stressDelta: -1 },
    },
  ],
};

function matchingTeamActionCombos(player: Player, actionId: string): TeamActionComboConsume[] {
  const active = new Set((player.roundCombos ?? [])
    .filter((combo) => combo.remainingUses > 0)
    .map((combo) => combo.id));
  return (TEAM_ACTION_COMBO_CONSUMES[actionId] ?? []).filter((combo) => active.has(combo.id));
}

function sumTeamComboEffect(
  combos: TeamActionComboConsume[],
  key: keyof TeamActionComboConsume['effects'],
): number {
  return combos.reduce((sum, combo) => sum + (combo.effects[key] ?? 0), 0);
}

function addOpenedTeamCombos(
  roundCombos: RoundCombo[],
  actionId: string,
  success: boolean,
): RoundCombo[] {
  const out = [...roundCombos];
  const existing = new Set(out.map((combo) => combo.id));
  for (const combo of TEAM_ACTION_COMBO_OPENS[actionId] ?? []) {
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

function resolveTeamActionCombos(
  player: Player,
  actionId: string,
  success: boolean,
): {
  roundCombos: RoundCombo[];
  triggeredLabels: string[];
  addedLabels: string[];
  consumedCombos: TeamActionComboConsume[];
} {
  const consumedCombos = matchingTeamActionCombos(player, actionId);
  const consumedIds = new Set(consumedCombos.map((combo) => combo.id));
  const consumedRoundCombos = consumeRoundCombos(player.roundCombos ?? [], consumedIds);
  const roundCombos = addOpenedTeamCombos(consumedRoundCombos, actionId, success);
  return {
    roundCombos,
    triggeredLabels: consumedCombos.map((combo) => combo.label),
    addedLabels: roundCombos
      .filter((combo) => !consumedRoundCombos.some((before) => before.id === combo.id))
      .map((combo) => combo.label),
    consumedCombos,
  };
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
    const available = ALLOCATABLE_STAT_KEYS.filter((k) => stats[k] < floor[k] + OPENING_STAT_INVEST_MAX);
    if (available.length === 0) break;
    const pick = available[Math.floor(Math.random() * available.length)]!;
    stats[pick] += 1;
    remaining -= 1;
  }
  return stats;
}

export function validateAllocation(stats: Stats, floor: Stats): string | null {
  let aboveFloor = 0;
  if (stats.experience !== floor.experience) {
    return '经验不能通过开局点数分配';
  }
  for (const k of ALLOCATABLE_STAT_KEYS) {
    const v = stats[k];
    if (!Number.isInteger(v)) return `属性 ${k} 必须是整数`;
    if (v < floor[k]) return `属性 ${k} 不能低于特质底线 ${floor[k]}`;
    if (v > floor[k] + OPENING_STAT_INVEST_MAX) return `属性 ${k} 最多 ${floor[k] + OPENING_STAT_INVEST_MAX}`;
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
const TEAM_PRACTICE_AP_COST = 55;
const TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT = 1;
const TEAM_MEETING_AP_COST = 30;
const LOCKER_ROOM_TALK_AP_COST = 25;
const RETAIN_CORE_TEAMMATE_AP_COST = 35;
const TEAM_TRAINING_FOCUS_AP_COST = 20;
const TEAM_TRAINING_FOCUS_TAGS = [
  'team-focus-firepower',
  'team-focus-tactics',
  'team-focus-defense',
  'team-focus-mental',
];
type TeamTrainingFocus = 'firepower' | 'tactics' | 'defense' | 'mental';
const TEAM_TRAINING_FOCUS_LABELS: Record<TeamTrainingFocus, string> = {
  firepower: '枪法压迫',
  tactics: '战术执行',
  defense: '防守纪律',
  mental: '心态稳定',
};

function clubPlayerToTeammate(clubPlayer: ClubPlayer, slotIndex: number, fallbackChemistry: number): Teammate {
  return {
    id: `slot-${slotIndex + 1}`,
    name: clubPlayer.name,
    role: clubPlayer.role,
    personality: clubPlayer.personality,
    traits: [...clubPlayer.traits],
    stats: { ...clubPlayer.stats },
    growthSpent: 0,
    chemistry: clampTeammateChemistry(clubPlayer.internalChemistry ?? fallbackChemistry),
  };
}

function rosterFromClubRuntime(session: GameSession, offer: TeamOffer, rng: () => number): Teammate[] {
  const runtime = previewClubRuntime(session, offer.clubId);
  const fallbackChemistry = runtime.internalChemistry;
  const starters = runtime.fullRoster.filter((clubPlayer) => clubPlayer.status === 'starter');
  const source = (starters.length >= 4 ? starters : runtime.fullRoster).slice(0, 4);
  if (source.length >= 4) {
    return source.map((clubPlayer, index) => clubPlayerToTeammate(clubPlayer, index, fallbackChemistry));
  }
  return generateRoster(offer.tier, rng);
}

function deriveInitialTeamStatus(
  player: Player,
  offer: TeamOffer,
  hadTeam: boolean,
): Pick<PlayerTeam, 'teamStatus' | 'teamStatusUntilRound'> {
  if (!hadTeam && offer.tier === 'youth') {
    return { teamStatus: 'trial', teamStatusUntilRound: player.round + 8 };
  }
  if (offer.tier === 'semi-pro' && player.stage === 'youth') {
    return { teamStatus: 'trial', teamStatusUntilRound: player.round + 8 };
  }
  if ((offer.tier === 'pro' || offer.tier === 'top') && (player.fame ?? 0) < 50) {
    return { teamStatus: 'rotation', teamStatusUntilRound: player.round + 12 };
  }
  return { teamStatus: 'starter' };
}

function detectRoleOverlap(player: Player, roster: Teammate[]): RoleOverlap[] {
  const overlaps: RoleOverlap[] = [];
  const playerIdentities = derivePlayerTeamIdentities(player, roster);
  for (const tm of roster) {
    const teammateIdentities = deriveTeammateIdentities(tm, roster);
    for (const identity of playerIdentities) {
      if (teammateIdentities.includes(identity) && (identity === 'caller' || identity === 'star')) {
        overlaps.push({
          kind: 'identity',
          value: identity,
          teammateId: tm.id,
          teammateName: tm.name,
          severity: (tm.chemistry ?? 50) < 40 ? 'high' : 'medium',
        });
      }
    }
    if (player.preferredRole && tm.role === player.preferredRole && (tm.role === 'IGL' || tm.role === 'AWPer')) {
      overlaps.push({
        kind: 'role',
        value: tm.role,
        teammateId: tm.id,
        teammateName: tm.name,
        severity: (tm.chemistry ?? 50) < 45 ? 'high' : 'medium',
      });
    }
  }
  return overlaps.slice(0, 4);
}

function playerFillsRosterNeed(player: Player, roster: Teammate[], need: RosterNeed): boolean {
  const playerIdentities = derivePlayerTeamIdentities(player, roster);
  if (player.preferredRole && need.neededRoles.includes(player.preferredRole)) return true;
  if (player.activeRole && need.neededRoles.includes(player.activeRole)) return true;
  return need.neededIdentities.some((identity) => playerIdentities.includes(identity));
}

function deriveJoinMode(
  teamStatus: PlayerTeam['teamStatus'],
  fillsNeed: boolean,
  overlaps: RoleOverlap[],
): PlayerTeam['joinMode'] {
  if (teamStatus === 'trial') return 'trial-sixth';
  if (teamStatus === 'rotation') return 'rotation';
  if (fillsNeed) return 'fill-vacancy';
  return overlaps.length > 0 ? 'replace-starter' : 'fill-vacancy';
}

function joinReason(need: RosterNeed, fillsNeed: boolean, overlaps: RoleOverlap[], joinMode: PlayerTeam['joinMode']): string {
  if (joinMode === 'trial-sixth') return '教练组先把你放在试训位，需要用训练和低级别赛事证明稳定性';
  if (joinMode === 'rotation') return '你被视为轮换补强，需要和现有首发竞争出场时间';
  if (fillsNeed && need.reasons[0]) return `你被签下是为了补上缺口：${need.reasons[0]}`;
  if (overlaps.length > 0) return `你和现有队友存在位置重叠：${overlaps[0]!.value}`;
  return '你被视为当前阵容的常规补强';
}

function currentClubProfile(player: Player) {
  return player.team ? getClubProfile(player.team.clubId, player.team.tier) : null;
}

function highestInjuryState(player: Player): InjuryStateTag | null {
  for (const tag of [...INJURY_STATE_TAGS].reverse()) {
    if (player.tags.includes(tag)) return tag;
  }
  return null;
}

function setInjuryState(player: Player, next: InjuryStateTag | null): void {
  player.tags = player.tags.filter((tag) => !INJURY_STATE_TAGS.includes(tag as InjuryStateTag));
  if (next) player.tags = dedupe([...player.tags, next]);
  if (next === 'forced-rest' && (player.restRounds ?? 0) <= 0) {
    player.restRounds = Math.max(1, INJURY_REST_ROUNDS);
  }
  if (next !== 'forced-rest' && (player.restRounds ?? 0) <= 0) {
    player.tags = player.tags.filter((tag) => tag !== 'injured');
  }
}

function applyInjuryRiskTick(
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
  if ((player.restRounds ?? 0) > 0) {
    throw new Error('休养期间不能进行队伍管理');
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

function teammatePracticeDisplayLabel(stat: keyof Teammate['stats']): string {
  if (stat === 'agility') return '枪法';
  if (stat === 'intelligence') return '决策';
  if (stat === 'mentality') return '稳定性';
  return '比赛经验';
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

function clampTeammateChemistry(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function adjustTeammateChemistry(tm: Teammate, delta: number): Teammate {
  return {
    ...tm,
    chemistry: clampTeammateChemistry((tm.chemistry ?? 50) + delta),
  };
}

function adjustRosterChemistry(roster: Teammate[], delta: number): Teammate[] {
  if (delta === 0) return roster;
  return roster.map((tm) => adjustTeammateChemistry(tm, delta));
}

function teammateHasIdentity(player: Player, teammate: Teammate, identity: TeamIdentity): boolean {
  if (teammate.visibleIdentity === identity) return true;
  return deriveTeammateIdentities(teammate, player.roster ?? []).includes(identity);
}

function findTeammateByIdentity(player: Player, identity: TeamIdentity): Teammate | undefined {
  return (player.roster ?? []).find((tm) => teammateHasIdentity(player, tm, identity));
}

function applyTargetTeammateChemistryDelta(
  player: Player,
  identity: TeamIdentity | undefined,
  delta: number | undefined,
): { player: Player; passiveEffect?: string } {
  if (!player.roster || !identity || typeof delta !== 'number' || delta === 0) {
    return { player };
  }

  const target = findTeammateByIdentity(player, identity);
  if (!target) return { player };

  return {
    player: {
      ...player,
      roster: player.roster.map((tm) =>
        tm.id === target.id ? adjustTeammateChemistry(tm, delta) : tm,
      ),
    },
    passiveEffect: `${target.name}默契 ${delta > 0 ? '+' : ''}${delta}`,
  };
}

function teammateIsCore(player: Player, teammate: Teammate): boolean {
  const roster = player.roster ?? [];
  const identities = deriveTeammateIdentities(teammate, roster);
  if (identities.some((identity) => identity === 'star' || identity === 'caller' || identity === 'glue' || identity === 'veteran')) {
    return true;
  }
  const rosterAvg = roster.length > 0
    ? roster.reduce((sum, tm) => sum + teammateAverage(tm), 0) / roster.length
    : 0;
  return teammateAverage(teammate) > rosterAvg;
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

const DEPARTURE_PRESSURE_THRESHOLD = 100;
const DEPARTURE_INITIAL_PRESSURE = 28;
const DEPARTURE_INITIAL_LOCK_ROUNDS = 4;

function clampNumber(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function departureKeyTiers(teamTier: ClubTier): string[] {
  if (teamTier === 'youth') return ['b'];
  if (teamTier === 'semi-pro') return ['a'];
  return ['s-open', 's-closed', 's-class', 'major'];
}

function createInitialPendingDeparture(
  player: Player,
  rng: () => number,
  destTeamName: string,
  slotId: string,
): PendingDeparture {
  const baseWindowStartRound = player.round + 20 + Math.floor(rng() * 21);
  return {
    slotId,
    departureRound: baseWindowStartRound,
    rumorShown: false,
    revealed: false,
    destTeamName,
    earlyRecruit: false,
    baseWindowStartRound,
    pressure: DEPARTURE_INITIAL_PRESSURE,
    pressureThreshold: DEPARTURE_PRESSURE_THRESHOLD,
    lastPressureRound: player.round,
    reasonTags: [],
  };
}

function recalcPendingDeparture(
  session: GameSession,
  player: Player,
  departure: PendingDeparture,
): PendingDeparture {
  if (!player.team || !player.roster) return departure;

  const round = player.round ?? 0;
  const roster = player.roster;
  const target = roster.find((tm) => tm.id === departure.slotId);
  if (!target) return departure;

  const currentPressure = departure.pressure ?? DEPARTURE_INITIAL_PRESSURE;
  const pressureThreshold = departure.pressureThreshold ?? DEPARTURE_PRESSURE_THRESHOLD;
  const baseWindowStartRound = departure.baseWindowStartRound
    ?? Math.max(1, departure.departureRound - 20);
  const reasonTags = new Set(departure.reasonTags ?? []);
  let pressure = currentPressure;
  let projectedDelay = 0;

  if (round >= baseWindowStartRound) {
    let drift = 2;
    const trust = player.teamTrust ?? 50;
    const teamChemistry = deriveTeamChemistry(roster, trust);
    const targetChemistry = target.chemistry ?? 50;
    const playerIdentities = derivePlayerTeamIdentities(player, roster);
    const targetIdentities = deriveTeammateIdentities(target, roster);
    const targetTeam = player.team;
    const teamRuntime = session.worldClubs?.runtimeByClubId[targetTeam.clubId];

    drift += Math.round((52 - trust) / 14);
    drift += Math.round((48 - teamChemistry) / 12);
    drift += Math.round((50 - targetChemistry) / 12);

    if (target.personality === 'drama') drift += 2;
    if (target.personality === 'supportive') drift -= 1;
    if (targetIdentities.includes('problem')) drift += 3;
    if (targetIdentities.includes('glue')) drift -= 2;
    if (targetIdentities.includes('caller') && !playerIdentities.includes('caller')) {
      drift += 4;
      reasonTags.add('话语权冲突');
    }
    if (targetIdentities.includes('star') && !playerIdentities.includes('star')) {
      drift += 2;
      reasonTags.add('明星位冲突');
    }
    if (playerIdentities.includes('caller')) drift -= 1;
    if (playerIdentities.includes('star')) drift -= 1;

    if (teamRuntime) {
      const relevantTiers = departureKeyTiers(targetTeam.tier);
      const recentResults = teamRuntime.recentResults.filter((result) => relevantTiers.includes(result.tier)).slice(0, 4);
      for (const result of recentResults) {
        if (result.result === 'win') {
          drift -= 8;
          reasonTags.add('关键赛事夺冠');
        } else if (result.result === 'deep-run') {
          drift -= 5;
          reasonTags.add('关键赛事深轮');
        } else if (result.result === 'loss') {
          drift += 5;
        } else if (result.result === 'early-exit') {
          drift += 8;
          reasonTags.add('关键赛事早出局');
        }
      }
      if (teamRuntime.currentForm >= 20) {
        drift -= 3;
        reasonTags.add('近期状态火热');
      }
      if (teamRuntime.currentForm <= -20) {
        drift += 4;
        reasonTags.add('近期状态低迷');
      }
      if (teamRuntime.clubTrust >= 65) drift -= 2;
      if (teamRuntime.clubTrust <= 35) drift += 2;
      if (teamRuntime.internalChemistry >= 65) drift -= 2;
      if (teamRuntime.internalChemistry <= 35) drift += 2;
      if (teamRuntime.rosterStability <= 40) drift += 2;
    }

    pressure = clampNumber(pressure + drift, 0, pressureThreshold);

    if (teamRuntime?.recentResults[0]) {
      const latest = teamRuntime.recentResults[0];
      const relevantTiers = departureKeyTiers(targetTeam.tier);
      if (relevantTiers.includes(latest.tier) && (latest.result === 'win' || latest.result === 'deep-run')) {
        const lock = latest.result === 'win' ? 6 : 4;
        reasonTags.add('赛事表现暂时稳住阵容');
        return {
          ...departure,
          baseWindowStartRound,
          pressure,
          pressureThreshold,
          lastPressureRound: round,
          lockedUntilRound: Math.max(departure.lockedUntilRound ?? 0, round + lock),
          reasonTags: [...reasonTags],
          departureRound: Math.max(
            round + 1,
            Math.max(baseWindowStartRound, round + lock),
          ),
        };
      }
    }

    const remaining = Math.max(0, pressureThreshold - pressure);
    projectedDelay = Math.max(1, Math.ceil(remaining / Math.max(1, drift > 0 ? drift : 2)));
  }

  const lockedUntilRound = departure.lockedUntilRound ?? 0;
  const projectedRound = round + projectedDelay;
  const departureRound = Math.max(
    baseWindowStartRound,
    projectedRound,
    lockedUntilRound > round ? lockedUntilRound : round + 1,
  );

  return {
    ...departure,
    baseWindowStartRound,
    pressure,
    pressureThreshold,
    lastPressureRound: round,
    reasonTags: [...reasonTags],
    departureRound,
  };
}

function shouldTriggerPendingDeparture(player: Player, departure: PendingDeparture): boolean {
  const baseWindowStartRound = departure.baseWindowStartRound ?? Math.max(1, departure.departureRound - 20);
  const pressureThreshold = departure.pressureThreshold ?? DEPARTURE_PRESSURE_THRESHOLD;
  return (
    (departure.pressure ?? DEPARTURE_INITIAL_PRESSURE) >= pressureThreshold &&
    player.round >= baseWindowStartRound &&
    player.round >= (departure.lockedUntilRound ?? 0)
  );
}

export function createSession(player: Player, rngSeed: number): GameSession {
  const id = uuid();
  const apiToken = uuid();
  const ts = nowIso();
  const seedSession: GameSession = {
    id,
    player,
    apiToken,
    phase: 'action',
    currentEvent: null,
    history: [],
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
    leaderboard: [],
  };
  const withWorld = ensureWorldClubPool(seedSession);
  const seededWorld = player.team
    ? activateClubRuntime(withWorld, player.team.clubId, 'session-start')
    : withWorld;
  const leaderboard = buildLeaderboard(seededWorld);

  return {
    ...seededWorld,
    phase: 'action',
    currentEvent: null,
    leaderboard,
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
  const matchStressMultiplier = (player.buffs ?? [])
    .filter((buff) => buff.consumeOn === 'match' && (buff.actionTag === 'match' || buff.actionTag === 'all'))
    .reduce((acc, buff) => acc * (buff.matchStressMultiplier ?? 1), 1);

  // 奖金分成：签约战队后俱乐部从奖金抽成
  const playerShare = player.team
    ? (PRIZE_SPLIT[player.team.tier] ?? 1.0)
    : 1.0;
  const rawMoney = won ? (winReward.money ?? 0) : (lossReward.money ?? 0);
  const moneyDelta = player.team && playerShare < 1.0
    ? Math.round(rawMoney * playerShare)
    : rawMoney;

  // Apply stat changes via translateStatDelta for consistency
  const careerExperienceRaw = won ? (winReward.experience ?? 0) : (lossReward.experience ?? 0);
  let nextStats = { ...player.stats };
  nextStats = applyMoneyDeltaToStats(nextStats, moneyDelta);

  let growthApplied = 0;
  let growthKey: StatKey | undefined;
  if (careerExperienceRaw > 0) {
    const res = applyCareerExperienceGrowth(nextStats, careerExperienceRaw);
    nextStats = res.stats;
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
      stress: Math.round((won ? winStressDelta : lossStressDelta) * matchStressMultiplier),
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

function buildTournamentMapResolveResult(
  player: Player,
  sim: MatchSimResult,
): ReturnType<typeof resolveChoice> {
  const chosenOutcome: Outcome = {
    narrative: sim.summary,
    stateDelta: {
      feel: sim.feelDelta,
      tilt: sim.tiltDelta,
      fatigue: sim.fatigueDelta,
      stress: sim.won ? 0 : 5,
    },
  };

  return {
    success: sim.won,
    resultTier: sim.won ? 'success' : 'failure',
    roll: Math.round(sim.rating * 100),
    dc: 50,
    naturalRoll: Math.round(sim.rating * 100),
    chosenOutcome,
    nextStats: player.stats,
    stageAfter: player.stage,
    tagsAdded: [],
    tagsRemoved: [],
    endRun: false,
    endReason: undefined,
    feelDelta: sim.feelDelta,
    tiltDelta: sim.tiltDelta,
    fatigueDelta: sim.fatigueDelta,
    moneyDelta: 0,
    growthApplied: 0,
    growthKey: undefined,
  };
}

function buildTournamentForfeitResolveResult(player: Player, narrative: string): ReturnType<typeof resolveChoice> {
  const chosenOutcome: Outcome = {
    narrative,
    stateDelta: { stress: 8, fatigue: -6 },
    resourceDelta: { fame: -2 },
  };
  return {
    success: false,
    resultTier: 'failure',
    roll: 0,
    dc: 0,
    naturalRoll: 0,
    chosenOutcome,
    nextStats: player.stats,
    stageAfter: player.stage,
    tagsAdded: [],
    tagsRemoved: [],
    endRun: false,
    endReason: undefined,
    feelDelta: 0,
    tiltDelta: 0,
    fatigueDelta: -6,
    moneyDelta: 0,
    growthApplied: 0,
    growthKey: undefined,
  };
}

function injuryAdjustedPlayer(player: Player, mode: 'play-injured' | 'reduce-role'): Player {
  const statPenalty = mode === 'play-injured' ? 2 : 1;
  const fatiguePenalty = mode === 'play-injured' ? 18 : 10;
  return {
    ...player,
    stats: {
      ...player.stats,
      agility: Math.max(0, player.stats.agility - statPenalty),
      mentality: Math.max(0, player.stats.mentality - (mode === 'play-injured' ? 1 : 0)),
    },
    volatile: {
      ...player.volatile,
      fatigue: Math.min(100, player.volatile.fatigue + fatiguePenalty),
      feel: Math.max(-3, player.volatile.feel - 1),
    },
  };
}

export function aggregateSeriesMatchResult(
  player: Player,
  context: TournamentSeriesContext,
): MatchSimResult {
  const maps = context.maps;
  const totals = maps.reduce(
    (acc, map) => ({
      kills: acc.kills + map.kills,
      deaths: acc.deaths + map.deaths,
      assists: acc.assists + map.assists,
      teamScore: acc.teamScore + map.teamScore,
      enemyScore: acc.enemyScore + map.enemyScore,
      headshotRate: acc.headshotRate + map.headshotRate,
      rating: acc.rating + map.rating,
    }),
    { kills: 0, deaths: 0, assists: 0, teamScore: 0, enemyScore: 0, headshotRate: 0, rating: 0 },
  );
  const count = Math.max(1, maps.length);
  if (context.playerMapWins === context.opponentMapWins) {
    throw new Error('series resolved with tied map wins; overtime should prevent this');
  }
  const won = context.playerMapWins > context.opponentMapWins;
  const seriesWinBonus = won ? 0.02 : -0.02;
  const sweepBonus =
    (won && context.playerMapWins >= 2 && context.opponentMapWins === 0) ||
    (!won && context.opponentMapWins >= 2 && context.playerMapWins === 0)
      ? 0.03
      : 0;
  return {
    won,
    kills: totals.kills,
    deaths: totals.deaths,
    assists: totals.assists,
    teamScore: totals.teamScore,
    enemyScore: totals.enemyScore,
    headshotRate: Math.round((totals.headshotRate / count) * 100) / 100,
    rating: Math.round(((totals.rating / count) + seriesWinBonus + sweepBonus) * 100) / 100,
    feelDelta: won ? 1 : -1,
    tiltDelta: won ? 0 : 1,
    fatigueDelta: Math.min(35, 8 * count),
    winProb: won ? 1 : 0,
    summary: `系列赛${won ? '获胜' : '失利'}，总比分 ${context.playerMapWins}-${context.opponentMapWins}。` +
      maps.map((map, index) => ` Map${index + 1} ${map.mapName} ${map.teamScore}:${map.enemyScore}`).join('；'),
  };
}

function matchSimToTournamentMapResult(mapName: string, sim: MatchSimResult): TournamentMapResult {
  return {
    mapName,
    won: sim.won,
    teamScore: sim.teamScore,
    enemyScore: sim.enemyScore,
    kills: sim.kills,
    deaths: sim.deaths,
    assists: sim.assists,
    headshotRate: sim.headshotRate,
    rating: sim.rating,
  };
}

function buildSequencePromptEvent(
  id: string,
  type: EventDef['type'],
  title: string,
  narrative: string,
): EventDef {
  return {
    id,
    type,
    title,
    narrative,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'continue',
        label: '继续',
        description: '继续处理这段事件。',
        check: { primary: 'mentality', dc: 0 },
        success: { narrative },
        failure: { narrative },
      },
    ],
  };
}

function createNarrativeSequence(
  sequenceId: string,
  type: NonNullable<GameSession['activeEventSequence']>['type'],
  startedRound: number,
  steps: EventDef[],
): NonNullable<GameSession['activeEventSequence']> {
  return {
    id: sequenceId,
    type,
    currentIndex: 0,
    startedRound,
    mustCompleteInCurrentRound: true,
    status: 'active',
    context: {},
    steps: steps.map((generatedEvent, index) => ({
      id: `step-${index + 1}`,
      generatedEvent,
      completeSequenceAfter: index === steps.length - 1,
    })),
  };
}

function createAiSequenceFromEvent(
  event: EventDef,
  startedRound: number,
): NonNullable<GameSession['activeEventSequence']> | null {
  const raw = event as unknown as {
    sequenceType?: string;
    steps?: Array<{
      title?: string;
      narrative?: string;
      choices?: EventDef['choices'];
    }>;
    maxSteps?: number;
  };
  if (!raw.sequenceType || !Array.isArray(raw.steps) || raw.steps.length === 0) return null;
  if (!['family-crisis', 'team-conflict', 'tournament-context'].includes(raw.sequenceType)) return null;
  const maxSteps = Math.min(Math.max(raw.maxSteps ?? raw.steps.length, 1), 4);
  const generatedSteps = raw.steps.slice(0, maxSteps).map((step, index) => ({
    ...event,
    id: `${event.id}-step-${index + 1}`,
    title: step.title || `${event.title} ${index + 1}`,
    narrative: step.narrative || event.narrative,
    choices: Array.isArray(step.choices) && step.choices.length > 0 ? step.choices : event.choices,
  }));
  return createNarrativeSequence(
    `ai-sequence-${event.id}-${startedRound}`,
    raw.sequenceType as NonNullable<GameSession['activeEventSequence']>['type'],
    startedRound,
    [...generatedSteps, event],
  );
}

function restoreTournamentSeriesSequenceFromEvent(
  currentEventId: string,
  player: Player,
): NonNullable<GameSession['activeEventSequence']> | null {
  const mapMatch = /^tournament-series-(.+)-(\d+)-map-(\d+)$/.exec(currentEventId);
  const finalMatch = /^tournament-(.+)--(\d+)$/.exec(currentEventId);
  const match = mapMatch ?? finalMatch;
  if (!match) return null;

  const tournamentId = match[1]!;
  const stageIndex = parseInt(match[2]!, 10);
  const tournament = getTournament(tournamentId);
  const stage = tournament?.bracket[stageIndex];
  if (!tournament || !stage || (stage.seriesType !== 'bo3' && stage.seriesType !== 'bo5')) return null;

  const sequence = createTournamentSeriesSequence(
    tournament,
    stageIndex,
    matchBuffsForScope(player.buffs ?? [], 'series'),
  );
  const currentIndex = mapMatch
    ? parseInt(mapMatch[3]!, 10) - 1
    : sequence.steps.length - 1;
  if (currentIndex < 0 || currentIndex >= sequence.steps.length) return null;

  const currentStep = sequence.steps[currentIndex];
  const currentEvent = currentStep?.generatedEvent;
  if (!currentStep || !currentEvent || currentEvent.id !== currentEventId) return null;

  return {
    ...sequence,
    currentIndex,
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

export function assertNoActiveEventSequence(session: GameSession): void {
  if (session.activeEventSequence?.status === 'active') {
    throw new Error('当前事件流程未结束，不能进行其他操作');
  }
}

export function applyChoice(
  session: GameSession,
  choiceId: string,
  rollBonus = 0,
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
): ApplyChoiceResult {
  if (session.status !== 'active') throw new Error('session is not active');
  const sessionPhase = session.currentEvent ? 'event' : (session.phase ?? 'action');
  if (sessionPhase !== 'event') throw new Error('not in event phase');
  if (!session.currentEvent) throw new Error('no pending event on this session');

  const resolveEventById = (eventId: string): EventDef | null => getEventById(eventId) ??
    resolveAiEventById(aiEventCache, eventId) ??
    aiEvents?.find((e) => e.id === eventId) ??
    // Dynamically-generated prep events aren't in EVENT_POOL — reconstruct from pendingMatch
    (eventId.startsWith('tourney-prep-') && session.player.pendingMatch
      ? buildTournamentPrepEvent(session.player.pendingMatch)
      : eventId.startsWith('tourney-injury-') && session.player.pendingMatch
        ? buildInjuryAwareTournamentEvent(session.player.pendingMatch)
      : null);

  const activeSequence = session.activeEventSequence?.status === 'active'
    ? session.activeEventSequence
    : undefined;
  const restoredTournamentSeries = !activeSequence && session.currentEvent
    ? restoreTournamentSeriesSequenceFromEvent(session.currentEvent.id, session.player)
    : null;
  const effectiveActiveSequence = activeSequence ?? restoredTournamentSeries ?? undefined;
  const activeSequenceStep = effectiveActiveSequence ? getCurrentSequenceStep(effectiveActiveSequence) : null;
  if (effectiveActiveSequence && activeSequenceStep) {
    const activeStepEvent = resolveSequenceEventForStep(activeSequenceStep, resolveEventById);
    if (activeStepEvent && activeStepEvent.id !== session.currentEvent.id) {
      throw new Error('current event does not match active event sequence');
    }
  }
  if (effectiveActiveSequence && !activeSequenceStep) {
    throw new Error('active event sequence has no current step');
  }
  const shouldAdvanceRound = effectiveActiveSequence ? isSequenceFinalStep(effectiveActiveSequence) : true;

  const eventDef = effectiveActiveSequence
    ? resolveSequenceEventForStep(activeSequenceStep!, resolveEventById)
    : resolveEventById(session.currentEvent.id);
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
  let tournamentSeriesMapResult: TournamentMapResult | undefined;
  let injuryMatchResolved = false;
  let injuryForfeit = false;
  const tournamentMatch = /^tournament-(.+)--(\d+)$/.exec(eventDef.id);

  const outcome = (() => {
    if (effectiveActiveSequence?.type === 'tournament-series' && activeSequenceStep?.dynamicEventKind === 'tournament-map') {
      const context = effectiveActiveSequence.context as unknown as TournamentSeriesContext;
      const t = getTournament(context.tournamentId);
      const stageIdx = context.stageIndex;
      const stage = t?.bracket[stageIdx];
      if (t && stage) {
        const matchPlayer = playerWithSeriesBuffSnapshot(session.player, context);
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
        pendingMatchSim = simulateMatch(matchPlayer, {
          tier: t.tier,
          progressionTier: t.progressionTier,
          entryType: t.entryType,
          stageIndex: stageIdx,
          effectiveDifficulty: effectiveDiff,
          opponent: session.player.pendingMatch?.opponent,
        }, rng);
        if (session.player.forceMatchResult) {
          pendingMatchSim = applyForcedMatchResult(pendingMatchSim, session.player.forceMatchResult);
        }
        const mapIndex = context.maps.length;
        const mapName = context.mapPool[mapIndex] ?? `Map ${mapIndex + 1}`;
        tournamentSeriesMapResult = matchSimToTournamentMapResult(mapName, pendingMatchSim);
        return buildTournamentMapResolveResult(session.player, pendingMatchSim);
      }
    }

    if (effectiveActiveSequence?.type === 'tournament-series' && activeSequenceStep?.dynamicEventKind === 'tournament-series-decider') {
      const context = effectiveActiveSequence.context as unknown as TournamentSeriesContext;
      const t = getTournament(context.tournamentId);
      const stageIdx = context.stageIndex;
      if (t) {
        const matchPlayer = playerWithSeriesBuffSnapshot(session.player, context);
        pendingMatchSim = aggregateSeriesMatchResult(matchPlayer, context);
        return buildMatchResolveResult(matchPlayer, pendingMatchSim, t, stageIdx);
      }
    }

    if (eventDef.id.startsWith('tourney-injury-') && session.player.pendingMatch) {
      const t = getTournament(session.player.pendingMatch.tournamentId);
      const stageIdx = session.player.pendingMatch.stageIndex;
      const stage = t?.bracket[stageIdx];
      if (choiceDef.id === 'forfeit-injury') {
        injuryForfeit = true;
        return buildTournamentForfeitResolveResult(session.player, choiceDef.success.narrative);
      }
      if (t && stage) {
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus + (choiceDef.id === 'play-injured' ? 1 : 0);
        const adjusted = injuryAdjustedPlayer(
          session.player,
          choiceDef.id === 'reduce-role' ? 'reduce-role' : 'play-injured',
        );
        pendingMatchSim = simulateMatch(adjusted, {
          tier: t.tier,
          progressionTier: t.progressionTier,
          entryType: t.entryType,
          stageIndex: stageIdx,
          effectiveDifficulty: effectiveDiff,
          opponent: session.player.pendingMatch?.opponent,
        }, rng);
        if (session.player.forceMatchResult) {
          pendingMatchSim = applyForcedMatchResult(pendingMatchSim, session.player.forceMatchResult);
        }
        injuryMatchResolved = true;
        const resolved = buildMatchResolveResult(session.player, pendingMatchSim, t, stageIdx);
        resolved.chosenOutcome = {
          ...resolved.chosenOutcome,
          narrative: `${choiceDef.id === 'reduce-role' ? '你降低了承担，避开最吃身体的关键位。' : '你带伤上场，手腕和肩颈都在提醒你这不是正常状态。'}${resolved.chosenOutcome.narrative}`,
          progression: {
            ...(resolved.chosenOutcome.progression ?? {}),
            injuryRestRounds: Math.max(1, session.player.restRounds ?? 1),
          },
        };
        return resolved;
      }
    }

    if (tournamentMatch) {
      const t = getTournament(tournamentMatch[1]!);
      const stageIdx = parseInt(tournamentMatch[2]!, 10);
      const stage = t?.bracket[stageIdx];
      if (t && stage) {
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
        pendingMatchSim = simulateMatch(session.player, {
          tier: t.tier,
          progressionTier: t.progressionTier,
          entryType: t.entryType,
          stageIndex: stageIdx,
          effectiveDifficulty: effectiveDiff,
          opponent: session.player.pendingMatch?.opponent,
        }, rng);
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
    growthApplied: outcome.growthApplied > 0 || (
      outcome.growthKey === 'experience' &&
      Math.abs((statsAfterGrowth.experience ?? 0) - (session.player.stats.experience ?? 0)) > 0.001
    ),
    growthKey: outcome.growthKey,
    fatigueApplied: modifiedState.fatigueApplied,
    stressApplied: modifiedState.stressApplied,
    fatigueReduced: modifiedState.fatigueReduced,
    stressReduced: modifiedState.stressReduced,
  });

  if (chosenEffects.buffAdd) {
    buffs = [...buffs, chosenEffects.buffAdd];
  }

  if (eventDef.type === 'match') {
    if (effectiveActiveSequence?.type === 'tournament-series') {
      if (activeSequenceStep?.dynamicEventKind === 'tournament-map') {
        buffs = consumeMatchBuffsForScope(buffs, 'per-map');
      } else if (activeSequenceStep?.dynamicEventKind === 'tournament-series-decider') {
        buffs = consumeMatchBuffsForScope(buffs, 'series');
      }
    } else if (tournamentMatch) {
      buffs = consumeMatchBuffsForScope(buffs, 'series');
    }
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

  const nextRound = session.player.round + (shouldAdvanceRound ? 1 : 0);
  let careerExperienceGrowth = 0;
  if (shouldAdvanceRound) {
    const careerGrowth = applyCareerExperienceGrowth(statsAfterGrowth, CAREER_TIME_EXPERIENCE_RAW);
    statsAfterGrowth = careerGrowth.stats;
    careerExperienceGrowth = careerGrowth.grown;
    if (careerExperienceGrowth > 0) passiveEffects.push('career-time-experience');
  }

  // ── 属性变化 delta（用于 RoundResult）──
  const statChanges: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const diff = statsAfterGrowth[k] - session.player.stats[k];
    if (Math.abs(diff) > 0.001) statChanges[k] = diff;
  }

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
  let nextTagExpiry: Record<string, number> = { ...(session.player.tagExpiry ?? {}) };
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
  nextTagExpiry = refreshTagExpiry(nextTags, nextTagExpiry, nextRound, tagsAdded);

  const { year: nextYear, week: nextWeek } = shouldAdvanceRound
    ? advanceWeek(session.player.year ?? 1, session.player.week ?? 1)
    : { year: session.player.year ?? 1, week: session.player.week ?? 1 };

  if (shouldAdvanceRound && restRounds > 0) {
    restRounds -= 1;
    if (restRounds === 0) {
      if (!tagsRemoved.includes('injured')) tagsRemoved.push('injured');
      passiveEffects.push('rest-completed');
    }
  }

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
  const nextActionPoints = shouldAdvanceRound
    ? isMatchWeek ? 0 : isInterviewPhase ? 50 : 100
    : session.player.actionPoints;

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
    roundCombos: shouldAdvanceRound ? [] : session.player.roundCombos,
    shopCooldowns: nextShopCooldowns,
    qualificationSlots: nextQualificationSlots,
    teamQualificationSlots: nextTeamQualificationSlots,
    qualificationSlotBatches: nextQualificationSlotBatches,
    teamQualificationSlotBatches: nextTeamQualificationSlotBatches,
    consecutiveLosses,
    consecutiveBrokeRounds,
  };

  if (nextPlayer.team) {
    if (typeof chosenEffects.teamTrustDelta === 'number' && chosenEffects.teamTrustDelta !== 0) {
      nextPlayer.teamTrust = clampTeamTrust((nextPlayer.teamTrust ?? 50) + chosenEffects.teamTrustDelta);
      passiveEffects.push(`队伍信任 ${chosenEffects.teamTrustDelta > 0 ? '+' : ''}${chosenEffects.teamTrustDelta}`);
    }
    if (
      nextPlayer.roster &&
      typeof chosenEffects.teamChemistryDelta === 'number' &&
      chosenEffects.teamChemistryDelta !== 0
    ) {
      nextPlayer.roster = adjustRosterChemistry(nextPlayer.roster, chosenEffects.teamChemistryDelta);
      passiveEffects.push(`全队队友默契 ${chosenEffects.teamChemistryDelta > 0 ? '+' : ''}${chosenEffects.teamChemistryDelta}`);
    }
    if (
      nextPlayer.roster &&
      chosenEffects.targetIdentity &&
      typeof chosenEffects.targetTeammateChemistryDelta === 'number' &&
      chosenEffects.targetTeammateChemistryDelta !== 0
    ) {
      const applied = applyTargetTeammateChemistryDelta(
        nextPlayer,
        chosenEffects.targetIdentity,
        chosenEffects.targetTeammateChemistryDelta,
      );
      nextPlayer = applied.player;
      if (applied.passiveEffect) passiveEffects.push(applied.passiveEffect);
    }
    if (
      nextPlayer.roster &&
      chosenEffects.opposingTargetIdentity &&
      typeof chosenEffects.opposingTargetTeammateChemistryDelta === 'number' &&
      chosenEffects.opposingTargetTeammateChemistryDelta !== 0
    ) {
      const applied = applyTargetTeammateChemistryDelta(
        nextPlayer,
        chosenEffects.opposingTargetIdentity,
        chosenEffects.opposingTargetTeammateChemistryDelta,
      );
      nextPlayer = applied.player;
      if (applied.passiveEffect) passiveEffects.push(applied.passiveEffect);
    }
  }

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
  if (shouldAdvanceRound && nextPlayer.team && nextPlayer.salaryTracker) {
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

  if (
    nextPlayer.team?.teamStatus &&
    nextPlayer.team.teamStatus !== 'starter' &&
    nextPlayer.team.teamStatusUntilRound &&
    nextPlayer.round >= nextPlayer.team.teamStatusUntilRound
  ) {
    nextPlayer.team = {
      ...nextPlayer.team,
      teamStatus: 'starter',
    };
    delete nextPlayer.team.teamStatusUntilRound;
    passiveEffects.push('队伍定位更新：你已进入首发名单');
  }

  const recoveryEffects: string[] = [];
  if (shouldAdvanceRound || eventDef.id.startsWith('bailout-')) {
    processRecoverySystems(nextPlayer, eventDef.id, recoveryEffects, choiceDef);
    passiveEffects.push(...recoveryEffects);
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

  if (shouldAdvanceRound && nextPlayer.activeRole) {
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
  if (shouldAdvanceRound && nextPlayer.roster) {
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
    nextPlayer = refreshVisibleTeamIdentities(nextPlayer);
  }

  if (eventDef.type === 'tournament-context') {
    nextPlayer = markTournamentContextEventConsumed(nextPlayer, eventDef.id);
  }

  nextPlayer = applyInjuryRiskTick(
    nextPlayer,
    eventDef.type === 'match'
      ? 'match'
      : eventDef.type === 'rest'
        ? 'rest'
        : 'routine',
    passiveEffects,
  );

  const teamSnapshot = session.player.team
    ? {
        clubId: session.player.team.clubId,
        name: session.player.team.name,
        tag: session.player.team.tag,
        region: session.player.team.region,
        tier: session.player.team.tier,
      }
    : undefined;

  nextPlayer = applyAutomaticTagCleanup(nextPlayer, tagsRemoved);

  const result: RoundResult = {
    round: nextPlayer.round,
    eventId: eventDef.id,
    eventType: eventDef.type,
    eventTitle: eventDef.title,
    teamSnapshot,
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
    tagsRemoved,
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
    ...(activeSequence ? sequenceResultFields(activeSequence) : {}),
    createdAt: nowIso(),
  };

  const ending = checkEnding(nextPlayer, outcome.endRun, outcome.endReason);

  // ── 赛事进度 ──
  let leaderboard = buildLeaderboard(session);
  let worldTournamentResult: { tournament: Tournament; playerWon: boolean; isFinalStage: boolean; opponentClubId?: string } | null = null;
  let worldStateSession: GameSession = session;
  const resolvesPendingTournament =
    nextPlayer.pendingMatch &&
    (
      eventDef.id.startsWith(`tournament-${nextPlayer.pendingMatch.tournamentId}--`) ||
      injuryMatchResolved ||
      injuryForfeit
    );
  if (resolvesPendingTournament && nextPlayer.pendingMatch) {
    const t = getTournament(nextPlayer.pendingMatch.tournamentId);
    const idx = nextPlayer.pendingMatch.stageIndex;
    const isFinal = t ? idx >= t.bracket.length - 1 : true;

    if (t) {
      worldTournamentResult = {
        tournament: t,
        playerWon: outcome.success,
        isFinalStage: isFinal,
        opponentClubId: nextPlayer.pendingMatch.opponent?.clubId,
      };
      const reward = injuryForfeit
        ? { points: 0, fame: 0 }
        : stageRewardDelta(t, idx, outcome.success);
      const extraPoints = chosenResourceDelta.points;
      const totalPoints = reward.points + extraPoints;
      if (!nextPlayer.team && totalPoints !== 0) {
        leaderboard = addPlayerPoints(leaderboard, totalPoints);
      }

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
        for (const key of dedupe([t.tier, t.progressionTier, ...championshipTierKeys(t)])) {
          tierChamp[key] = (tierChamp[key] ?? 0) + 1;
        }
        nextPlayer.tierChampionships = tierChamp;
        const championshipSeries = { ...(nextPlayer.championshipSeries ?? {}) };
        for (const key of championshipSeriesKeys(t)) {
          championshipSeries[key] = (championshipSeries[key] ?? 0) + 1;
        }
        nextPlayer.championshipSeries = championshipSeries;
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
      if (t) {
        nextPlayer = recordTournamentContextMatchResult(
          nextPlayer,
          result.matchStats,
          outcome.success,
          isFinal,
          isFinal && outcome.success,
        );
      }
      nextPlayer.pendingMatch = null;
    } else {
      const adv = advanceWeek(nextYear, nextWeek);
      const nextPendingMatch = {
        ...nextPlayer.pendingMatch,
        stageIndex: idx + 1,
        resolveYear: adv.year,
        resolveWeek: adv.week,
        opponent: undefined,
      };
      const opponentAssigned = assignPendingMatchOpponent(
        { ...session, player: nextPlayer },
        nextPendingMatch,
      );
      worldStateSession = opponentAssigned.session;
      nextPlayer = opponentAssigned.session.player;
      nextPlayer.pendingMatch = opponentAssigned.pendingMatch;
      nextPlayer = advanceTournamentContextStage(nextPlayer, nextPlayer.pendingMatch, t);
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
      const statusMult = nextPlayer.team?.teamStatus === 'trial'
        ? 0.5
        : nextPlayer.team?.teamStatus === 'rotation'
          ? 0.75
          : 1;
      const trustDelta = Math.round(trustBase * personalityMult * statusMult);
      nextPlayer.teamTrust = clampTeamTrust(
        (nextPlayer.teamTrust ?? 50) + trustDelta,
      );
      const rawChemistryDelta = outcome.success ? 1 : (nextPlayer.teamTrust ?? 50) < 30 ? -1 : 0;
      const chemistryDelta = nextPlayer.team?.teamStatus === 'trial' ? 0 : rawChemistryDelta;
      nextPlayer.roster = adjustRosterChemistry(nextPlayer.roster, chemistryDelta);
      passiveEffects.push(
        outcome.success ? '队伍信任上升' : '队伍信任下降',
      );
      if (statusMult < 1) {
        passiveEffects.push(nextPlayer.team?.teamStatus === 'trial' ? '试训定位：队伍收益减半' : '轮换定位：队伍收益降低');
      }
      if (chemistryDelta !== 0) {
        passiveEffects.push(
          chemistryDelta > 0 ? '全队队友默契上升' : '全队队友默契下降',
        );
      }
    }
  }

  if (eventDef.id.startsWith('promotion-')) {
    if (nextPlayer.stage !== stageBefore) {
      nextPlayer.promotionPending = null;
    } else {
      nextPlayer.promotionPending = null;
      nextPlayer.promotionCooldown = nextPlayer.round + PROMOTION_DECLINE_COOLDOWN_ROUNDS;
    }
  }

  // ── 队友转会到期：执行替换 + 重新调度 ────────────────────────────
  if (shouldAdvanceRound && nextPlayer.pendingDeparture && nextPlayer.roster && nextPlayer.team) {
    nextPlayer.pendingDeparture = recalcPendingDeparture(
      { ...session, player: nextPlayer },
      nextPlayer,
      nextPlayer.pendingDeparture,
    );
    const shouldDepart =
      !nextPlayer.pendingMatch &&
      shouldTriggerPendingDeparture(nextPlayer, nextPlayer.pendingDeparture);

    if (shouldDepart) {
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
      const nextRoster = nextPlayer.roster ?? [];
      if (nextRoster.length > 0) {
        const nextSlot = nextRoster[Math.floor(rng() * nextRoster.length)]!.id;
        const rivals = nextPlayer.rivals.length > 0 ? nextPlayer.rivals : [{ name: '某支战队', tag: '???', region: '' }];
        const nextDest = rivals[Math.floor(rng() * rivals.length)]!.name;
        nextPlayer.pendingDeparture = createInitialPendingDeparture(
          nextPlayer,
          rng,
          nextDest,
          nextSlot,
        );
      } else {
        nextPlayer.pendingDeparture = undefined;
      }
    }
  }

  // 离队后清除 pendingDeparture（玩家自己离队）
  if (!nextPlayer.team) {
    nextPlayer.pendingDeparture = undefined;
  }

  if (nextPlayer.forceNextEvent && nextPlayer.forceNextEvent === eventDef.id) {
    nextPlayer.forceNextEvent = null;
  }

  if (shouldAdvanceRound) {
    nextPlayer = cleanupTournamentContext(nextPlayer);
  }

  nextPlayer = applyAutomaticTagCleanup(nextPlayer, tagsRemoved);

  result.narrative = substituteRivals(result.narrative, nextPlayer.rivals);
  result.narrative = substituteTeammates(result.narrative, nextPlayer.roster ?? []);
  result.eventTitle = substituteRivals(result.eventTitle, nextPlayer.rivals);
  result.eventTitle = substituteTeammates(result.eventTitle, nextPlayer.roster ?? []);

  if (effectiveActiveSequence) {
    let sequenceForAdvance = effectiveActiveSequence;
    if (effectiveActiveSequence.type === 'tournament-series' && tournamentSeriesMapResult) {
      const context = effectiveActiveSequence.context as unknown as TournamentSeriesContext;
      const maps = [...context.maps, tournamentSeriesMapResult];
      const playerMapWins = context.playerMapWins + (tournamentSeriesMapResult.won ? 1 : 0);
      const opponentMapWins = context.opponentMapWins + (tournamentSeriesMapResult.won ? 0 : 1);
      sequenceForAdvance = {
        ...effectiveActiveSequence,
        context: {
          ...context,
          maps,
          playerMapWins,
          opponentMapWins,
        } as unknown as Record<string, unknown>,
      };
    }
    const sequenceAdvance = advanceEventSequence(sequenceForAdvance, result, nextPlayer, resolveEventById);
    if (sequenceAdvance.nextStepEvent && sequenceAdvance.sequence) {
      const transferTarget = nextPlayer.pendingDeparture
        ? (nextPlayer.roster ?? []).find((tm) => tm.id === nextPlayer.pendingDeparture!.slotId)?.name
        : undefined;
      const updated: GameSession = {
        ...session,
        player: nextPlayer,
        phase: 'event',
        currentEvent: toPublicEvent(
          sequenceAdvance.nextStepEvent,
          nextPlayer.rivals,
          nextPlayer.roster ?? [],
          transferTarget,
        ),
        activeEventSequence: sequenceAdvance.sequence,
        history: [...session.history, result],
        status: ending ? 'ended' : 'active',
        ending: ending ?? session.ending,
        updatedAt: nowIso(),
      };
      return { session: updated, result };
    }

    if (sequenceAdvance.cancelled) {
      passiveEffects.push(`事件流程取消：${sequenceAdvance.cancelReason ?? 'unknown'}`);
      const updated: GameSession = {
        ...session,
        player: nextPlayer,
        phase: 'action',
        currentEvent: null,
        activeEventSequence: undefined,
        history: [...session.history, result],
        status: ending ? 'ended' : 'active',
        ending: ending ?? session.ending,
        updatedAt: nowIso(),
      };
      return { session: updated, result };
    }
  }

  let worldSession = { ...worldStateSession, player: nextPlayer };
  if (nextPlayer.team) {
    worldSession = activateClubRuntime(worldSession, nextPlayer.team.clubId, 'player-team-active');
  }
  worldSession = tickWorldClubRuntimes(worldSession, nextPlayer.round, 'round');
  if (worldTournamentResult) {
    worldSession = recordWorldTournamentResult(
      worldSession,
      worldTournamentResult.tournament,
      worldTournamentResult.playerWon,
      worldTournamentResult.isFinalStage,
      worldTournamentResult.opponentClubId,
    );
  }
  leaderboard = buildLeaderboard(worldSession, leaderboard);

  const updated: GameSession = {
    ...worldSession,
    player: nextPlayer,
    phase: 'action',
    currentEvent: null,
    activeEventSequence: undefined,
    history: [...session.history, result],
    status: ending ? 'ended' : 'active',
    ending: ending ?? session.ending,
    updatedAt: nowIso(),
    leaderboard,
  };

  return { session: updated, result };
}

export interface EndActionPhaseResult {
  session: GameSession;
  pickedEvent: EventDef | null;
}

export function endActionPhase(
  session: GameSession,
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
): EndActionPhaseResult {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const sessionPhase = session.phase ?? (session.currentEvent ? 'event' : 'action');
  if (sessionPhase !== 'action') throw new Error('not in action phase');

  const nextPlayer = session.player;
  const recentEventIds = session.history.slice(-2).map((r) => r.eventId);
  const rng = makeRng(
    hashString(session.id) ^ (((nextPlayer.round ?? 0) * 1000 + (nextPlayer.actionPoints ?? 0) + 17) * 2654435761),
  );
  let pickedEvent = pickEvent({
    player: nextPlayer,
    recentEventIds,
    rng,
    leaderboard: session.leaderboard,
    aiEvents,
    aiEventCandidates: buildAiPickCandidates(aiEventCache, nextPlayer, session.history),
  });

  const transferTarget = nextPlayer.pendingDeparture
    ? (nextPlayer.roster ?? []).find((tm) => tm.id === nextPlayer.pendingDeparture!.slotId)?.name
    : undefined;

  let activeEventSequence = session.activeEventSequence;
  const tournamentMatch = pickedEvent ? /^tournament-(.+)--(\d+)$/.exec(pickedEvent.id) : null;
  if (tournamentMatch) {
    const tournament = getTournament(tournamentMatch[1]!);
    const stageIndex = parseInt(tournamentMatch[2]!, 10);
    const stage = tournament?.bracket[stageIndex];
    if (tournament && stage && (stage.seriesType === 'bo3' || stage.seriesType === 'bo5')) {
      activeEventSequence = {
        ...createTournamentSeriesSequence(tournament, stageIndex, matchBuffsForScope(nextPlayer.buffs ?? [], 'series')),
        startedRound: nextPlayer.round,
      };
      pickedEvent = activeEventSequence.steps[0]?.generatedEvent ?? pickedEvent;
    }
  }
  const interviewIds = new Set([
    'chain-club-interview',
    'chain-club-interview-open-match',
    'chain-club-interview-talent',
  ]);
  if (!activeEventSequence && pickedEvent && interviewIds.has(pickedEvent.id)) {
    activeEventSequence = createNarrativeSequence(
      `club-interview-${nextPlayer.round}`,
      'club-interview',
      nextPlayer.round,
      [
        buildSequencePromptEvent(
          `club-interview-${nextPlayer.round}-question-1`,
          'tryout',
          '面试问题：你的定位',
          '战队没有马上进入合同细节，而是先问你怎么看自己的队内定位。',
        ),
        buildSequencePromptEvent(
          `club-interview-${nextPlayer.round}-question-2`,
          'tryout',
          '面试问题：压力和目标',
          '第二个问题更直接：如果成绩不顺，你准备怎么证明自己值得这个名额。',
        ),
        pickedEvent,
      ],
    );
    pickedEvent = activeEventSequence.steps[0]?.generatedEvent ?? pickedEvent;
  }
  if (!activeEventSequence && pickedEvent?.id === 'family-crisis-illness') {
    activeEventSequence = createNarrativeSequence(
      `family-crisis-${nextPlayer.round}`,
      'family-crisis',
      nextPlayer.round,
      [
        buildSequencePromptEvent(
          `family-crisis-${nextPlayer.round}-call`,
          'life',
          '家里的未接来电',
          '训练间隙，手机屏幕亮了又灭。家里连续打来几个电话，你意识到这不是普通问候。',
        ),
        buildSequencePromptEvent(
          `family-crisis-${nextPlayer.round}-pressure`,
          'life',
          '需要立刻决定',
          '消息讲清楚后，压力一下压到眼前。你必须决定职业节奏和家里状况哪个先处理。',
        ),
        pickedEvent,
      ],
    );
    pickedEvent = activeEventSequence.steps[0]?.generatedEvent ?? pickedEvent;
  }
  if (!activeEventSequence && pickedEvent?.id === 'chain-team-conflict') {
    activeEventSequence = createNarrativeSequence(
      `team-conflict-${nextPlayer.round}`,
      'team-conflict',
      nextPlayer.round,
      [
        buildSequencePromptEvent(
          `team-conflict-${nextPlayer.round}-review`,
          'team',
          '复盘室里的火药味',
          '复盘刚开始，几个关键回合就被反复拖回进度条。你能感觉到这次不是普通争论。',
        ),
        buildSequencePromptEvent(
          `team-conflict-${nextPlayer.round}-private`,
          'team',
          '私下表态',
          '会议暂停后，有人单独找你聊了几句。你知道接下来的表态会影响更衣室站位。',
        ),
        pickedEvent,
      ],
    );
    pickedEvent = activeEventSequence.steps[0]?.generatedEvent ?? pickedEvent;
  }
  if (!activeEventSequence && pickedEvent?.id.startsWith('ai-')) {
    const aiSequence = createAiSequenceFromEvent(pickedEvent, nextPlayer.round);
    if (aiSequence) {
      activeEventSequence = aiSequence;
      pickedEvent = activeEventSequence.steps[0]?.generatedEvent ?? pickedEvent;
    }
  }

  const updated: GameSession = {
    ...session,
    phase: 'event',
    currentEvent: pickedEvent ? toPublicEvent(pickedEvent, nextPlayer.rivals, nextPlayer.roster ?? [], transferTarget) : null,
    activeEventSequence,
    updatedAt: nowIso(),
  };

  return { session: updated, pickedEvent };
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
    if (isProPlus && (player.fame ?? 0) >= LEGEND_FAME_THRESHOLD && hasGrandSlam(player)) return 'legend';
    if (isSemiProPlus && player.tags.includes('major-champion')) return 'champion';
    return 'retired_on_top';
  }
  if (player.stage === 'retired') return 'quiet_exit';
  return undefined;
}

export interface ApplyActionResult {
  actionResult: ActionResult;
  player: Player;
  currentEvent: GameEventPublic | null;
  pickedEvent: EventDef | null;
}

export function applyAction(
  session: GameSession,
  actionId: string,
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
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
  assertNoActiveEventSequence(session);

  const item = getShopItem(itemId);
  if (!item) throw new Error(`未知商品: ${itemId}`);

  const player = session.player;
  if ((player.restRounds ?? 0) > 0) {
    throw new Error('休养期间不能购买商店物品');
  }
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

  let tagExpiry = refreshTagExpiry(
    tags,
    player.tagExpiry ?? {},
    round,
    [effect.tagAdd, shopNarrative ? item.negativeEvents?.find((neg) => neg.narrative === shopNarrative)?.effect.tagAdd : undefined]
      .filter((tag): tag is string => Boolean(tag)),
  );

  let nextPlayer: Player = {
    ...player,
    stats,
    volatile: { feel, tilt, fatigue },
    buffs,
    stress,
    fame,
    tags,
    tagExpiry,
    shopCooldowns: nextShopCooldowns,
    weeklyShopPurchases: nextWeeklyShopPurchases,
    ownedItems: item.category === 'equipment' && !(player.ownedItems ?? []).includes(itemId)
      ? [...(player.ownedItems ?? []), itemId]
      : player.ownedItems,
  };
  const shopTagsRemoved: string[] = effect.tagRemove ? [effect.tagRemove] : [];
  nextPlayer = applyAutomaticTagCleanup(nextPlayer, shopTagsRemoved);
  tagExpiry = nextPlayer.tagExpiry ?? tagExpiry;

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
    shopTagsRemoved: shopTagsRemoved.length > 0 ? shopTagsRemoved : undefined,
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
  if ((player.restRounds ?? 0) > 0) {
    throw new Error('休养期间不能申请战队');
  }
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
  if ((player.restRounds ?? 0) > 0) {
    throw new Error('休养期间不能处理入队邀请');
  }
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
  assertNoActiveEventSequence(session);
  if (!teammateId) throw new Error('teammateId 必填');
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_PRACTICE_AP_COST);

  const roster = player.roster ?? [];
  const targetIndex = roster.findIndex((tm) => tm.id === teammateId);
  if (targetIndex === -1) throw new Error('未知队友');

  const actionKey = `practice:${teammateId}`;
  if (weeklyPracticeTotal(player) >= TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT) {
    throw new Error(`本周队友加练次数已达上限（${TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT} 次）`);
  }
  if (weeklyTeamActionCount(player, actionKey) >= 1) {
    throw new Error('本周已经和这名队友加练过');
  }

  const target = roster[targetIndex]!;
  const primaryStat = primaryStatForRole(target.role);
  const primaryStatLabel = teammatePracticeDisplayLabel(primaryStat);
  const profile = currentClubProfile(player);
  const teamCombos = matchingTeamActionCombos(player, 'team-practice');
  let dc = 8 + Math.floor(teammateAverage(target) / 4);
  dc += profile?.managementModifiers.teamPracticeDc ?? 0;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');
  const check = rollTeamAction(
    player,
    primaryStat as StatKey,
    'experience',
    dc,
    `${session.id}:team-practice:${player.round}:${player.actionPoints}:${teammateId}`,
  );
  const growthBase = check.success ? 0.4 + Math.min(0.4, Math.max(0, (check.roll - dc) * 0.05)) : 0.1;
  const growth = growthBase * (profile?.managementModifiers.teamPracticeGrowthMultiplier ?? 1);
  const chemistryDelta = (check.success ? 4 : 1) + sumTeamComboEffect(teamCombos, 'chemistryDelta');
  const nextRoster = [...roster];
  nextRoster[targetIndex] = adjustTeammateChemistry(
    applyTeammateGrowth(target, primaryStat, growth),
    chemistryDelta,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = Math.round((check.success ? 12 : 10) * (profile?.managementModifiers.fatigueMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'fatigueDelta');
  const stressDelta = Math.round((check.success ? 4 : 8) * (profile?.managementModifiers.stressMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 0 : target.personality === 'drama' ? -1 : 0)
    + sumTeamComboEffect(teamCombos, 'trustDelta');
  const comboResult = resolveTeamActionCombos(player, 'team-practice', check.success);
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
    roundCombos: comboResult.roundCombos,
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
        `${target.name}队友默契 +${chemistryDelta}`,
        profile ? `战队风格修正：${profile.rosterStyle}` : '战队风格修正：无',
        trustDelta < 0 ? '队伍信任小幅下降' : '队伍信任不变',
        `疲劳 +${fatigueDelta}`,
        `压力 +${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyTeamMeeting(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_MEETING_AP_COST);
  const actionKey = 'team-meeting';
  const limit = TEAM_ACTION_LIMITS[actionKey] ?? 1;
  if (weeklyTeamActionCount(player, actionKey) >= limit) {
    throw new Error('本周已经开过战术会议');
  }

  const profile = currentClubProfile(player);
  const teamCombos = matchingTeamActionCombos(player, 'team-meeting');
  let dc = 10 + (profile?.managementModifiers.teamMeetingDc ?? 0);
  if ((player.teamTrust ?? 50) < 30) dc += 2;
  if (player.tags.includes('locker-tension')) dc += 2;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');
  const check = rollTeamAction(
    player,
    'intelligence',
    'mentality',
    dc,
    `${session.id}:team-meeting:${player.round}:${player.actionPoints}`,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = Math.round((check.success ? 6 : 5) * (profile?.managementModifiers.fatigueMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'fatigueDelta');
  const stressDelta = Math.round((check.success ? 3 : 10) * (profile?.managementModifiers.stressMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 4 : -2) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const chemistryDelta = (check.success ? 2 : 0) + sumTeamComboEffect(teamCombos, 'chemistryDelta');
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
  const comboResult = resolveTeamActionCombos(player, 'team-meeting', check.success);

  const nextPlayer: Player = {
    ...player,
    roster: player.roster ? adjustRosterChemistry(player.roster, chemistryDelta) : player.roster,
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
    roundCombos: comboResult.roundCombos,
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
        chemistryDelta > 0 ? `全队队友默契 +${chemistryDelta}` : '队友默契不变',
        profile ? `战队风格修正：${profile.rosterStyle}` : '战队风格修正：无',
        check.success ? '获得增益：战术统一' : '更衣室气氛承压',
        `疲劳 +${fatigueDelta}`,
        `压力 +${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyLockerRoomTalk(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
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
  const profile = currentClubProfile(player);
  const teamCombos = matchingTeamActionCombos(player, 'locker-room-talk');
  let dc = 10 + (profile?.managementModifiers.lockerRoomTalkDc ?? 0);
  if (roster.some((tm) => tm.personality === 'drama')) dc += 2;
  if (roster.some((tm) => tm.personality === 'supportive')) dc -= 1;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');
  const check = rollTeamAction(
    player,
    'mentality',
    'experience',
    dc,
    `${session.id}:locker-room-talk:${player.round}:${player.actionPoints}`,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = Math.round((check.success ? 3 : 0) * (profile?.managementModifiers.fatigueMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'fatigueDelta');
  const stressDelta = Math.round((check.success ? -5 : 10) * (profile?.managementModifiers.stressMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 5 : -3) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const nextTags = check.success
    ? player.tags.filter((tag) => tag !== 'locker-tension')
    : player.tags;
  const comboResult = resolveTeamActionCombos(player, 'locker-room-talk', check.success);
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
    roundCombos: comboResult.roundCombos,
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
        profile ? `战队风格修正：${profile.rosterStyle}` : '战队风格修正：无',
        fatigueDelta !== 0 ? `疲劳 +${fatigueDelta}` : '疲劳不变',
        `压力 ${stressDelta > 0 ? '+' : ''}${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyRetainCoreTeammate(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  assertTeamActionAvailable(player, RETAIN_CORE_TEAMMATE_AP_COST);

  const departure = player.pendingDeparture;
  if (!departure || !departure.revealed) {
    throw new Error('当前没有已经明确的核心队友离队风险');
  }
  if (departure.retentionAttempted) {
    throw new Error('这次离队风险已经尝试过挽留');
  }
  if (player.round >= departure.departureRound) {
    throw new Error('已经进入离队结算阶段，无法再挽留');
  }

  const roster = player.roster ?? [];
  const target = roster.find((tm) => tm.id === departure.slotId);
  if (!target) throw new Error('离队目标已不在当前阵容中');
  if (!teammateIsCore(player, target)) {
    throw new Error('这名队友暂不属于核心挽留目标');
  }

  const identities = deriveTeammateIdentities(target, roster);
  const teamCombos = matchingTeamActionCombos(player, 'retain-core-teammate');
  let dc = 12;
  if ((player.teamTrust ?? 50) < 30) dc += 2;
  if ((target.chemistry ?? 50) >= 70) dc -= 2;
  if (identities.includes('star')) dc += 1;
  if (identities.includes('glue')) dc -= 1;
  if (identities.includes('problem')) dc += 1;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');

  const check = rollTeamAction(
    player,
    'mentality',
    'experience',
    dc,
    `${session.id}:retain-core-teammate:${player.round}:${player.actionPoints}:${target.id}`,
  );
  const lowTrustFailure = !check.success && (player.teamTrust ?? 50) < 30;
  const bigFailure = !check.success && (check.naturalRoll === 1 || check.roll <= dc - 5 || lowTrustFailure);
  const pressureDelta = check.success ? -18 : bigFailure ? 8 : 4;
  const trustDelta = (check.success ? 1 : -4) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const stressDelta = (check.success ? 4 : 8) + sumTeamComboEffect(teamCombos, 'stressDelta');
  const nextPressure = clampNumber(
    (departure.pressure ?? DEPARTURE_INITIAL_PRESSURE) + pressureDelta,
    0,
    departure.pressureThreshold ?? DEPARTURE_PRESSURE_THRESHOLD,
  );
  const nextDeparture: PendingDeparture = {
    ...departure,
    pressure: nextPressure,
    lockedUntilRound: check.success ? Math.max(departure.lockedUntilRound ?? 0, player.round + 4) : departure.lockedUntilRound,
    departureRound: Math.max(
      player.round + 1,
      departure.departureRound + (check.success ? 4 : bigFailure ? -1 : 0),
    ),
    retentionAttempted: true,
    retentionAttemptRound: player.round,
  };
  const comboResult = resolveTeamActionCombos(player, 'retain-core-teammate', check.success);
  const nextPlayer = refreshVisibleTeamIdentities({
    ...player,
    pendingDeparture: nextDeparture,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    actionPoints: (player.actionPoints ?? 0) - RETAIN_CORE_TEAMMATE_AP_COST,
    roundCombos: comboResult.roundCombos,
  });

  return {
    player: nextPlayer,
    result: {
      actionId: 'retain-core-teammate',
      label: `挽留 ${target.name}`,
      teammateId: target.id,
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? `你和 ${target.name} 把离队的顾虑摊开聊了一次，对方没有立刻改变主意，但愿意再多给这支队一些时间。`
        : bigFailure
          ? `这次谈话没能建立信任，${target.name} 反而更确定自己需要离开。`
          : `你试着挽留 ${target.name}，但对方只给出了模糊回应，离队计划没有变化。`,
      effects: [
        check.success ? '离队时间 +6 回合' : bigFailure ? '离队时间 -2 回合' : '离队时间不变',
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        `压力 +${stressDelta}`,
        '本次离队风险不可再次挽留',
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyTeamTrainingFocus(
  session: GameSession,
  focus: string,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_TRAINING_FOCUS_AP_COST);
  if (!Object.prototype.hasOwnProperty.call(TEAM_TRAINING_FOCUS_LABELS, focus)) {
    throw new Error('未知训练重点');
  }
  const typedFocus = focus as TeamTrainingFocus;
  const roster = player.roster ?? [];
  if (!canInfluenceTeamStrategy(player, roster)) {
    throw new Error('你还没有足够的队内话语权，教练组只会听取个人反馈');
  }

  const teamCombos = matchingTeamActionCombos(player, 'team-training-focus');
  let dc = 12;
  if ((player.fame ?? 0) >= 100) dc -= 2;
  if (canInfluenceByCalling(player, roster)) dc -= 2;
  if ((player.teamTrust ?? 50) >= 65) dc -= 1;
  if ((player.teamTrust ?? 50) < 35) dc += 2;
  if (player.team?.tier === 'top') dc += 1;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');

  const check = rollTeamAction(
    player,
    'intelligence',
    'experience',
    dc,
    `${session.id}:team-training-focus:${player.round}:${player.actionPoints}:${typedFocus}`,
  );
  const focusTag = `team-focus-${typedFocus}`;
  const stressDelta = (check.success ? 3 : 6) + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 1 : -1) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const nextTags = check.success
    ? dedupe([...player.tags.filter((tag) => !TEAM_TRAINING_FOCUS_TAGS.includes(tag)), focusTag])
    : player.tags;
  const nextTagExpiry = check.success
    ? { ...(player.tagExpiry ?? {}), [focusTag]: player.round + 4 }
    : player.tagExpiry;
  const comboResult = resolveTeamActionCombos(player, 'team-training-focus', check.success);
  const nextPlayer = refreshVisibleTeamIdentities({
    ...player,
    tags: nextTags,
    tagExpiry: nextTagExpiry,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    actionPoints: (player.actionPoints ?? 0) - TEAM_TRAINING_FOCUS_AP_COST,
    roundCombos: comboResult.roundCombos,
  });

  return {
    player: nextPlayer,
    result: {
      actionId: 'team-training-focus',
      label: `建议训练重点：${TEAM_TRAINING_FOCUS_LABELS[typedFocus]}`,
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? `你把复盘材料整理好交给教练组，${TEAM_TRAINING_FOCUS_LABELS[typedFocus]} 成为接下来几周的训练重点。`
        : '教练组听完你的建议后没有立刻采纳，几个人对训练方向仍然有分歧。',
      effects: [
        check.success ? `训练重点：${TEAM_TRAINING_FOCUS_LABELS[typedFocus]}（4 周）` : '训练重点未改变',
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        `压力 +${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
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

  const TIER_MIN_STAGE: Record<ClubTier, Stage> = {
    youth: 'youth',
    'semi-pro': 'second',
    pro: 'pro',
    top: 'pro',
  };
  const minStage = TIER_MIN_STAGE[offer.tier];
  const nextStage = stageIndex(minStage) > stageIndex(player.stage) ? minStage : player.stage;

  const rosterRng = makeRng(hashString(session.id) ^ (player.round * 7919));
  const runtime = previewClubRuntime(session, offer.clubId);
  const need = deriveRosterNeed(runtime);
  const roster = rosterFromClubRuntime(session, offer, rosterRng);
  const initialStatus = deriveInitialTeamStatus(player, offer, hadTeam);
  const overlaps = detectRoleOverlap(player, roster);
  const fillsNeed = playerFillsRosterNeed(player, roster, need);
  const mode = deriveJoinMode(initialStatus.teamStatus, fillsNeed, overlaps);
  const team: PlayerTeam = {
    clubId: offer.clubId,
    name: offer.clubName,
    tag: offer.tag,
    region: offer.region,
    tier: offer.tier,
    monthlySalary: offer.monthlySalary,
    joinedRound: player.round,
    ...initialStatus,
    joinMode: mode,
    joinReason: joinReason(need, fillsNeed, overlaps, mode),
    roleOverlap: overlaps,
  };

  const cleanTags = player.tags.filter((t) => t !== 'applying' && t !== 'interview-pending');
  const nextTags = hadTeam && options.contractDispute
    ? dedupe([...cleanTags, 'contract-dispute'])
    : cleanTags;

  // 初始化队友转会计划
  const deptSlot = roster[Math.floor(rosterRng() * roster.length)]!.id;
  const deptRivals = player.rivals.length > 0 ? player.rivals : [{ name: '某支战队', tag: '???', region: '' }];
  const deptDestTeam = deptRivals[Math.floor(rosterRng() * deptRivals.length)]!.name;
  const initialPendingDeparture = createInitialPendingDeparture(player, rosterRng, deptDestTeam, deptSlot);

  return refreshVisibleTeamIdentities({
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
    teamTrust: clampTeamTrust((hadTeam ? (options.contractDispute ? 25 : 35) : 40) + (fillsNeed ? 4 : 0) - (overlaps.length > 0 ? 3 : 0)),
    tags: nextTags,
    tagExpiry: player.tagExpiry,
    pendingDeparture: initialPendingDeparture,
  }, true);
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

function hasBuff(player: Player, buffId: string): boolean {
  return (player.buffs ?? []).some((buff) => buff.id === buffId);
}

function refreshTagExpiry(
  tags: string[],
  tagExpiry: Record<string, number>,
  currentRound: number,
  addedTags: string[] = [],
): Record<string, number> {
  const next = { ...tagExpiry };
  const added = new Set(addedTags);
  for (const tag of tags) {
    const duration = DEFAULT_TAG_LIFETIME_ROUNDS[tag];
    if (!duration) continue;
    if (added.has(tag) || next[tag] === undefined) {
      next[tag] = currentRound + duration;
    }
  }
  for (const tag of Object.keys(next)) {
    if (!tags.includes(tag)) delete next[tag];
  }
  return next;
}

function applyAutomaticTagCleanup(
  player: Player,
  removedTags: string[] = [],
): Player {
  const remove = new Set<string>();
  const addRemove = (tag: string) => {
    if (player.tags.includes(tag)) {
      remove.add(tag);
      if (!removedTags.includes(tag)) removedTags.push(tag);
    }
  };

  if (!player.team || (player.teamTrust ?? 0) < 40) addRemove('team-trust');
  if (!player.team) {
    [
      'locker-tension',
      'suppressed-anger',
      'role-confusion',
      'caller-discipline',
      'caller-star-aligned',
      'star-freedom',
      'team-carries-through-you',
      'shared-calling',
      'star-system-ready',
      'late-round-clarity',
      'coach-neutral',
      'coach-backs-star',
      'coach-lost-control',
      'main-awper',
      'team-focus-firepower',
      'team-focus-tactics',
      'team-focus-defense',
      'team-focus-mental',
      'team-tactical-ready',
      'team-meeting-ready',
    ].forEach(addRemove);
  }
  if ((player.stats.money ?? 0) > 0) addRemove('broke');
  if ((player.restRounds ?? 0) <= 0) addRemove('injured');
  if (!hasBuff(player, 'agent-support')) addRemove('has-agent');
  if (!player.pendingApplication) {
    addRemove('application-response-ready');
    addRemove('application-path-open-match');
    addRemove('application-path-talent');
  }
  if (!player.roleTransition) addRemove('role-transition-active');

  if (remove.size === 0) return player;
  const tags = player.tags.filter((tag) => !remove.has(tag));
  const tagExpiry = { ...(player.tagExpiry ?? {}) };
  for (const tag of remove) delete tagExpiry[tag];
  return { ...player, tags, tagExpiry };
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
