import { CLUBS, getClub } from '../data/clubs.js';
import { getClubProfile } from '../data/clubProfiles.js';
import type { Tournament } from '../data/tournaments.js';
import type {
  Club,
  ClubPlayer,
  ClubRuntimeState,
  ClubSeasonSummary,
  ClubTier,
  GameSession,
  PersonalityTag,
  RosterNeed,
  RosterStyle,
  TeamIdentity,
  TeammateRole,
  TeammateStats,
  TournamentTier,
  WorldClubPool,
} from '../types.js';
import { makeRng } from './resolver.js';

const WORLD_CLUBS_VERSION = 1;
const ROLES: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
const PERSONALITIES: PersonalityTag[] = ['strict', 'supportive', 'star', 'grinder', 'drama'];
const ROLE_TRAITS: Record<TeammateRole, string[]> = {
  IGL: ['igl', 'tactical', 'steady', 'support', 'selfless'],
  AWPer: ['aimer', 'mechanical', 'clutch', 'solo', 'ego'],
  Entry: ['mechanical', 'clutch', 'grinder', 'solo', 'ego'],
  Support: ['support', 'selfless', 'steady', 'igl'],
  Lurker: ['tactical', 'solo', 'steady', 'clutch'],
};
const TIER_STAT_RANGE: Record<ClubTier, [number, number]> = {
  youth: [3, 6],
  'semi-pro': [5, 9],
  pro: [8, 13],
  top: [11, 16],
};
const CN_SURNAMES = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const CN_GIVENS = ['Zero', 'Fox', 'Stone', 'Rain', 'Dusk', 'Ming', 'K', 'Lance', 'Nova', 'Wave'];
const EN_NICKS = ['Breach', 'Flicker', 'Rook', 'Vector', 'Anchor', 'Cipher', 'Mantis', 'Blitz', 'Quartz', 'Orbit'];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function weightedPick<T extends string>(
  items: readonly T[],
  weights: Partial<Record<T, number>>,
  rng: () => number,
): T {
  const total = items.reduce((sum, item) => sum + Math.max(0.1, weights[item] ?? 1), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0.1, weights[item] ?? 1);
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

function randomName(club: Club, index: number, rng: () => number): string {
  if (rng() < 0.55) return `${pick(CN_SURNAMES, rng)}${pick(CN_GIVENS, rng)}`;
  return `${club.tag}_${pick(EN_NICKS, rng)}${index + 1}`;
}

function rollStat(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomStats(tier: ClubTier, rng: () => number): TeammateStats {
  const [min, max] = TIER_STAT_RANGE[tier];
  return {
    agility: rollStat(min, max, rng),
    intelligence: rollStat(min, max, rng),
    mentality: rollStat(min, max, rng),
    experience: rollStat(min, max, rng),
  };
}

function pickTraits(role: TeammateRole, bias: Record<string, number>, rng: () => number): string[] {
  const pool = [...ROLE_TRAITS[role]];
  const out: string[] = [];
  const count = 2 + Math.floor(rng() * 2);
  while (out.length < count && pool.length > 0) {
    const selected = weightedPick(pool, bias, rng);
    out.push(selected);
    pool.splice(pool.indexOf(selected), 1);
  }
  return out;
}

function addNeedRole(roles: TeammateRole[], role: TeammateRole): TeammateRole[] {
  return roles.includes(role) ? roles : [...roles, role];
}

function addNeedIdentity(identities: TeamIdentity[], identity: TeamIdentity): TeamIdentity[] {
  return identities.includes(identity) ? identities : [...identities, identity];
}

export function deriveRosterNeed(runtime: ClubRuntimeState): RosterNeed {
  const profile = getClubProfile(runtime.clubId, runtime.tier);
  const roles = new Set(runtime.fullRoster.filter((player) => player.status === 'starter').map((player) => player.role));
  const traits = new Set(runtime.fullRoster.flatMap((player) => player.traits));
  let neededRoles: TeammateRole[] = [];
  let neededIdentities: TeamIdentity[] = [];
  const reasons: string[] = [];

  if (!roles.has('IGL') || (!traits.has('igl') && !traits.has('tactical'))) {
    neededRoles = addNeedRole(neededRoles, 'IGL');
    neededIdentities = addNeedIdentity(neededIdentities, 'caller');
    reasons.push('缺少稳定指挥和默认战术组织者');
  }
  if (
    profile.rosterStyle === 'firepower' ||
    profile.rosterStyle === 'chaotic' ||
    runtime.currentForm < -20
  ) {
    if (!roles.has('AWPer')) neededRoles = addNeedRole(neededRoles, 'AWPer');
    if (!roles.has('Entry')) neededRoles = addNeedRole(neededRoles, 'Entry');
    neededIdentities = addNeedIdentity(neededIdentities, 'star');
    reasons.push(runtime.currentForm < -20 ? '近期火力低迷，需要突破点' : '队伍风格偏向火力核心');
  }
  if (runtime.internalChemistry < 45 || runtime.rosterStability < 45) {
    neededRoles = addNeedRole(neededRoles, 'Support');
    neededIdentities = addNeedIdentity(neededIdentities, 'glue');
    reasons.push('队内默契或阵容稳定性偏低，需要稳定器');
  }
  const avgExperience = runtime.fullRoster.length > 0
    ? runtime.fullRoster.reduce((sum, player) => sum + player.stats.experience, 0) / runtime.fullRoster.length
    : 0;
  if (avgExperience < 6 && runtime.tier !== 'youth') {
    neededIdentities = addNeedIdentity(neededIdentities, 'veteran');
    reasons.push('队伍经验不足，需要老将型选手');
  }
  if (profile.rosterStyle === 'tactical' && !traits.has('steady')) {
    neededRoles = addNeedRole(neededRoles, 'Support');
    neededIdentities = addNeedIdentity(neededIdentities, 'glue');
    reasons.push('体系队缺少稳定执行特质');
  }

  return { neededRoles, neededIdentities, reasons };
}

function styleBaseline(style: RosterStyle): Pick<ClubRuntimeState, 'clubTrust' | 'currentForm' | 'rosterStability' | 'internalChemistry'> {
  if (style === 'chaotic') return { clubTrust: 42, currentForm: 5, rosterStability: 42, internalChemistry: 38 };
  if (style === 'development') return { clubTrust: 56, currentForm: -4, rosterStability: 64, internalChemistry: 55 };
  if (style === 'tactical') return { clubTrust: 58, currentForm: 0, rosterStability: 62, internalChemistry: 60 };
  if (style === 'firepower') return { clubTrust: 50, currentForm: 8, rosterStability: 52, internalChemistry: 48 };
  return { clubTrust: 52, currentForm: 0, rosterStability: 55, internalChemistry: 50 };
}

function eligibleTiersForClub(tier: ClubTier): TournamentTier[] {
  if (tier === 'youth') return ['c', 'b'];
  if (tier === 'semi-pro') return ['b', 'a'];
  if (tier === 'pro') return ['a', 's-open', 's-closed'];
  return ['s-class', 'major'];
}

const CLUB_TIER_ORDER: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];

function adjacentTier(tier: ClubTier, delta: 1 | -1): ClubTier {
  const idx = CLUB_TIER_ORDER.indexOf(tier);
  return CLUB_TIER_ORDER[Math.max(0, Math.min(CLUB_TIER_ORDER.length - 1, idx + delta))]!;
}

function generateFullRoster(session: GameSession, club: Club): ClubPlayer[] {
  const profile = getClubProfile(club.id, club.tier);
  const rng = makeRng(hashString(`${session.id}:club-runtime:${club.id}:${session.player.year ?? 1}`));
  const availableRoles = [...ROLES];
  const roster: ClubPlayer[] = [];
  for (let i = 0; i < 5; i++) {
    const role = weightedPick(availableRoles, profile.roleBias, rng);
    availableRoles.splice(availableRoles.indexOf(role), 1);
    roster.push({
      id: `${club.id}:starter-${i + 1}`,
      name: randomName(club, i, rng),
      role,
      stats: randomStats(club.tier, rng),
      traits: pickTraits(role, profile.traitBias, rng),
      personality: weightedPick(PERSONALITIES, profile.personalityBias, rng),
      joinedRound: Math.max(0, (session.player.round ?? 0) - Math.floor(rng() * 24)),
      status: 'starter',
      internalChemistry: 40 + Math.floor(rng() * 25),
    });
  }
  return roster;
}

export function createClubRuntimeState(session: GameSession, clubId: string): ClubRuntimeState {
  const club = getClub(clubId);
  if (!club) throw new Error(`未知俱乐部: ${clubId}`);
  const profile = getClubProfile(club.id, club.tier);
  const baseline = styleBaseline(profile.rosterStyle);
  return {
    clubId,
    tier: club.tier,
    fullRoster: generateFullRoster(session, club),
    ...baseline,
    seasonPoints: 0,
    qualificationState: {
      eligibleTiers: eligibleTiersForClub(club.tier),
      openQualifierTickets: [],
    },
    activeStorylines: [],
    recentResults: [],
    pendingStoryFlags: [],
    updatedRound: session.player.round ?? 0,
  };
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function removeId(ids: string[], clubId: string): string[] {
  return ids.filter((id) => id !== clubId);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function addUnique<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items : [...items, item];
}

function pointValueForTier(tier: TournamentTier): number {
  if (tier === 'major') return 30;
  if (tier === 's-class' || tier === 's-open' || tier === 's-closed') return 20;
  if (tier === 'a') return 12;
  if (tier === 'b') return 8;
  return 4;
}

export function calculateClubPower(club: ClubRuntimeState): number {
  const starters = club.fullRoster.filter((player) => player.status === 'starter');
  const roster = starters.length > 0 ? starters : club.fullRoster;
  const rosterPower = roster.length > 0
    ? roster.reduce((sum, player) => {
        const stats = player.stats;
        return sum + (stats.agility + stats.intelligence + stats.mentality + stats.experience) / 4;
      }, 0) / roster.length
    : 0;
  const formModifier = club.currentForm / 10;
  const chemistryModifier = (club.internalChemistry - 50) / 12;
  const trustModifier = (club.clubTrust - 50) / 16;
  const storylineModifier =
    (club.activeStorylines.includes('dark-horse-run') ? 2 : 0) +
    (club.activeStorylines.includes('system-clicking') ? 1.5 : 0) +
    (club.activeStorylines.includes('star-breakout') ? 1 : 0) -
    (club.activeStorylines.includes('chemistry-crisis') ? 2 : 0) -
    (club.activeStorylines.includes('fallen-giant') ? 2 : 0);
  return Math.round((rosterPower + formModifier + chemistryModifier + trustModifier + storylineModifier) * 10) / 10;
}

function updateQualificationFromResult(
  club: ClubRuntimeState,
  tournament: Tournament,
  result: 'win' | 'loss' | 'deep-run' | 'early-exit',
): ClubRuntimeState {
  let qualificationState = {
    ...club.qualificationState,
    eligibleTiers: [...club.qualificationState.eligibleTiers],
    openQualifierTickets: [...club.qualificationState.openQualifierTickets],
  };
  const deep = result === 'deep-run' || result === 'win';
  if (deep && tournament.tier === 'b') {
    qualificationState.openQualifierTickets = addUnique(qualificationState.openQualifierTickets, 'a-open');
    qualificationState.eligibleTiers = addUnique(qualificationState.eligibleTiers, 'a');
  }
  if (deep && tournament.tier === 'a') {
    qualificationState.openQualifierTickets = addUnique(qualificationState.openQualifierTickets, 's-open');
    qualificationState.eligibleTiers = addUnique(qualificationState.eligibleTiers, 's-open');
  }
  if (deep && (tournament.tier === 's-open' || tournament.tier === 's-closed')) {
    qualificationState.eligibleTiers = addUnique(qualificationState.eligibleTiers, 's-class');
  }
  if (deep && tournament.tier === 'major') {
    qualificationState = {
      ...qualificationState,
      majorPathProgress: result === 'win' ? 'major-champion' : 'major-deep-run',
    };
  }
  return { ...club, qualificationState };
}

function applyRuntimeResult(
  club: ClubRuntimeState,
  tournament: Tournament,
  result: 'win' | 'loss' | 'deep-run' | 'early-exit',
  round: number,
  note: string,
): ClubRuntimeState {
  const positive = result === 'win' || result === 'deep-run';
  const points = positive ? pointValueForTier(tournament.tier) : -Math.floor(pointValueForTier(tournament.tier) / 3);
  let next: ClubRuntimeState = {
    ...club,
    currentForm: clamp(club.currentForm + (positive ? 9 : -10), -100, 100),
    clubTrust: clamp(club.clubTrust + (positive ? 2 : -3), 0, 100),
    internalChemistry: clamp(club.internalChemistry + (positive ? 2 : -2), 0, 100),
    rosterStability: clamp(club.rosterStability + (positive ? 1 : -3), 0, 100),
    seasonPoints: Math.max(0, club.seasonPoints + points),
    recentResults: [
      {
        round,
        tournamentId: tournament.id,
        tier: tournament.tier,
        result,
        note,
      },
      ...club.recentResults,
    ].slice(0, 6),
    updatedRound: round,
  };
  next = updateQualificationFromResult(next, tournament, result);
  if (next.currentForm >= 45 && next.internalChemistry >= 60) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'dark-horse-run') };
  }
  if (next.clubTrust <= 25 || next.internalChemistry <= 25) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'chemistry-crisis') };
  }
  return next;
}

