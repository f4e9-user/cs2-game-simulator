import { CLUBS, getClub } from '../data/clubs.js';
import { getClubProfile } from '../data/clubProfiles.js';
import { buildYearTournaments, getTournament, type Tournament } from '../data/tournaments.js';
import type {
  Club,
  ClubDisplayInfo,
  ClubPlayer,
  ClubRuntimeState,
  ClubSeasonSummary,
  ClubTier,
  ClubTierChange,
  GameSession,
  PendingMatch,
  Player,
  PersonalityTag,
  RosterNeed,
  RosterStyle,
  Stage,
  TeamIdentity,
  TeammateRole,
  TeammateStats,
  TournamentTier,
  WorldTournamentParticipant,
  WorldTournamentSnapshot,
  WorldClubPool,
} from '../types.js';
import { makeRng, stageIndex } from './resolver.js';

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
const BASELINE_VRS_RANGE: Record<ClubTier, [number, number]> = {
  youth: [0, 8],
  'semi-pro': [8, 40],
  pro: [45, 120],
  top: [120, 220],
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

function baselineVrsScore(session: GameSession, club: Club): number {
  const [min, max] = BASELINE_VRS_RANGE[club.tier];
  const rng = makeRng(hashString(`${session.id}:club-baseline-vrs:${club.id}:${session.player.year ?? 1}`));
  return min + Math.floor(rng() * (max - min + 1));
}

function rivalDisplayIdentity(session: GameSession, club: Club): Pick<ClubRuntimeState, 'displayName' | 'displayTag' | 'displayRegion'> {
  if (!club.isRival || typeof club.rivalIndex !== 'number') return {};
  const rival = session.player.rivals[club.rivalIndex];
  if (rival) {
    return {
      displayName: rival.name,
      displayTag: rival.tag,
      displayRegion: rival.region,
    };
  }
  const fallbackByTier: Record<ClubTier, { name: string; tag: string; region: string }> = {
    youth: { name: 'Academy Rival', tag: 'ARV', region: 'Global' },
    'semi-pro': { name: 'Regional Rival', tag: 'RRV', region: 'Global' },
    pro: { name: 'Pro Rival', tag: 'PRV', region: 'Global' },
    top: { name: 'Elite Rival', tag: 'ERV', region: 'Global' },
  };
  const fallback = fallbackByTier[club.tier];
  return {
    displayName: fallback.name,
    displayTag: fallback.tag,
    displayRegion: fallback.region,
  };
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
const TIER_MIN_STAGE: Record<ClubTier, Stage> = {
  youth: 'youth',
  'semi-pro': 'second',
  pro: 'pro',
  top: 'pro',
};
const TIER_SALARY_RANGE: Record<ClubTier, [number, number]> = {
  youth: [10, 20],
  'semi-pro': [20, 50],
  pro: [50, 90],
  top: [90, 150],
};
const TIER_LABELS: Record<ClubTier, string> = {
  youth: '青训',
  'semi-pro': '二线',
  pro: '职业',
  top: '豪门',
};

function adjacentTier(tier: ClubTier, delta: 1 | -1): ClubTier {
  const idx = CLUB_TIER_ORDER.indexOf(tier);
  return CLUB_TIER_ORDER[Math.max(0, Math.min(CLUB_TIER_ORDER.length - 1, idx + delta))]!;
}

function tierDirection(fromTier: ClubTier, toTier: ClubTier): ClubTierChange['direction'] {
  return CLUB_TIER_ORDER.indexOf(toTier) > CLUB_TIER_ORDER.indexOf(fromTier) ? 'promotion' : 'relegation';
}

function tierChangeSummary(fromTier: ClubTier, toTier: ClubTier): string {
  const direction = tierDirection(fromTier, toTier);
  if (direction === 'promotion') {
    if (toTier === 'top') return '战队升入豪门行列';
    return `战队升入${TIER_LABELS[toTier]}层级`;
  }
  if (fromTier === 'top') return '战队跌出豪门行列';
  if (fromTier === 'pro') return '战队跌出职业层级';
  return `战队降至${TIER_LABELS[toTier]}层级`;
}

function createTierChange(fromTier: ClubTier, toTier: ClubTier, season: number, round: number): ClubTierChange {
  return {
    season,
    round,
    fromTier,
    toTier,
    direction: tierDirection(fromTier, toTier),
    summary: tierChangeSummary(fromTier, toTier),
  };
}

function salaryForTierChange(currentSalary: number, toTier: ClubTier, direction: ClubTierChange['direction']): number {
  const [min, max] = TIER_SALARY_RANGE[toTier];
  const scaled = direction === 'promotion'
    ? Math.round(currentSalary * 1.25)
    : Math.round(currentSalary * 0.8);
  return clamp(scaled, min, max);
}

function adjustStatsForTierChange(stats: TeammateStats, direction: ClubTierChange['direction']): TeammateStats {
  const delta = direction === 'promotion' ? 1 : -1;
  return {
    agility: clamp(stats.agility + delta, 0, 20),
    intelligence: clamp(stats.intelligence + delta, 0, 20),
    mentality: clamp(stats.mentality + delta, 0, 20),
    experience: clamp(stats.experience + delta, 0, 20),
  };
}

function adjustClubRosterForTierChange(runtime: ClubRuntimeState, direction: ClubTierChange['direction']): ClubRuntimeState {
  return {
    ...runtime,
    fullRoster: runtime.fullRoster.map((player) => ({
      ...player,
      stats: adjustStatsForTierChange(player.stats, direction),
      internalChemistry: player.internalChemistry === undefined
        ? player.internalChemistry
        : clamp(player.internalChemistry + (direction === 'promotion' ? 2 : -2), 0, 100),
    })),
  };
}

function adjustPlayerRosterForTierChange(player: Player, direction: ClubTierChange['direction']): Player {
  if (!player.roster) return player;
  return {
    ...player,
    roster: player.roster.map((teammate) => ({
      ...teammate,
      stats: adjustStatsForTierChange(teammate.stats, direction),
      chemistry: teammate.chemistry === undefined
        ? teammate.chemistry
        : clamp(teammate.chemistry + (direction === 'promotion' ? 2 : -2), 0, 100),
    })),
  };
}

function syncPlayerTeamTierFromRuntime(player: Player, runtimeByClubId: Record<string, ClubRuntimeState>): Player {
  if (!player.team) return player;
  const currentTeam = player.team;
  const runtime = runtimeByClubId[player.team.clubId];
  if (!runtime || runtime.tier === player.team.tier) return player;
  const change = runtime.lastTierChange ?? createTierChange(currentTeam.tier, runtime.tier, player.year ?? 1, player.round ?? 0);
  const direction = change.direction;
  const minStage = TIER_MIN_STAGE[runtime.tier];
  const nextStage = stageIndex(minStage) > stageIndex(player.stage) ? minStage : player.stage;
  const adjustedPlayer = adjustPlayerRosterForTierChange(player, direction);
  return {
    ...adjustedPlayer,
    pendingMatch: adjustedPlayer.pendingMatch?.qualificationSlotOwner === 'team' ? null : adjustedPlayer.pendingMatch,
    teamQualificationSlots: {},
    teamQualificationSlotBatches: [],
    stage: nextStage,
    team: {
      ...currentTeam,
      tier: runtime.tier,
      monthlySalary: salaryForTierChange(currentTeam.monthlySalary, runtime.tier, direction),
      lastTierChange: change,
    },
  };
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
  return withVrsScore({
    clubId,
    tier: club.tier,
    ...rivalDisplayIdentity(session, club),
    baselineVrsScore: baselineVrsScore(session, club),
    fullRoster: generateFullRoster(session, club),
    ...baseline,
    seasonPoints: 0,
    vrsScore: 0,
    qualificationState: {
      eligibleTiers: eligibleTiersForClub(club.tier),
      openQualifierTickets: [],
    },
    activeStorylines: [],
    recentResults: [],
    pendingStoryFlags: [],
    updatedRound: session.player.round ?? 0,
  });
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

function worldTournamentResultValue(tier: TournamentTier, result: 'win' | 'deep-run' | 'early-exit' | 'loss'): number {
  const base = pointValueForTier(tier);
  if (result === 'win') return Math.max(base, Math.round(base * 1.4));
  if (result === 'deep-run') return Math.max(1, Math.round(base * 0.7));
  if (result === 'early-exit') return -Math.max(1, Math.round(base * 0.25));
  return -Math.max(1, Math.round(base * 0.4));
}

function addWeeks(year: number, week: number, offset: number): { year: number; week: number } {
  let y = year;
  let w = week + offset;
  while (w > 48) {
    y += 1;
    w -= 48;
  }
  return { year: y, week: w };
}

function tournamentSignupWeek(tournament: Tournament): number | null {
  if (tournament.signupWeeks === 'always') return null;
  return tournament.signupWeeks[0] ?? null;
}

function tournamentResultDate(tournament: Tournament, year: number): { year: number; week: number } | null {
  const signupWeek = tournamentSignupWeek(tournament);
  if (!signupWeek) return null;
  return addWeeks(year, signupWeek, Math.max(2, tournament.bracket.length));
}

function tournamentSnapshotId(tournament: Tournament, resultYear: number, resultWeek: number): string {
  return `${tournament.id}:${resultYear}:${resultWeek}`;
}

export function computeClubVrsScore(
  club: Pick<
    ClubRuntimeState,
    'baselineVrsScore' | 'seasonPoints' | 'currentForm' | 'clubTrust' | 'internalChemistry' | 'rosterStability' | 'qualificationState' | 'activeStorylines' | 'recentResults'
  >,
): number {
  const recentResultBonus = club.recentResults.slice(0, 4).reduce((sum, result) => {
    if (result.result === 'win') return sum + 6;
    if (result.result === 'deep-run') return sum + 4;
    if (result.result === 'early-exit') return sum - 4;
    return sum - 2;
  }, 0);

  const storylineBonus =
    (club.activeStorylines.includes('dark-horse-run') ? 6 : 0) +
    (club.activeStorylines.includes('system-clicking') ? 4 : 0) +
    (club.activeStorylines.includes('star-breakout') ? 3 : 0) -
    (club.activeStorylines.includes('chemistry-crisis') ? 5 : 0) -
    (club.activeStorylines.includes('fallen-giant') ? 5 : 0);

  const pathBonus = club.qualificationState.majorPathProgress
    ? (club.qualificationState.majorPathProgress === 'major-champion' ? 10 : 6)
    : 0;

  const score =
    (club.baselineVrsScore ?? 0) +
    club.seasonPoints * 1.3 +
    club.currentForm / 5 +
    (club.clubTrust - 50) / 6 +
    (club.internalChemistry - 50) / 6 +
    (club.rosterStability - 50) / 8 +
    recentResultBonus +
    storylineBonus +
    pathBonus;

  return Math.max(0, Math.round(score));
}

export function resolveClubDisplayInfo(session: GameSession, clubId: string): ClubDisplayInfo | null {
  const club = getClub(clubId);
  if (!club) return null;
  const runtime = session.worldClubs?.runtimeByClubId[clubId];
  if (runtime?.displayName && runtime.displayTag && runtime.displayRegion) {
    return {
      clubId,
      name: runtime.displayName,
      tag: runtime.displayTag,
      region: runtime.displayRegion,
      tier: runtime.tier,
    };
  }
  if (club.isRival && typeof club.rivalIndex === 'number') {
    const rival = session.player.rivals[club.rivalIndex];
    if (rival) {
      return {
        clubId,
        name: rival.name,
        tag: rival.tag,
        region: rival.region,
        tier: club.tier,
      };
    }
  }
  return {
    clubId,
    name: club.name,
    tag: club.tag,
    region: club.region,
    tier: club.tier,
  };
}

function withVrsScore(club: ClubRuntimeState): ClubRuntimeState {
  return {
    ...club,
    vrsScore: computeClubVrsScore(club),
  };
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
  return withVrsScore({ ...club, qualificationState });
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
  let next: ClubRuntimeState = withVrsScore({
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
  });
  next = updateQualificationFromResult(next, tournament, result);
  if (next.currentForm >= 45 && next.internalChemistry >= 60) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'dark-horse-run') };
  }
  if (next.clubTrust <= 25 || next.internalChemistry <= 25) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'chemistry-crisis') };
  }
  return withVrsScore(next);
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

  let next: ClubRuntimeState = withVrsScore({
    ...club,
    currentForm: clamp(currentForm, -100, 100),
    clubTrust: clamp(clubTrust, 0, 100),
    rosterStability: clamp(rosterStability, 0, 100),
    internalChemistry: clamp(internalChemistry, 0, 100),
    seasonPoints: Math.max(0, club.seasonPoints + (currentForm > 20 ? 1 : 0) + (power >= 14 ? 1 : 0)),
    updatedRound: tickRound,
  });
  if (next.currentForm >= 45 && next.internalChemistry >= 65) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'dark-horse-run') };
  }
  if (next.currentForm <= -45 && next.clubTrust <= 35) {
    next = { ...next, activeStorylines: addUnique(next.activeStorylines, 'chemistry-crisis') };
  }
  return withVrsScore(next);
}

