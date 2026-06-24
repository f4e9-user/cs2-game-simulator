import { DEFAULT_BACKGROUND_ID, getBackground } from '../data/backgrounds.js';
import { TRAITS, getTrait } from '../data/traits.js';
import type { Player, StatDelta, StatKey, Stats, TeammateRole, Trait } from '../types.js';
import {
  ALLOCATABLE_STAT_KEYS,
  ACTION_POINT_MAX,
  BASE_STATS,
  CORE_STAT_KEYS,
  FEEL_CAP_DEFAULT,
  OPENING_STAT_INVEST_MAX,
  POINT_POOL,
  STAT_KEYS,
} from './constants.js';
import { clampFatigue, clampStress } from './utils.js';
import { clampStats } from './resolver.js';
import { generateRivals } from '../data/rivals.js';

const OPENING_OVERFLOW_TAG_BY_STAT: Partial<Record<Exclude<StatKey, 'money' | 'experience'>, string>> = {
  mentality: 'opening-mental-scar',
  constitution: 'opening-physical-debt',
  intelligence: 'opening-tactical-gap',
  agility: 'opening-mechanical-gap',
};

const DEFAULT_OPENING_TAG_LIFETIME_ROUNDS: Partial<Record<string, number>> = {
  'opening-mental-scar': 48,
  'opening-physical-debt': 48,
  'opening-tactical-gap': 48,
  'opening-mechanical-gap': 48,
};
const DEFAULT_OPENING_MONEY = 20;

export interface InitInput {
  name: string;
  traitIds: string[];
  backgroundId: string;
  originRegion?: string;
  stats?: Stats;
}

function openingNegativeOverflow(
  allocation: Stats,
  negative: Stats,
  backgroundBias: StatDelta,
): Partial<Record<Exclude<StatKey, 'money' | 'experience'>, number>> {
  const out: Partial<Record<Exclude<StatKey, 'money' | 'experience'>, number>> = {};
  for (const k of ALLOCATABLE_STAT_KEYS as Array<Exclude<StatKey, 'money' | 'experience'>>) {
    const raw = allocation[k] + (negative[k] ?? 0) + (backgroundBias[k] ?? 0);
    if (raw < 0) out[k] = Math.abs(raw);
  }
  return out;
}

function applyOpeningStaticDeltas(
  allocation: Stats,
  negative: Stats,
  backgroundBias: StatDelta,
): Stats {
  const out = { ...allocation };
  for (const k of STAT_KEYS) {
    if (k === 'money') continue;
    out[k] += (negative[k] ?? 0) + (backgroundBias[k] ?? 0);
  }
  return clampStats(out);
}

function applyOpeningOverflowPenalties(
  player: Player,
  overflow: Partial<Record<Exclude<StatKey, 'money' | 'experience'>, number>>,
): Player {
  const entries = Object.entries(overflow) as [Exclude<StatKey, 'money' | 'experience'>, number][];
  if (entries.length === 0) return player;

  const tags = [...player.tags];
  const tagExpiry = { ...(player.tagExpiry ?? {}) };
  let stress = player.stress ?? 0;
  let fatigue = player.volatile?.fatigue ?? 0;

  for (const [stat, amount] of entries) {
    const tag = OPENING_OVERFLOW_TAG_BY_STAT[stat];
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tag) tagExpiry[tag] = player.round + (DEFAULT_OPENING_TAG_LIFETIME_ROUNDS[tag] ?? 48);
    if (stat === 'mentality' || stat === 'intelligence') {
      stress = clampStress(stress + Math.ceil(amount * 8));
    }
    if (stat === 'constitution' || stat === 'agility') {
      fatigue = clampFatigue(fatigue + Math.ceil(amount * 12));
    }
  }

  return {
    ...player,
    tags,
    tagExpiry,
    stress,
    volatile: {
      ...(player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 }),
      fatigue,
    },
  };
}

export function rollRandomTraits(count = 3): Trait[] {
  const pool = [...TRAITS];
  const out: Trait[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const candidate = pool[idx]!;
    pool.splice(idx, 1);
    if (traitSelectionConflict([...out, candidate])) continue;
    out.push(candidate);
  }
  return out;
}

function traitSelectionConflict(traits: Trait[]): { a: Trait; b: Trait } | null {
  for (let i = 0; i < traits.length; i++) {
    const a = traits[i]!;
    for (let j = i + 1; j < traits.length; j++) {
      const b = traits[j]!;
      if (a.conflictsWith?.includes(b.id) || b.conflictsWith?.includes(a.id)) {
        return { a, b };
      }
    }
  }
  return null;
}

function openingMoneyForTraits(traits: Trait[], backgroundStartMoney?: number): number {
  return traits.find((trait) => typeof trait.openingMoney === 'number')?.openingMoney
    ?? backgroundStartMoney
    ?? DEFAULT_OPENING_MONEY;
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
  const conflict = traitSelectionConflict(traits);
  if (conflict) {
    throw new Error(`特质冲突：${conflict.a.name} 与 ${conflict.b.name} 不能同时选择`);
  }

  const { floor, negative } = computeTraitMods(traits);
  const allocation = input.stats ? { ...input.stats } : randomStatsWithFloor(floor);
  const err = validateAllocation(allocation, floor);
  if (err) throw new Error(err);

  const finalStats = applyOpeningStaticDeltas(allocation, negative, bg.statBias);
  finalStats.money = openingMoneyForTraits(traits, bg.startMoney);

  const player: Player = {
    name: input.name.trim() || 'nameless',
    stats: clampStats(finalStats),
    volatile: { feel: 0, tilt: 0, fatigue: 0 },
    feelCap: FEEL_CAP_DEFAULT,
    peripheralTier: 0,
    buffs: [],
    growthSpent: 0,
    traits: traits.map((t) => t.id),
    backgroundId: bg.id,
    originRegion: input.originRegion?.trim() || bg.originRegion || '本地',
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
    housing: {
      tier: 'shared-housing',
      movedAtRound: 0,
    },
    actionPoints: ACTION_POINT_MAX,
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
    careerPeaks: {
      highestStage: bg.startStage === 'retired' ? 'rookie' : bg.startStage,
      peakFame: 0,
      peakStress: 0,
      lowestConstitution: clampStats(finalStats).constitution,
    },
    teamCareer: {
      longestTeamRounds: 0,
    },
  };

  return applyOpeningOverflowPenalties(
    player,
    openingNegativeOverflow(allocation, negative, bg.statBias),
  );
}

export function deriveRoleFromTraits(traits: Trait[]): TeammateRole | null {
  const tags = new Set(traits.flatMap((t) => t.tags));
  if (tags.has('igl')) return 'IGL';
  if (tags.has('aimer')) return 'AWPer';
  if (tags.has('mechanical')) return 'Entry';
  if (tags.has('support') || tags.has('selfless')) return 'Support';
  if (tags.has('tactical') && tags.has('solo')) return 'Lurker';
  return null;
}
