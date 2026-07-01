import { CLUBS } from '../data/clubs.js';
import { clubArchetype, clubCapital, clubHeritage } from '../data/clubIdentity.js';
import type {
  Club,
  ClubRuntimeState,
  GameSession,
  TeammateRole,
  TransferRecord,
  TransferRumor,
  TransferType,
  WeeklyNewsItem,
  WorldPlayer,
} from '../types.js';
import { makeRng } from './resolver.js';
import { clampNumber, hashString } from './utils.js';
import { calculateClubPower, deriveRosterNeed, ensureWorldClubPool } from './worldClubs.js';
import { buildWorldTransferNewsItem } from './worldNews.js';

export const TRANSFER_HISTORY_LIMIT = 24;
const TRANSFER_RUMOR_LIMIT = 24;
const ROLES: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];

function clubById(clubId: string): Club | undefined {
  return CLUBS.find((club) => club.id === clubId);
}

function transferTypeForBuyer(club: Club, runtime: ClubRuntimeState, neededRoles: TeammateRole[]): TransferType {
  const archetype = clubArchetype(club);
  if (archetype === 'development-factory') return 'prospect-promotion';
  if (archetype === 'fallen-legacy') return 'veteran-pickup';
  if (runtime.rebuildPressure && runtime.rebuildPressure >= 75) {
    return clubCapital(club) >= 75 ? 'star-signing' : 'rebuild-swap';
  }
  if (neededRoles.length > 0) return 'role-fix';
  if (clubCapital(club) >= 75 || clubHeritage(club) >= 75) return 'star-signing';
  return 'role-fix';
}

export function scoreTransferDemand(club: Club, runtime: ClubRuntimeState): {
  score: number;
  type: TransferType;
  neededRoles: TeammateRole[];
} {
  const need = deriveRosterNeed(runtime);
  const neededRoles = need.neededRoles;
  const averageAge = runtime.fullRoster.length > 0
    ? runtime.fullRoster.reduce((sum, player) => sum + player.age, 0) / runtime.fullRoster.length
    : 24;
  const hasStar = runtime.fullRoster.some(
    (player) => player.reputation >= 78 || player.archetype === 'superstar' || player.archetype === 'star-awper',
  );
  const pressure = runtime.rebuildPressure ?? 0;
  const capital = clubCapital(club);
  const heritage = clubHeritage(club);
  const developmentBonus = clubArchetype(club) === 'development-factory' ? 8 : 0;
  const score =
    neededRoles.length * 16 +
    (hasStar ? 0 : 18) +
    Math.max(0, averageAge - 28) * 3 +
    pressure * 0.45 +
    capital * 0.2 +
    heritage * 0.08 +
    developmentBonus -
    Math.max(0, runtime.currentForm) * 0.08;

  return {
    score,
    type: transferTypeForBuyer(club, runtime, neededRoles),
    neededRoles,
  };
}

export function scoreDepartureIntent(player: WorldPlayer, runtime: ClubRuntimeState): number {
  const sellerClub = clubById(runtime.clubId);
  const goalFailed = runtime.seasonGoal?.status === 'failed' ? 24 : 0;
  const strongInWeakTeam = player.reputation >= 75 && runtime.currentForm < 40 ? 18 : 0;
  const veteranWindow = player.age >= 30 ? 10 + (player.age - 30) * 2 : 0;
  const prospectStage = player.archetype === 'rookie-prospect' && player.reputation >= 58 ? 10 : 0;
  const squeezed = player.status !== 'starter' ? 14 : 0;
  const rebuildAwayFromPlayer =
    runtime.rebuildCorePlayerId && runtime.rebuildCorePlayerId !== player.id ? 12 : 0;
  const scrappyPoachRisk = sellerClub && clubArchetype(sellerClub) === 'scrappy-underdog' && player.reputation >= 70 ? 8 : 0;
  return goalFailed + strongInWeakTeam + veteranWindow + prospectStage + squeezed + rebuildAwayFromPlayer + scrappyPoachRisk + (runtime.rebuildPressure ?? 0) * 0.22;
}