function tickRuntime(
  session: GameSession,
  club: ClubRuntimeState,
  tickRound: number,
  tickType: string,
): ClubRuntimeState {
  const profile = getClubProfile(club.clubId, club.tier);
  const rng = makeRng(hashString(`${session.id}:club-tick:${club.clubId}:${tickRound}:${tickType}`));
  const power = calculateClubPower(club);
  let currentForm = club.currentForm + Math.floor(rng() * 9) - 4;
  let clubTrust = club.clubTrust;
  let rosterStability = club.rosterStability;
  let internalChemistry = club.internalChemistry;
  if (power >= 13) currentForm += 2;
  else if (power <= 7) currentForm -= 2;

  if (profile.rosterStyle === 'chaotic') {
    rosterStability -= Math.floor(rng() * 4);
    if (currentForm < -25) clubTrust -= 1 + Math.floor(rng() * 3);
  }
  if (profile.rosterStyle === 'development') {
    internalChemistry += Math.floor(rng() * 3);
    rosterStability += Math.floor(rng() * 2);
  }
  if (profile.rosterStyle === 'tactical') {
    internalChemistry += 1;
    if (currentForm < 0) currentForm += 1;
  }
  if (profile.rosterStyle === 'firepower') {
    currentForm += Math.floor(rng() * 5) - 1;
    rosterStability -= currentForm < -30 ? 2 : 0;
  }

  let next: ClubRuntimeState = {
    ...club,
    currentForm: clamp(currentForm, -100, 100),
    clubTrust: clamp(clubTrust, 0, 100),
    rosterStability: clamp(rosterStability, 0, 100),
    internalChemistry: clamp(internalChemistry, 0, 100),
    seasonPoints: Math.max(0, club.seasonPoints + (currentForm > 20 ? 1 : 0) + (power >= 14 ? 1 : 0)),
    updatedRound: tickRound,
  };
  if (next.currentForm >= 45 && next.internalChemistry >= 65) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'dark-horse-run') };
  }
  if (next.currentForm <= -45 && next.clubTrust <= 35) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'chemistry-crisis') };
  }
  return next;
}

