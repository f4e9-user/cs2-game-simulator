import { CLUBS, getClub } from '../data/clubs.js';
import type {
  Club,
  ClubOriginFit,
  ClubOriginPreference,
  ClubTier,
  GameSession,
  PendingApplication,
  Player,
  PlayerTeam,
  Stage,
  TeamOffer,
} from '../types.js';
import { STAGE_ORDER } from './constants.js';
import { finalizePlayerCareerSnapshot } from './careerSnapshot.js';
import { createInitialPendingDeparture } from './departure.js';
import { clearTeamQualifications } from './qualification.js';
import { makeRng, stageIndex } from './resolver.js';
import {
  deriveInitialTeamStatus,
  deriveJoinMode,
  detectRoleOverlap,
  joinReason,
  playerFillsRosterNeed,
  rosterFromClubRuntime,
} from './team.js';
import { refreshVisibleTeamIdentities } from './teamIdentity.js';
import { clampTeamTrust, dedupe, hashString } from './utils.js';
import { deriveRosterNeed, previewClubRuntime } from './worldClubs.js';

type YouthApplicationResult = 'pass' | 'tryout' | 'reject';

function scoreYouthApplication(player: Player, club: Club, originFitBonus: number, exceptionBonus: number): {
  score: number;
  result: YouthApplicationResult;
} {
  const tp = player.tierParticipations ?? {};
  const tc = player.tierChampionships ?? {};
  const rookieParticipations = (tp.c ?? 0) + (tp.b ?? 0);
  const bParticipations = tp.b ?? 0;
  const rookieChampionships = (tc.c ?? 0) + (tc.b ?? 0);
  const traitIds = new Set(player.traits);

  let score = 35;
  score += Math.min(20, rookieParticipations * 5);
  score += Math.min(10, bParticipations * 5);
  score += Math.min(24, rookieChampionships * 12);
  if (traitIds.has('aim-god')) score += 18;
  if (traitIds.has('tactical-mind')) score += 12;
  if (traitIds.has('ice-cold')) score += 10;
  if (traitIds.has('grinder')) score += 8;
  if (traitIds.has('support-soul')) score += 8;
  score += Math.min(12, Math.floor((player.fame ?? 0) / 2));
  if (player.backgroundId === 'youth-reserve') score += 10;
  if ((player.originRegion ?? '本地') === club.region) score += 6;
  score += originFitBonus;
  score += exceptionBonus;
  if ((player.stress ?? 0) >= 70) score -= 8;
  if ((player.volatile?.fatigue ?? 0) >= 75) score -= 8;
  if (player.tags.some((tag) => ['banned', 'dirty-money', 'match-fixing', 'cheat'].includes(tag))) score -= 30;

  if (score >= 85) return { score, result: 'pass' };
  if (score >= 50) return { score, result: 'tryout' };
  return { score, result: 'reject' };
}

function resolveClubOriginPreference(club: Club): ClubOriginPreference {
  if (club.originPreference) return club.originPreference;
  if (club.region === '本地') return 'local-core';
  if (club.tier === 'top') return 'international-open';
  return 'regional-core';
}

function resolvePreferredOriginRegions(club: Club, preference: ClubOriginPreference): string[] {
  if (club.preferredOriginRegions && club.preferredOriginRegions.length > 0) {
    return [...club.preferredOriginRegions];
  }
  if (preference === 'international-open') return [];
  return club.region === '???' ? ['本地'] : [club.region];
}

function sameMacroRegion(origin: string, clubRegion: string): boolean {
  if (origin === clubRegion) return true;
  const groups: string[][] = [
    ['亚太', '中国', '东南亚', '蒙古', '大洋洲'],
    ['欧洲', 'CIS / 东欧'],
    ['北美'],
    ['南美'],
    ['中东'],
    ['本地'],
  ];
  return groups.some((group) => group.includes(origin) && group.includes(clubRegion));
}

function resolveClubOriginFit(originRegion: string, club: Club): {
  preference: ClubOriginPreference;
  fit: ClubOriginFit;
  bonus: number;
  preferredRegions: string[];
} {
  const preference = resolveClubOriginPreference(club);
  const preferredRegions = resolvePreferredOriginRegions(club, preference);
  if (preference === 'international-open') {
    return { preference, fit: 'open', bonus: 0, preferredRegions };
  }

  if (preferredRegions.includes(originRegion)) {
    return {
      preference,
      fit: originRegion === club.region ? 'match' : 'regional',
      bonus: preference === 'local-core' ? 2 : 1,
      preferredRegions,
    };
  }

  if (preference === 'regional-core' && sameMacroRegion(originRegion, club.region)) {
    return { preference, fit: 'regional', bonus: 0, preferredRegions };
  }

  return {
    preference,
    fit: 'mismatch',
    bonus: preference === 'local-core' ? -2 : -1,
    preferredRegions,
  };
}