function candidateClubIds(session: GameSession): string[] {
  const pool = session.worldClubs;
  if (!pool) return [];
  const ids = new Set<string>([
    ...pool.activeClubIds,
    ...pool.relevantClubIds,
    ...(session.player.team ? [session.player.team.clubId] : []),
  ]);
  const topByVrs = Object.values(pool.runtimeByClubId)
    .sort((a, b) => (b.vrsScore || calculateClubPower(b)) - (a.vrsScore || calculateClubPower(a)))
    .slice(0, 6)
    .map((runtime) => runtime.clubId);
  for (const id of topByVrs) ids.add(id);
  const highVrsIds = new Set(topByVrs);
  for (const id of pool.staticClubIds) {
    if (!highVrsIds.has(id) && !pool.activeClubIds.includes(id) && !pool.relevantClubIds.includes(id) && session.player.team?.clubId !== id) {
      ids.delete(id);
    }
  }
  return [...ids].filter((id) => Boolean(pool.runtimeByClubId[id] && clubById(id)));
}

function pickBestSeller(
  buyerId: string,
  runtimes: Record<string, ClubRuntimeState>,
  candidateIds: string[],
  preferredRoles: TeammateRole[],
): { seller: ClubRuntimeState; player: WorldPlayer } | null {
  const buyerClub = clubById(buyerId);
  let best: { seller: ClubRuntimeState; player: WorldPlayer; score: number } | null = null;
  for (const clubId of candidateIds) {
    if (clubId === buyerId) continue;
    const runtime = runtimes[clubId];
    if (!runtime) continue;
    for (const player of runtime.fullRoster) {
      if (player.status !== 'starter') continue;
      const roleFit = preferredRoles.length === 0 || preferredRoles.includes(player.role) ? 18 : 0;
      const regionalFit = buyerClub && clubArchetype(buyerClub) === 'regional-pride'
        ? player.region === buyerClub.region ? 8 : -2
        : 0;
      const legacyFit = buyerClub && clubArchetype(buyerClub) === 'legacy-giant'
        ? Math.max(0, player.stats.experience - 60) * 0.28 + Math.max(0, player.stats.mentality - 60) * 0.22
        : 0;
      const fallenLegacyFit = buyerClub && clubArchetype(buyerClub) === 'fallen-legacy'
        ? Math.max(0, player.age - 27) * 2.5 +
          Math.max(0, player.stats.experience - 60) * 0.32 +
          Math.max(0, player.stats.mentality - 60) * 0.28
        : 0;
      const score = scoreDepartureIntent(player, runtime) + player.reputation * 0.45 + roleFit + regionalFit + legacyFit + fallenLegacyFit;
      if (!best || score > best.score) best = { seller: runtime, player, score };
    }
  }
  if (!best || best.score < 55) return null;
  return { seller: best.seller, player: best.player };
}

function mintWorldPlayer(clubId: string, role: TeammateRole, season: number, index: number): WorldPlayer {
  const rng = makeRng(hashString(`transfer-mint:${clubId}:${season}:${role}:${index}`));
  return {
    id: `${clubId}:transfer-prospect-${season}-${role.toLowerCase()}-${index}`,
    name: `Prospect ${role} ${index}`,
    region: clubById(clubId)?.region ?? '国际',
    age: 18 + Math.floor(rng() * 4),
    clubId,
    role,
    status: 'starter',
    archetype: 'rookie-prospect',
    stats: {
      agility: 52 + Math.floor(rng() * 18),
      constitution: 50 + Math.floor(rng() * 16),
      intelligence: 45 + Math.floor(rng() * 18),
      mentality: 42 + Math.floor(rng() * 18),
      experience: 28 + Math.floor(rng() * 14),
    },
    form: 0,
    reputation: 38 + Math.floor(rng() * 15),
    traits: ['prospect'],
    personality: 'supportive',
    joinedRound: season * 48,
    internalChemistry: 45 + Math.floor(rng() * 15),
  };
}