function pickOpponentClubId(session: GameSession, tournament: Tournament): string | null {
  const pool = session.worldClubs;
  if (!pool) return null;
  const playerClubId = session.player.team?.clubId;
  const candidates = [...pool.activeClubIds, ...pool.relevantClubIds, ...pool.staticClubIds]
    .filter((id) => id !== playerClubId)
    .filter((id) => {
      const runtime = pool.runtimeByClubId[id];
      if (runtime) return runtime.qualificationState.eligibleTiers.includes(tournament.tier);
      const club = getClub(id);
      return club ? eligibleTiersForClub(club.tier).includes(tournament.tier) : false;
    });
  if (candidates.length === 0) return null;
  const rng = makeRng(hashString(`${session.id}:opponent:${tournament.id}:${session.player.round}`));
  const weightedCandidates = candidates.map((clubId) => {
    const runtime = pool.runtimeByClubId[clubId] ?? createClubRuntimeState(session, clubId);
    const power = calculateClubPower(runtime);
    const weight = Math.max(1, power + (runtime.qualificationState.eligibleTiers.includes(tournament.tier) ? 2 : 0));
    return { clubId, weight };
  });
  const total = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of weightedCandidates) {
    roll -= item.weight;
    if (roll <= 0) return item.clubId;
  }
  return weightedCandidates[weightedCandidates.length - 1]!.clubId;
}