function clubExceptionContext(player: Player, club: Club, runtime: ReturnType<typeof previewClubRuntime> | null): {
  bonus: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let bonus = 0;

  const currentFame = player.fame ?? 0;
  const currentExperience = player.stats.experience ?? 0;
  const fameThreshold = club.requiredFame ?? 0;

  if (currentFame >= fameThreshold + 20) {
    bonus += 2;
    reasons.push('名气远高于门槛');
  } else if (currentFame >= fameThreshold + 10) {
    bonus += 1;
    reasons.push('名气高于常规线');
  }

  if (currentExperience >= 12) {
    bonus += 1;
    reasons.push('比赛经验充足');
  }

  const championshipCount = (player.tournamentChampionships ?? 0)
    + Object.values(player.tierChampionships ?? {}).reduce((sum, value) => sum + value, 0);
  if (championshipCount >= 1) {
    bonus += 1;
    reasons.push('近期有冠军表现');
  }

  if (runtime) {
    const need = deriveRosterNeed(runtime);
    const needCount = need.neededRoles.length + need.neededIdentities.length;
    if (runtime.rosterStability <= 45 || runtime.currentForm <= -15 || needCount >= 2) {
      bonus += 1;
      reasons.push('阵容或状态存在缺口');
    }
  }

  if (club.tier === 'top' && currentFame >= 35) {
    bonus += 1;
    reasons.push('高段位破格尝试');
  }

  return { bonus, reasons };
}

export function clubApplicationRollBonus(player: Player, eventId: string): number {
  const isApplicationEvent = eventId === 'chain-club-response' ||
    eventId === 'chain-club-interview' ||
    eventId === 'chain-club-interview-open-match' ||
    eventId === 'chain-club-interview-talent';
  if (!isApplicationEvent || !player.pendingApplication) return 0;

  const originBonus = player.pendingApplication.originFitBonus ?? 0;
  const exceptionBonus = player.pendingApplication.exceptionBonus ?? 0;
  const eventBonus = [
    'club-exception-scouted',
    'club-exception-roster-window',
    'club-exception-referenced',
  ].some((tag) => player.tags.includes(tag)) ? 1 : 0;
  return Math.max(-2, Math.min(4, originBonus + exceptionBonus + eventBonus));
}

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

  const isRookieApplyingToYouth = player.stage === 'rookie' && club.requiredStage === 'youth';
  if (!isRookieApplyingToYouth && STAGE_ORDER.indexOf(player.stage) < STAGE_ORDER.indexOf(club.requiredStage)) {
    throw new Error('当前阶段不满足该俱乐部的门槛');
  }
  if (club.requiredFame !== undefined && (player.fame ?? 0) < club.requiredFame) {
    throw new Error(`名气不足，需要 ≥ ${club.requiredFame}`);
  }

  const ap = player.actionPoints ?? 0;
  if (ap < 25) throw new Error('行动力不足');

  const runtime = previewClubRuntime(session, club.id);
  const originRegion = player.originRegion || '本地';
  const originFit = resolveClubOriginFit(originRegion, club);
  const exception = clubExceptionContext(player, club, runtime);
  const youthApplication = player.stage === 'rookie' && club.requiredStage === 'youth'
    ? scoreYouthApplication(player, club, originFit.bonus, exception.bonus)
    : null;

  const responseDelay = 2 + Math.floor(Math.random() * 3);
  const pending: PendingApplication = {
    clubId,
    clubName: club.name,
    appliedRound: player.round,
    responseRound: player.round + responseDelay,
    path: youthApplication ? 'youth-score' : undefined,
    score: youthApplication?.score,
    result: youthApplication?.result,
    originRegion,
    originPreference: originFit.preference,
    originFit: originFit.fit,
    originFitBonus: originFit.bonus,
    exceptionBonus: exception.bonus,
    exceptionReasons: exception.reasons,
  };

  const nextTags = dedupe([
    ...player.tags,
    'applying',
    `club-origin-${originFit.fit}`,
    ...(exception.bonus > 0 ? ['club-exception-ready'] : []),
    ...(exception.reasons.includes('名气远高于门槛') ? ['club-exception-strength'] : []),
    ...(exception.reasons.includes('阵容或状态存在缺口') ? ['club-exception-roster'] : []),
  ]);

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

export function joinTeamFromOffer(
  session: GameSession,
  sourcePlayer: Player,
  offer: TeamOffer,
  options: { contractDispute: boolean },
): Player {
  let player = { ...sourcePlayer };
  const hadTeam = player.team !== null;

  if (hadTeam) {
    player = finalizePlayerCareerSnapshot(player);
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
  const initialStatus = offer.teamStatus
    ? {
        teamStatus: offer.teamStatus,
        ...(offer.teamStatusUntilRound ? { teamStatusUntilRound: offer.teamStatusUntilRound } : {}),
      }
    : deriveInitialTeamStatus(player, offer, hadTeam);
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

  const deptSlot = roster[Math.floor(rosterRng() * roster.length)]!.id;
  const deptRivals = player.rivals.length > 0 ? player.rivals : [{ name: '某支战队', tag: '???', region: '' }];
  const deptDestTeam = deptRivals[Math.floor(rosterRng() * deptRivals.length)]!.name;
  const initialPendingDeparture = createInitialPendingDeparture(player, rosterRng, deptDestTeam, deptSlot);

  return refreshVisibleTeamIdentities({
    ...player,
    team,
    unattachedSinceRound: undefined,
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

export function pickPromotionClub(tier: ClubTier, sessionId: string, round: number): Club | null {
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