export function normalizeTransferRoster(runtime: ClubRuntimeState, season: number): ClubRuntimeState {
  const roster = runtime.fullRoster.map((player) => ({ ...player, clubId: runtime.clubId }));
  let nextRoster = roster;
  for (const role of ROLES) {
    if (nextRoster.length >= 5) break;
    if (!nextRoster.some((player) => player.role === role)) {
      nextRoster = [...nextRoster, mintWorldPlayer(runtime.clubId, role, season, nextRoster.length + 1)];
    }
  }
  while (nextRoster.length < 5) {
    const role = ROLES[nextRoster.length % ROLES.length]!;
    nextRoster = [...nextRoster, mintWorldPlayer(runtime.clubId, role, season, nextRoster.length + 1)];
  }
  nextRoster = nextRoster.slice(0, 5).map((player) => ({ ...player, status: 'starter' as const }));
  return {
    ...runtime,
    fullRoster: nextRoster,
    playerIds: nextRoster.map((player) => player.id),
  };
}

function addPendingStoryFlag(runtime: ClubRuntimeState, flag: string): ClubRuntimeState {
  return {
    ...runtime,
    pendingStoryFlags: runtime.pendingStoryFlags.includes(flag)
      ? runtime.pendingStoryFlags
      : [...runtime.pendingStoryFlags, flag],
  };
}

function maybeSurfacePlayerAttention(
  session: GameSession,
  season: number,
  buyerCandidates: Array<{ clubId: string; club: Club; runtime: ClubRuntimeState; demand: { score: number; type: TransferType; neededRoles: TeammateRole[] } }>,
): { player: GameSession['player']; rumors: TransferRumor[] } {
  const player = session.player;
  if (!player.team || player.pendingOffer || player.forceNextEvent || player.tags.includes('poach-cd')) {
    return { player, rumors: [] };
  }
  if ((player.fame ?? 0) < 35) return { player, rumors: [] };

  const tierOrder = ['youth', 'semi-pro', 'pro', 'top'];
  const currentTierIndex = tierOrder.indexOf(player.team.tier);
  const candidate = buyerCandidates.find((entry) => (
    entry.clubId !== player.team?.clubId &&
    entry.demand.score >= 55 &&
    (
      tierOrder.indexOf(entry.club.tier) > currentTierIndex ||
      clubCapital(entry.club) >= 80 ||
      clubHeritage(entry.club) >= 80
    )
  ));
  if (!candidate) return { player, rumors: [] };

  return {
    player: {
      ...player,
      forceNextEvent: 'chain-rival-poach',
      tags: player.tags.includes('promote-eligible') ? player.tags : [...player.tags, 'promote-eligible'],
    },
    rumors: [{
      id: `rumor-player-attention-${season}-${candidate.clubId}`,
      season,
      playerId: 'player',
      fromClubId: player.team.clubId,
      toClubId: candidate.clubId,
      type: 'poach',
      credibility: 'medium',
      reason: `${candidate.club.name} 正在关注你的表现，可能很快发出挖角邀约`,
      resolved: false,
    }],
  };
}