export function ensureWorldClubPool(session: GameSession): GameSession {
  if (session.worldClubs && session.worldClubsVersion === WORLD_CLUBS_VERSION) return session;
  const currentClubId = session.player.team?.clubId;
  const clubIds = CLUBS.filter((club) => !club.isRival).map((club) => club.id);
  const rivalClubIds = CLUBS
    .filter((club) => club.isRival && typeof club.rivalIndex === 'number' && Boolean(session.player.rivals[club.rivalIndex]))
    .map((club) => club.id);
  const activeClubIds = unique([
    ...(currentClubId ? [currentClubId] : []),
    ...rivalClubIds,
  ]);
  const relevantClubIds = clubIds
    .filter((id) => id !== currentClubId)
    .filter((id) => {
      const club = getClub(id);
      if (!club) return false;
      const stageOrder = ['rookie', 'youth', 'second', 'pro', 'retired'];
      return stageOrder.indexOf(session.player.stage) >= stageOrder.indexOf(club.requiredStage);
    });
  const staticClubIds = clubIds.filter((id) => !activeClubIds.includes(id) && !relevantClubIds.includes(id));
  return {
    ...session,
    worldClubsVersion: WORLD_CLUBS_VERSION,
    worldClubs: {
      season: session.player.year ?? 1,
      activeClubIds,
      relevantClubIds,
      staticClubIds,
      runtimeByClubId: {},
      processedTickKeysByClubId: {},
    },
  };
}