function applyWorldTournamentTick(session: GameSession, tickRound: number, tickType: string): GameSession {
  const pool = session.worldClubs;
  if (!pool || tickType !== 'round') return session;
  const week = session.player.week ?? (((Math.max(1, tickRound) - 1) % 48) + 1);
  const year = session.player.year ?? pool.season;
  const candidateTournaments = [
    ...buildYearTournaments(Math.max(1, year - 1)),
    ...buildYearTournaments(year),
  ];
  const tournaments = candidateTournaments.filter((tournament) => {
    const tournamentYear = Number(/^y(\d+)-/.exec(tournament.id)?.[1] ?? year);
    const resultDate = tournamentResultDate(tournament, tournamentYear);
    return resultDate?.year === year && resultDate.week === week;
  });
  if (tournaments.length === 0) return session;

  let nextSession = session;
  let runtimeByClubId = { ...pool.runtimeByClubId };
  let processedTickKeysByClubId = { ...pool.processedTickKeysByClubId };
  let tournamentSnapshots = [...(pool.tournamentSnapshots ?? [])];
  const candidateIds = unique([...pool.activeClubIds, ...pool.relevantClubIds, ...pool.staticClubIds]).slice(0, 48);
  const playerClubId = session.player.team?.clubId;

  for (const tournament of tournaments) {
    const tournamentYear = Number(/^y(\d+)-/.exec(tournament.id)?.[1] ?? year);
    const signupWeek = tournamentSignupWeek(tournament);
    const resultDate = tournamentResultDate(tournament, tournamentYear);
    if (!signupWeek || !resultDate) continue;
    const snapshotId = tournamentSnapshotId(tournament, resultDate.year, resultDate.week);
    if (tournamentSnapshots.some((snapshot) => snapshot.id === snapshotId)) continue;
    const processedTournamentKey = `world-tournament:${snapshotId}`;
    if ((processedTickKeysByClubId.__global ?? []).includes(processedTournamentKey)) continue;

    const eligibleIds = candidateIds
      .filter((clubId) => clubId !== playerClubId)
      .filter((clubId) => {
        const runtime = runtimeByClubId[clubId] ?? createClubRuntimeState(nextSession, clubId);
        return runtime.qualificationState.eligibleTiers.includes(tournament.tier);
      })
      .sort((a, b) => {
        const aRuntime = runtimeByClubId[a] ?? createClubRuntimeState(nextSession, a);
        const bRuntime = runtimeByClubId[b] ?? createClubRuntimeState(nextSession, b);
        return computeClubVrsScore(bRuntime) - computeClubVrsScore(aRuntime);
      })
      .slice(0, tournament.tier === 'major' ? 16 : 12);
    if (eligibleIds.length < 2) continue;

    const participants = eligibleIds.map((clubId, index): WorldTournamentParticipant & { strength: number } => {
      const runtime = runtimeByClubId[clubId] ?? createClubRuntimeState(nextSession, clubId);
      const rng = makeRng(hashString(`${session.id}:world-tournament:${tournament.id}:${clubId}:${tickRound}`));
      const vrsScore = computeClubVrsScore(runtime);
      const power = calculateClubPower(runtime);
      return {
        clubId,
        seed: index + 1,
        vrsScore,
        power,
        form: runtime.currentForm,
        strength: power + vrsScore / 25 + runtime.currentForm / 25 + rng() * 4,
      };
    }).sort((a, b) => b.strength - a.strength);
    const champion = participants[0]!;
    const runnerUp = participants[1]!;
    const darkHorse = participants.find((participant) => participant.seed > Math.ceil(participants.length / 2) && participant.clubId === champion.clubId);
    const upset = champion.seed > runnerUp.seed + 4 ? runnerUp : undefined;

    for (const participant of participants) {
      const runtime = runtimeByClubId[participant.clubId] ?? createClubRuntimeState(nextSession, participant.clubId);
      const result: 'win' | 'deep-run' | 'early-exit' =
        participant.clubId === champion.clubId ? 'win' :
        participant.clubId === runnerUp.clubId || participant.seed <= 4 ? 'deep-run' :
        'early-exit';
      const points = worldTournamentResultValue(tournament.tier, result);
      const positive = result !== 'early-exit';
      runtimeByClubId = {
        ...runtimeByClubId,
        [participant.clubId]: withVrsScore({
          ...runtime,
          seasonPoints: Math.max(0, runtime.seasonPoints + points),
          currentForm: clamp(runtime.currentForm + (positive ? 5 : -4), -100, 100),
          internalChemistry: clamp(runtime.internalChemistry + (positive ? 1 : -1), 0, 100),
          recentResults: [
            {
              round: tickRound,
              tournamentId: tournament.id,
              tier: tournament.tier,
              result,
              note: `${tournament.displayName} 世界赛程抽象结果`,
            },
            ...runtime.recentResults,
          ].slice(0, 6),
          updatedRound: tickRound,
        }),
      };
    }
    const snapshot: WorldTournamentSnapshot = {
      id: snapshotId,
      tournamentId: tournament.id,
      tournamentName: tournament.displayName,
      tier: tournament.tier,
      year: tournamentYear,
      signupWeek,
      resultYear: resultDate.year,
      resultWeek: resultDate.week,
      round: tickRound,
      participants: participants.map(({ strength: _strength, ...participant }) => participant),
      championClubId: champion.clubId,
      runnerUpClubId: runnerUp.clubId,
      darkHorseClubId: darkHorse?.clubId,
      upsetClubId: upset?.clubId,
      finalScore: tournament.tier === 'major' || tournament.tier === 's-class'
        ? (hashString(snapshotId) % 2 === 0 ? '3-1' : '3-2')
        : (hashString(snapshotId) % 2 === 0 ? '2-0' : '2-1'),
      createdAt: new Date(0).toISOString(),
    };
    tournamentSnapshots = [snapshot, ...tournamentSnapshots].slice(0, 48);
    processedTickKeysByClubId = {
      ...processedTickKeysByClubId,
      __global: [...(processedTickKeysByClubId.__global ?? []), processedTournamentKey].slice(-96),
    };
  }

  return {
    ...nextSession,
    worldClubs: {
      ...pool,
      runtimeByClubId,
      processedTickKeysByClubId,
      tournamentSnapshots,
    },
  };
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

export function assignPendingMatchOpponent(
  session: GameSession,
  pendingMatch: PendingMatch,
): { session: GameSession; pendingMatch: PendingMatch } {
  if (pendingMatch.opponent) return { session, pendingMatch };
  const tournament = getTournamentForPending(pendingMatch);
  if (!tournament) return { session, pendingMatch };
  let nextSession = ensureWorldClubPool(session);
  const opponentClubId = pickOpponentClubId(nextSession, tournament);
  if (!opponentClubId) return { session: nextSession, pendingMatch };
  nextSession = activateClubRuntime(nextSession, opponentClubId, 'pending-match-opponent');
  const runtime = nextSession.worldClubs!.runtimeByClubId[opponentClubId]!;
  const display = resolveClubDisplayInfo(nextSession, opponentClubId);
  if (!display) return { session: nextSession, pendingMatch };
  return {
    session: nextSession,
    pendingMatch: {
      ...pendingMatch,
      opponent: {
        clubId: opponentClubId,
        name: display.name,
        tag: display.tag,
        region: display.region,
        tier: display.tier,
        vrsScore: computeClubVrsScore(runtime),
        power: calculateClubPower(runtime),
        form: runtime.currentForm,
      },
    },
  };
}

function getTournamentForPending(pendingMatch: PendingMatch): Tournament | undefined {
  return pendingMatch.tournamentId ? (getTournament(pendingMatch.tournamentId) ?? undefined) : undefined;
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
      const change = createTierChange(next.tier, promotedTier, pool.season, tickRound);
      promotedClubIds.push(clubId);
      next = adjustClubRosterForTierChange({
        ...next,
        tier: promotedTier,
        qualificationState: {
          ...next.qualificationState,
          eligibleTiers: eligibleTiersForClub(promotedTier),
        },
        activeStorylines: addUnique(next.activeStorylines, 'promoted-after-breakout-season'),
        pendingStoryFlags: addUnique(next.pendingStoryFlags, 'promoted-after-breakout-season'),
        lastTierChange: change,
      }, change.direction);
    }
    if (fallen) {
      const fallenTier = adjacentTier(next.tier, -1);
      const change = createTierChange(next.tier, fallenTier, pool.season, tickRound);
      fallenClubIds.push(clubId);
      next = adjustClubRosterForTierChange({
        ...next,
        tier: fallenTier,
        qualificationState: {
          ...next.qualificationState,
          eligibleTiers: eligibleTiersForClub(fallenTier),
        },
        activeStorylines: addUnique(next.activeStorylines, 'fallen-giant'),
        pendingStoryFlags: addUnique(next.pendingStoryFlags, 'fallen-giant'),
        lastTierChange: change,
      }, change.direction);
    }
    if (next.qualificationState.majorPathProgress) {
      majorNewFaceClubIds.push(clubId);
    }

    runtimeByClubId = {
      ...runtimeByClubId,
      [clubId]: withVrsScore({
        ...next,
        currentForm: clamp(next.currentForm * 0.5, -100, 100),
        seasonPoints: 0,
        recentResults: next.recentResults.slice(0, 3),
        updatedRound: tickRound,
      }),
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
    player: syncPlayerTeamTierFromRuntime(session.player, runtimeByClubId),
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
  if (tickType === 'round' && tickRound % 4 !== 0) {
    return applyWorldTournamentTick(nextSession, tickRound, tickType);
  }
  const pool = nextSession.worldClubs!;
  const tickIds = unique([...pool.activeClubIds, ...pool.relevantClubIds]).slice(0, 32);
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

  const tickedSession = {
    ...nextSession,
    worldClubs: {
      ...pool,
      runtimeByClubId,
      processedTickKeysByClubId,
      lastGlobalTickRound: tickRound,
    },
  };
  return applyWorldTournamentTick(tickedSession, tickRound, tickType);
}

export function recordWorldTournamentResult(
  session: GameSession,
  tournament: Tournament,
  playerWon: boolean,
  isFinalStage: boolean,
  opponentClubId?: string,
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

  const resolvedOpponentClubId = opponentClubId ?? pickOpponentClubId(nextSession, tournament);
  if (!resolvedOpponentClubId) return nextSession;
  nextSession = activateClubRuntime(nextSession, resolvedOpponentClubId, 'recent-opponent');
  const pool = nextSession.worldClubs!;
  const opponentRuntime = pool.runtimeByClubId[resolvedOpponentClubId]!;
  const opponentResult = playerWon ? 'early-exit' : 'deep-run';
  return {
    ...nextSession,
    worldClubs: {
      ...pool,
      runtimeByClubId: {
        ...pool.runtimeByClubId,
        [resolvedOpponentClubId]: applyRuntimeResult(
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