export function runTransferWindow(session: GameSession, season: number): GameSession {
  const ensured = ensureWorldClubPool(session);
  const pool = ensured.worldClubs;
  if (!pool) return ensured;

  const ids = candidateClubIds(ensured);
  if (ids.length < 2) return ensured;

  let runtimeByClubId = { ...pool.runtimeByClubId };
  const buyerCandidates = ids
    .map((clubId) => {
      const club = clubById(clubId)!;
      const runtime = runtimeByClubId[clubId]!;
      const demand = scoreTransferDemand(club, runtime);
      return { clubId, club, runtime, demand };
    })
    .filter((entry) => entry.demand.score >= 45)
    .sort((a, b) => b.demand.score - a.demand.score);

  const maxTransfers = Math.max(1, Math.min(3, Math.ceil(ids.length * 0.3)));
  const records: TransferRecord[] = [];
  const rumors: TransferRumor[] = [];
  const news: WeeklyNewsItem[] = [];
  const movedPlayerIds = new Set<string>();
  let nextPlayer = ensured.player;
  const playerAttention = maybeSurfacePlayerAttention(ensured, season, buyerCandidates);
  nextPlayer = playerAttention.player;
  rumors.push(...playerAttention.rumors);

  for (const buyer of buyerCandidates) {
    if (records.length >= maxTransfers) break;
    const currentBuyerRuntime = runtimeByClubId[buyer.clubId]!;
    const currentDemand = scoreTransferDemand(buyer.club, currentBuyerRuntime);
    if (currentDemand.type === 'prospect-promotion' && ensured.player.team?.clubId !== buyer.clubId) {
      const role = currentDemand.neededRoles[0] ?? ROLES.find((candidate) => !currentBuyerRuntime.fullRoster.some((player) => player.role === candidate)) ?? 'Entry';
      const prospect = mintWorldPlayer(buyer.clubId, role, season, currentBuyerRuntime.fullRoster.length + 1);
      const record: TransferRecord = {
        id: `${season}-${prospect.id}-promotion`,
        season,
        playerId: prospect.id,
        fromClubId: buyer.clubId,
        toClubId: buyer.clubId,
        type: 'prospect-promotion',
        summary: `青训体系提拔 ${prospect.role} 新人`,
      };
      const nextBuyer = normalizeTransferRoster({
        ...currentBuyerRuntime,
        fullRoster: [prospect, ...currentBuyerRuntime.fullRoster].slice(0, 5),
        rosterStability: clampNumber((currentBuyerRuntime.rosterStability ?? 50) + 2, 0, 100),
        currentForm: clampNumber((currentBuyerRuntime.currentForm ?? 0) + 2, -100, 100),
      }, season);
      runtimeByClubId = {
        ...runtimeByClubId,
        [buyer.clubId]: nextBuyer,
      };
      records.push(record);
      rumors.push({
        id: `rumor-${record.id}`,
        season,
        playerId: prospect.id,
        fromClubId: buyer.clubId,
        toClubId: buyer.clubId,
        type: record.type,
        credibility: 'medium',
        reason: `${buyer.club.name} 准备从青训体系提拔 ${prospect.name}`,
        resolved: true,
      });
      news.push(buildWorldTransferNewsItem(record, prospect, buyer.club, buyer.club));
      movedPlayerIds.add(prospect.id);
      continue;
    }
    const picked = pickBestSeller(buyer.clubId, runtimeByClubId, ids, currentDemand.neededRoles);
    if (!picked || movedPlayerIds.has(picked.player.id)) continue;

    const fromClub = clubById(picked.seller.clubId);
    if (!fromClub) continue;
    const toClub = buyer.club;
    const transferredPlayer: WorldPlayer = {
      ...picked.player,
      clubId: buyer.clubId,
      status: 'starter',
      joinedRound: ensured.player.round ?? picked.player.joinedRound,
    };
    const record: TransferRecord = {
      id: `${season}-${picked.player.id}-to-${buyer.clubId}`,
      season,
      playerId: picked.player.id,
      fromClubId: picked.seller.clubId,
      toClubId: buyer.clubId,
      type: currentDemand.type,
      summary: currentDemand.type === 'star-signing'
        ? '高压补强窗口中的明星签约'
        : currentDemand.type === 'role-fix'
          ? `补齐 ${transferredPlayer.role} 位置缺口`
          : '休赛期阵容调整',
    };
    const rumor: TransferRumor = {
      id: `rumor-${record.id}`,
      season,
      playerId: picked.player.id,
      fromClubId: picked.seller.clubId,
      toClubId: buyer.clubId,
      type: record.type,
      credibility: 'high',
      reason: `${toClub.name} 需要补强，${picked.player.name} 离队意愿较高`,
      resolved: true,
    };

    const sellerRuntime = runtimeByClubId[picked.seller.clubId]!;
    if (ensured.player.team?.clubId === picked.seller.clubId) {
      runtimeByClubId = {
        ...runtimeByClubId,
        [picked.seller.clubId]: addPendingStoryFlag(sellerRuntime, 'teammate-poach-pending'),
      };
      if (!nextPlayer.pendingDeparture && nextPlayer.roster?.some((tm) => tm.id === picked.player.id)) {
        nextPlayer = {
          ...nextPlayer,
          pendingDeparture: {
            slotId: picked.player.id,
            departureRound: (nextPlayer.round ?? 0) + 7,
            rumorShown: false,
            revealed: false,
            destTeamName: toClub.name,
            destClubId: toClub.id,
            earlyRecruit: false,
            baseWindowStartRound: nextPlayer.round ?? 0,
            pressure: 72,
            pressureThreshold: 100,
            lastPressureRound: nextPlayer.round ?? 0,
            reasonTags: ['豪门关注', '转会窗口传闻'],
          },
        };
      }
      rumors.push({
        ...rumor,
        id: `rumor-player-team-${record.id}`,
        resolved: false,
        reason: `${toClub.name} 正在关注你的队友 ${picked.player.name}，管理层还没有做最终决定`,
      });
      movedPlayerIds.add(picked.player.id);
      continue;
    }

    if (ensured.player.team?.clubId === buyer.clubId) {
      runtimeByClubId = {
        ...runtimeByClubId,
        [buyer.clubId]: addPendingStoryFlag(currentBuyerRuntime, 'incoming-signing-pending'),
      };
      rumors.push({
        ...rumor,
        id: `rumor-player-team-incoming-${record.id}`,
        resolved: false,
        reason: `${toClub.name} 正在评估新援 ${picked.player.name}，这可能带来位置竞争`,
      });
      movedPlayerIds.add(picked.player.id);
      continue;
    }

    const nextSeller = normalizeTransferRoster({
      ...sellerRuntime,
      fullRoster: sellerRuntime.fullRoster.filter((player) => player.id !== picked.player.id),
      rosterStability: clampNumber((sellerRuntime.rosterStability ?? 50) - 4, 0, 100),
      currentForm: clampNumber((sellerRuntime.currentForm ?? 0) - 2, -100, 100),
    }, season);
    const benchedPlayer = currentBuyerRuntime.fullRoster.length >= 5
      ? currentBuyerRuntime.fullRoster[4]
      : undefined;
    const buyerWithoutRoleOverflow = currentBuyerRuntime.fullRoster.length >= 5
      ? currentBuyerRuntime.fullRoster.slice(0, 4)
      : currentBuyerRuntime.fullRoster;
    const nextBuyer = normalizeTransferRoster({
      ...currentBuyerRuntime,
      fullRoster: [transferredPlayer, ...buyerWithoutRoleOverflow.filter((player) => player.id !== picked.player.id)],
      rosterStability: clampNumber((currentBuyerRuntime.rosterStability ?? 50) - 3, 0, 100),
      currentForm: clampNumber((currentBuyerRuntime.currentForm ?? 0) + 5, -100, 100),
    }, season);

    runtimeByClubId = {
      ...runtimeByClubId,
      [picked.seller.clubId]: nextSeller,
      [buyer.clubId]: nextBuyer,
    };
    movedPlayerIds.add(picked.player.id);
    records.push(record);
    if (benchedPlayer) {
      records.push({
        id: `${season}-${benchedPlayer.id}-benched-by-${buyer.clubId}`,
        season,
        playerId: benchedPlayer.id,
        fromClubId: buyer.clubId,
        toClubId: buyer.clubId,
        type: 'benching',
        summary: `${benchedPlayer.name} 因 ${transferredPlayer.name} 加盟让出首发位置`,
      });
    }
    rumors.push(rumor);
    news.push(buildWorldTransferNewsItem(record, transferredPlayer, toClub, fromClub));
  }

  if (records.length === 0 && rumors.length === 0 && nextPlayer === ensured.player) return ensured;

  return {
    ...ensured,
    player: nextPlayer,
    transferHistory: [...records, ...(ensured.transferHistory ?? [])].slice(0, TRANSFER_HISTORY_LIMIT),
    transferRumors: [...rumors, ...(ensured.transferRumors ?? [])].slice(0, TRANSFER_RUMOR_LIMIT),
    weeklyNews: [...(ensured.weeklyNews ?? []), ...news],
    worldClubs: {
      ...pool,
      runtimeByClubId,
    },
  };
}