export function activateClubRuntime(session: GameSession, clubId: string, _reason: string): GameSession {
  let nextSession = ensureWorldClubPool(session);
  const pool = nextSession.worldClubs!;
  const runtime = pool.runtimeByClubId[clubId] ?? createClubRuntimeState(nextSession, clubId);
  const activeClubIds = unique([clubId, ...removeId(pool.activeClubIds, clubId)]);
  const relevantClubIds = removeId(pool.relevantClubIds, clubId);
  const staticClubIds = removeId(pool.staticClubIds, clubId);
  nextSession = {
    ...nextSession,
    worldClubs: {
      ...pool,
      activeClubIds,
      relevantClubIds,
      staticClubIds,
      runtimeByClubId: {
        ...pool.runtimeByClubId,
        [clubId]: runtime,
      },
      processedTickKeysByClubId: {
        ...pool.processedTickKeysByClubId,
        [clubId]: pool.processedTickKeysByClubId[clubId] ?? [],
      },
    },
  };
  return nextSession;
}

export function previewClubRuntime(session: GameSession, clubId: string): ClubRuntimeState {
  const existing = session.worldClubs?.runtimeByClubId[clubId];
  return existing ?? createClubRuntimeState(session, clubId);
}

function rolloverWorldClubSeason(session: GameSession, tickRound: number): GameSession {
  const pool = session.worldClubs;
  const currentSeason = session.player.year ?? pool?.season ?? 1;
  if (!pool || currentSeason <= pool.season) return session;

  let runtimeByClubId = { ...pool.runtimeByClubId };
  const darkHorseClubIds: string[] = [];
  const fallenClubIds: string[] = [];
  const promotedClubIds: string[] = [];
  const majorNewFaceClubIds: string[] = [];

  for (const [clubId, runtime] of Object.entries(pool.runtimeByClubId)) {
    let next = { ...runtime };
    const darkHorse = next.seasonPoints >= 24 && next.currentForm >= 20;
    const promoted = next.seasonPoints >= 36 && next.currentForm >= 25 && next.tier !== 'top';
    const fallen = next.seasonPoints <= 6 && next.currentForm <= -35 && next.tier !== 'youth';

    if (darkHorse) {
      darkHorseClubIds.push(clubId);
      next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'dark-horse-run') };
    }
    if (promoted) {
      const promotedTier = adjacentTier(next.tier, 1);
      promotedClubIds.push(clubId);
      next = {
        ...next,
        tier: promotedTier,
        qualificationState: {
          ...next.qualificationState,
          eligibleTiers: eligibleTiersForClub(promotedTier),
        },
        activeStorylines: addUnique(next.activeStorylines, 'promoted-after-breakout-season'),
        pendingStoryFlags: addUnique(next.pendingStoryFlags, 'promoted-after-breakout-season'),
      };
    }
    if (fallen) {
      const fallenTier = adjacentTier(next.tier, -1);
      fallenClubIds.push(clubId);
      next = {
        ...next,
        tier: fallenTier,
        qualificationState: {
          ...next.qualificationState,
          eligibleTiers: eligibleTiersForClub(fallenTier),
        },
        activeStorylines: addUnique(next.activeStorylines, 'fallen-giant'),
        pendingStoryFlags: addUnique(next.pendingStoryFlags, 'fallen-giant'),
      };
    }
    if (next.qualificationState.majorPathProgress) {
      majorNewFaceClubIds.push(clubId);
    }

    runtimeByClubId = {
      ...runtimeByClubId,
      [clubId]: {
        ...next,
        currentForm: clamp(next.currentForm * 0.5, -100, 100),
        seasonPoints: 0,
        recentResults: next.recentResults.slice(0, 3),
        updatedRound: tickRound,
      },
    };
  }

  const summary: ClubSeasonSummary = {
    season: pool.season,
    round: tickRound,
    darkHorseClubIds,
    fallenClubIds,
    promotedClubIds,
    majorNewFaceClubIds,
  };

  return {
    ...session,
    worldClubs: {
      ...pool,
      season: currentSeason,
      runtimeByClubId,
      seasonSummaries: [summary, ...(pool.seasonSummaries ?? [])].slice(0, 4),
    },
  };
}

export function tickWorldClubRuntimes(
  session: GameSession,
  tickRound: number,
  tickType = 'round',
): GameSession {
  let nextSession = ensureWorldClubPool(session);
  nextSession = rolloverWorldClubSeason(nextSession, tickRound);
  if (tickType === 'round' && tickRound % 4 !== 0) return nextSession;
  const pool = nextSession.worldClubs!;
  const tickIds = unique([...pool.activeClubIds, ...pool.relevantClubIds]).slice(0, 24);
  let runtimeByClubId = { ...pool.runtimeByClubId };
  let processedTickKeysByClubId = { ...pool.processedTickKeysByClubId };

  for (const clubId of tickIds) {
    const tickKey = `${tickType}:${tickRound}`;
    const processed = processedTickKeysByClubId[clubId] ?? [];
    if (processed.includes(tickKey)) continue;
    const runtime = runtimeByClubId[clubId] ?? createClubRuntimeState(nextSession, clubId);
    runtimeByClubId = {
      ...runtimeByClubId,
      [clubId]: tickRuntime(nextSession, runtime, tickRound, tickType),
    };
    processedTickKeysByClubId = {
      ...processedTickKeysByClubId,
      [clubId]: [...processed, tickKey].slice(-16),
    };
  }

  return {
    ...nextSession,
    worldClubs: {
      ...pool,
      runtimeByClubId,
      processedTickKeysByClubId,
      lastGlobalTickRound: tickRound,
    },
  };
}

export function recordWorldTournamentResult(
  session: GameSession,
  tournament: Tournament,
  playerWon: boolean,
  isFinalStage: boolean,
): GameSession {
  let nextSession = ensureWorldClubPool(session);
  const round = nextSession.player.round ?? 0;
  const playerClubId = nextSession.player.team?.clubId;

  if (playerClubId) {
    nextSession = activateClubRuntime(nextSession, playerClubId, 'player-tournament-result');
    const pool = nextSession.worldClubs!;
    const runtime = pool.runtimeByClubId[playerClubId]!;
    const result = playerWon ? (isFinalStage ? 'win' : 'deep-run') : 'early-exit';
    nextSession = {
      ...nextSession,
      worldClubs: {
        ...pool,
        runtimeByClubId: {
          ...pool.runtimeByClubId,
          [playerClubId]: applyRuntimeResult(
            runtime,
            tournament,
            result,
            round,
            playerWon ? `${tournament.displayName} 打出胜场` : `${tournament.displayName} 出局`,
          ),
        },
      },
    };
  }

  const opponentClubId = pickOpponentClubId(nextSession, tournament);
  if (!opponentClubId) return nextSession;
  nextSession = activateClubRuntime(nextSession, opponentClubId, 'recent-opponent');
  const pool = nextSession.worldClubs!;
  const opponentRuntime = pool.runtimeByClubId[opponentClubId]!;
  const opponentResult = playerWon ? 'early-exit' : 'deep-run';
  return {
    ...nextSession,
    worldClubs: {
      ...pool,
      runtimeByClubId: {
        ...pool.runtimeByClubId,
        [opponentClubId]: applyRuntimeResult(
          opponentRuntime,
          tournament,
          opponentResult,
          round,
          playerWon ? `被玩家队伍在 ${tournament.displayName} 击败` : `在 ${tournament.displayName} 淘汰玩家队伍`,
        ),
      },
    },
  };
}
