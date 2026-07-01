import { CLUBS } from '../data/clubs.js';
import type { Tournament } from '../data/tournaments.js';
import type {
  Club,
  GameSession,
  MatchStats,
  TournamentInstance,
  TournamentInstanceStage,
  TournamentInstanceSummary,
  TournamentPlayerAward,
  TournamentPlayerPerformance,
  TournamentTeamEntry,
  WorldPlayer,
} from '../types.js';
import { makeRng } from './resolver.js';
import { calculateClubPower, computeClubVrsScore, ensureWorldClubPool, previewClubRuntime } from './worldClubs.js';

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fieldSizeFor(tournament: Tournament): number {
  if (tournament.tier === 'major') return 32;
  if (tournament.tier === 's-class' || tournament.tier === 's-open' || tournament.tier === 's-closed') return 16;
  if (tournament.tier === 'a') return 16;
  if (tournament.tier === 'b') return 12;
  return 8;
}

function sourceForClub(club: Club, tournament: Tournament): TournamentTeamEntry['source'] {
  if (tournament.tier === 'c') return club.tier === 'youth' ? 'local' : 'regional';
  if (tournament.tier === 'b') return club.tier === 'youth' ? 'qualifier' : 'regional';
  if (tournament.tier === 'a') return club.tier === 'pro' ? 'invite' : 'qualifier';
  return 'vrs';
}

function candidateClubs(session: GameSession, tournament: Tournament): Club[] {
  const pool = ensureWorldClubPool(session).worldClubs;
  const ids = new Set([
    ...(pool?.activeClubIds ?? []),
    ...(pool?.relevantClubIds ?? []),
    ...(pool?.staticClubIds ?? []),
  ]);
  return CLUBS
    .filter((club) => !club.isRival && ids.has(club.id))
    .filter((club) => {
      if (tournament.tier === 'major') return true;
      if (tournament.tier === 'c') return club.tier === 'youth' || club.tier === 'semi-pro';
      if (tournament.tier === 'b') return club.tier === 'youth' || club.tier === 'semi-pro';
      if (tournament.tier === 'a') return club.tier === 'semi-pro' || club.tier === 'pro';
      return club.tier === 'pro' || club.tier === 'top';
    });
}

function seededClubs(session: GameSession, tournament: Tournament): Club[] {
  const rng = makeRng(hashString(`${session.id}:instance-field:${tournament.id}:${session.player.year ?? 1}`));
  return candidateClubs(session, tournament)
    .map((club) => {
      const runtime = previewClubRuntime(session, club.id);
      const vrs = computeClubVrsScore(runtime);
      const power = calculateClubPower(runtime);
      const jitter = rng() * 0.01;
      const rankScore = tournament.tier === 's-class' || tournament.tier === 's-open' || tournament.tier === 's-closed' || tournament.tier === 'major'
        ? vrs + power + jitter
        : power + jitter;
      return { club, rankScore };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .map((entry) => entry.club);
}

function stageTypeFor(index: number, total: number): TournamentInstanceStage['type'] {
  if (index === total - 1) return 'final';
  if (index === total - 2) return 'semifinal';
  if (index === total - 3) return 'quarterfinal';
  return index === 0 ? 'play-in' : 'group';
}

function roundParticipants(teams: TournamentTeamEntry[], stageIndex: number): TournamentTeamEntry[] {
  const fieldSize = Math.max(2, teams.length >> Math.min(stageIndex, 3));
  return teams.slice(0, Math.max(2, fieldSize));
}

function pairTeams(
  teams: TournamentTeamEntry[],
  playerTeamClubId: string | undefined,
  playerOpponentClubId: string | undefined,
): Array<{ teamAClubId: string; teamBClubId: string; playerMatch: boolean }> {
  const pairs: Array<{ teamAClubId: string; teamBClubId: string; playerMatch: boolean }> = [];
  const used = new Set<string>();
  if (playerTeamClubId && playerOpponentClubId) {
    pairs.push({ teamAClubId: playerTeamClubId, teamBClubId: playerOpponentClubId, playerMatch: true });
    used.add(playerTeamClubId);
    used.add(playerOpponentClubId);
  }

  const remaining = teams.map((team) => team.clubId).filter((clubId) => !used.has(clubId));
  for (let i = 0; i + 1 < remaining.length; i += 2) {
    pairs.push({ teamAClubId: remaining[i]!, teamBClubId: remaining[i + 1]!, playerMatch: false });
  }
  return pairs;
}

function rostersForTeams(session: GameSession, teams: TournamentTeamEntry[]): Record<string, WorldPlayer[]> {
  return Object.fromEntries(
    teams.map((team) => [team.clubId, previewClubRuntime(session, team.clubId).fullRoster]),
  );
}

export function createTournamentInstance(session: GameSession, tournament: Tournament): TournamentInstance {
  const season = session.player.year ?? 1;
  const playerTeamClubId = session.player.team?.clubId;
  const selected: Club[] = [];
  const seen = new Set<string>();

  if (playerTeamClubId) {
    const playerClub = CLUBS.find((club) => club.id === playerTeamClubId);
    if (playerClub) {
      selected.push(playerClub);
      seen.add(playerClub.id);
    }
  }

  for (const club of seededClubs(session, tournament)) {
    if (selected.length >= fieldSizeFor(tournament)) break;
    if (seen.has(club.id)) continue;
    selected.push(club);
    seen.add(club.id);
  }

  const teams: TournamentTeamEntry[] = selected.map((club, index) => ({
    clubId: club.id,
    seed: index + 1,
    source: club.id === playerTeamClubId ? 'player' : sourceForClub(club, tournament),
  }));

  const playerSeed = Math.max(0, teams.findIndex((team) => team.clubId === playerTeamClubId));
  const opponents = teams
    .filter((team) => team.clubId !== playerTeamClubId)
    .map((team) => team.clubId);
  const playerPath = tournament.bracket.map((_, stageIndex) => ({
    stageIndex,
    opponentClubId: opponents[(playerSeed + stageIndex) % Math.max(1, opponents.length)] ?? opponents[0] ?? '',
  }));

  const stages: TournamentInstanceStage[] = tournament.bracket.map((stage, stageIndex) => {
    const roundId = `${tournament.id}:round-${stageIndex}`;
    const opponentClubId = playerPath[stageIndex]?.opponentClubId;
    const stageTeams = roundParticipants(teams, stageIndex);
    const pairings = pairTeams(stageTeams, playerTeamClubId, opponentClubId);
    return {
      id: roundId,
      name: stage.name,
      type: stageTypeFor(stageIndex, tournament.bracket.length),
      seriesType: stage.seriesType ?? 'bo1',
      matches: pairings.map((pairing, matchIndex) => ({
        id: pairing.playerMatch ? `${roundId}:player` : `${roundId}:match-${matchIndex}`,
        roundId,
        teamAClubId: pairing.teamAClubId,
        teamBClubId: pairing.teamBClubId,
        seriesType: stage.seriesType ?? 'bo1',
        playerMatch: pairing.playerMatch,
        completed: false,
      })),
    };
  });

  return {
    id: `${tournament.id}:${season}`,
    tournamentId: tournament.id,
    season,
    status: 'registered',
    teams,
    stages,
    playerTeamClubId,
    playerPath,
    teamRosters: rostersForTeams(session, teams),
  };
}

export function lockTournamentInstance(instance: TournamentInstance): TournamentInstance {
  if (instance.status !== 'registered') return instance;
  return { ...instance, status: 'locked' };
}

export function drawTournamentInstance(instance: TournamentInstance): TournamentInstance {
  if (instance.status === 'completed' || instance.status === 'in-progress' || instance.status === 'drawn') return instance;
  return { ...instance, status: 'drawn' };
}

export function instanceOpponentFor(instance: TournamentInstance | null | undefined, stageIndex: number): string | undefined {
  return instance?.playerPath?.find((path) => path.stageIndex === stageIndex)?.opponentClubId;
}

function scoreForSeries(seriesType: 'bo1' | 'bo3' | 'bo5', won: boolean): string {
  if (seriesType === 'bo5') return won ? '3-1' : '1-3';
  if (seriesType === 'bo3') return won ? '2-1' : '1-2';
  return won ? '1-0' : '0-1';
}

function rosterPower(roster: WorldPlayer[]): number {
  if (roster.length === 0) return 0;
  return roster.reduce((sum, player) => {
    const stats = player.stats;
    return sum +
      stats.agility * 0.24 +
      stats.constitution * 0.12 +
      stats.intelligence * 0.22 +
      stats.mentality * 0.2 +
      stats.experience * 0.12 +
      player.form * 0.8 +
      player.reputation * 0.25;
  }, 0) / roster.length;
}

function standoutPlayerId(instance: TournamentInstance, clubId: string, seed: number): string {
  const roster = [...(instance.teamRosters?.[clubId] ?? [])]
    .sort((a, b) => {
      const scoreA = a.reputation + a.form + a.stats.mentality * 0.2 + a.stats.experience * 0.2;
      const scoreB = b.reputation + b.form + b.stats.mentality * 0.2 + b.stats.experience * 0.2;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.id.localeCompare(b.id);
    });
  return roster[seed % Math.max(1, roster.length)]?.id ?? `${clubId}:starter-${(seed % 5) + 1}`;
}

function simulateNonPlayerMatch(instance: TournamentInstance, stageIndex: number, match: TournamentInstanceStage['matches'][number]): TournamentInstanceStage['matches'][number] {
  const seed = hashString(`${instance.id}:${stageIndex}:${match.id}:${match.teamAClubId}:${match.teamBClubId}`);
  const teamAPower = rosterPower(instance.teamRosters?.[match.teamAClubId] ?? []);
  const teamBPower = rosterPower(instance.teamRosters?.[match.teamBClubId] ?? []);
  const powerEdge = Math.max(-25, Math.min(25, teamAPower - teamBPower));
  const teamAWins = (seed % 100) < 50 + powerEdge;
  const winnerClubId = teamAWins ? match.teamAClubId : match.teamBClubId;
  return {
    ...match,
    completed: true,
    winnerClubId,
    score: scoreForSeries(match.seriesType, teamAWins),
    standoutPlayerIds: [standoutPlayerId(instance, winnerClubId, seed)],
  };
}

function simulateMatchForTeams(
  instance: TournamentInstance,
  stageIndex: number,
  matchIndex: number,
  teamAClubId: string,
  teamBClubId: string,
  seriesType: 'bo1' | 'bo3' | 'bo5',
): TournamentInstanceStage['matches'][number] {
  return simulateNonPlayerMatch(instance, stageIndex, {
    id: `${instance.tournamentId}:round-${stageIndex}:ff-${matchIndex}`,
    roundId: `${instance.tournamentId}:round-${stageIndex}`,
    teamAClubId,
    teamBClubId,
    seriesType,
    playerMatch: false,
    completed: false,
  });
}

function rebuildNextStageFromWinners(
  instance: TournamentInstance,
  stages: TournamentInstanceStage[],
  completedStageIndex: number,
): { stages: TournamentInstanceStage[]; playerPath: TournamentInstance['playerPath'] } {
  const playerClubId = instance.playerTeamClubId;
  const nextStage = stages[completedStageIndex + 1];
  if (!playerClubId || !nextStage) {
    return { stages, playerPath: instance.playerPath };
  }

  const winners = stages[completedStageIndex]?.matches
    .map((match) => match.winnerClubId)
    .filter((clubId): clubId is string => Boolean(clubId)) ?? [];
  if (!winners.includes(playerClubId) || winners.length < 2) {
    return { stages, playerPath: instance.playerPath };
  }

  const opponentClubId = winners.find((clubId) => clubId !== playerClubId);
  if (!opponentClubId) {
    return { stages, playerPath: instance.playerPath };
  }

  const roundId = nextStage.id;
  const pairs = pairTeams(
    winners.map((clubId, index) => ({ clubId, seed: index + 1, source: clubId === playerClubId ? 'player' : 'qualifier' })),
    playerClubId,
    opponentClubId,
  );
  const nextMatches = pairs.map((pairing, matchIndex) => ({
    id: pairing.playerMatch ? `${roundId}:player` : `${roundId}:match-${matchIndex}`,
    roundId,
    teamAClubId: pairing.teamAClubId,
    teamBClubId: pairing.teamBClubId,
    seriesType: nextStage.seriesType ?? 'bo1',
    playerMatch: pairing.playerMatch,
    completed: false,
  }));

  return {
    stages: stages.map((stage, index) => index === completedStageIndex + 1
      ? { ...stage, matches: nextMatches }
      : stage),
    playerPath: [
      ...(instance.playerPath ?? []).filter((path) => path.stageIndex !== completedStageIndex + 1),
      { stageIndex: completedStageIndex + 1, opponentClubId },
    ].sort((a, b) => a.stageIndex - b.stageIndex),
  };
}

function fastForwardInstance(instance: TournamentInstance): TournamentInstance {
  let advancing = instance.teams.map((team) => team.clubId);
  const stages = instance.stages.map((stage, stageIndex) => {
    const completedMatches = stage.matches.filter((match) => match.completed);
    const existingWinners = completedMatches
      .map((match) => match.winnerClubId)
      .filter((clubId): clubId is string => Boolean(clubId));
    const playerParticipants = new Set(
      completedMatches
        .filter((match) => match.playerMatch)
        .flatMap((match) => [match.teamAClubId, match.teamBClubId]),
    );
    const remaining = advancing.filter((clubId) => !playerParticipants.has(clubId));
    const simulatedMatches: TournamentInstanceStage['matches'] = [];
    for (let i = 0; i + 1 < remaining.length; i += 2) {
      simulatedMatches.push(simulateMatchForTeams(
        instance,
        stageIndex,
        simulatedMatches.length,
        remaining[i]!,
        remaining[i + 1]!,
        stage.seriesType ?? 'bo1',
      ));
    }
    const matches = [
      ...completedMatches,
      ...simulatedMatches,
    ];
    const winners = matches
      .map((match) => match.winnerClubId)
      .filter((clubId): clubId is string => Boolean(clubId));
    advancing = winners.length > 0 ? winners : existingWinners;
    if (advancing.length <= 1 && stageIndex < instance.stages.length - 1) {
      advancing = [
        advancing[0] ?? instance.teams[0]?.clubId ?? '',
        ...instance.teams.map((team) => team.clubId).filter((clubId) => clubId !== advancing[0]).slice(0, 1),
      ].filter(Boolean);
    }
    return {
      ...stage,
      matches,
    };
  });

  return {
    ...instance,
    stages,
  };
}

export function recordPlayerMatchInInstance(
  instance: TournamentInstance,
  stageIndex: number,
  won: boolean,
  matchStats?: MatchStats,
  playerName = '玩家',
): TournamentInstance {
  const playerClubId = instance.playerTeamClubId;
  if (!playerClubId) return instance;
  const stages = instance.stages.map((stage, index) => {
    if (index !== stageIndex) return stage;
    return {
      ...stage,
      matches: stage.matches.map((match) => {
        if (!match.playerMatch) return match.completed ? match : simulateNonPlayerMatch(instance, stageIndex, match);
        const opponentClubId = match.teamAClubId === playerClubId ? match.teamBClubId : match.teamAClubId;
        return {
          ...match,
          completed: true,
          winnerClubId: won ? playerClubId : opponentClubId,
          score: scoreForSeries(match.seriesType, won),
          standoutPlayerIds: [`${won ? playerClubId : opponentClubId}:starter-1`],
        };
      }),
    };
  });
  const rebuilt = won
    ? rebuildNextStageFromWinners(instance, stages, stageIndex)
    : { stages, playerPath: instance.playerPath };
  return {
    ...instance,
    status: 'in-progress',
    stages: rebuilt.stages,
    playerPath: rebuilt.playerPath,
    performances: matchStats ? [
      ...(instance.performances ?? []).filter((performance) => !(performance.playerId === 'player' && performance.clubId === playerClubId)),
      {
        playerId: 'player',
        playerName,
        clubId: playerClubId,
        tournamentInstanceId: instance.id,
        rating: matchStats.rating,
        kills: matchStats.kills,
        deaths: matchStats.deaths,
        assists: matchStats.assists,
        impact: matchStats.rating,
      } as TournamentPlayerPerformance & { playerName: string },
    ] : instance.performances,
  };
}

function awardFor(clubId: string, instance: TournamentInstance, award: string, rating: number): TournamentPlayerAward {
  const performance = [...(instance.performances ?? [])]
    .filter((entry) => entry.clubId === clubId)
    .sort((a, b) => b.rating - a.rating)[0] as (TournamentPlayerPerformance & { playerName?: string }) | undefined;
  if (performance) {
    return {
      clubId,
      playerId: performance.playerId,
      playerName: performance.playerName ?? performance.playerId,
      award,
      rating: performance.rating,
    };
  }
  const runtimePlayer = instance.stages
    .flatMap((stage) => stage.matches)
    .flatMap((match) => match.standoutPlayerIds ?? [])
    .find((playerId) => playerId.startsWith(`${clubId}:`));
  return {
    clubId,
    playerId: runtimePlayer ?? `${clubId}:starter-1`,
    playerName: runtimePlayer?.split(':').at(-1) ?? 'MVP',
    award,
    rating,
  };
}

function placementFloorForElimination(stageIndex: number, totalStages: number): number {
  const remainingAfterStage = 2 ** Math.max(0, totalStages - stageIndex - 1);
  return remainingAfterStage + 1;
}

function finalPlacementsFor(instance: TournamentInstance, championClubId: string, runnerUpClubId: string): Record<string, number> {
  const placements: Record<string, number> = {
    [championClubId]: 1,
    [runnerUpClubId]: 2,
  };
  const totalStages = instance.stages.length;
  const eliminatedByStage = new Map<number, Set<string>>();

  instance.stages.forEach((stage, stageIndex) => {
    for (const match of stage.matches) {
      if (!match.completed || !match.winnerClubId) continue;
      const loserClubId = match.winnerClubId === match.teamAClubId ? match.teamBClubId : match.teamAClubId;
      if (loserClubId === championClubId || loserClubId === runnerUpClubId) continue;
      const stageLosers = eliminatedByStage.get(stageIndex) ?? new Set<string>();
      stageLosers.add(loserClubId);
      eliminatedByStage.set(stageIndex, stageLosers);
    }
  });

  const fallbackPlacement = placementFloorForElimination(0, totalStages);
  const assigned = new Set([championClubId, runnerUpClubId]);
  for (let stageIndex = totalStages - 1; stageIndex >= 0; stageIndex--) {
    const placement = placementFloorForElimination(stageIndex, totalStages);
    const slotCount = Math.max(1, placement - 1);
    const losers = [...(eliminatedByStage.get(stageIndex) ?? [])]
      .filter((clubId) => !assigned.has(clubId))
      .sort((a, b) => {
        const seedA = instance.teams.find((team) => team.clubId === a)?.seed ?? Number.MAX_SAFE_INTEGER;
        const seedB = instance.teams.find((team) => team.clubId === b)?.seed ?? Number.MAX_SAFE_INTEGER;
        return seedA - seedB || a.localeCompare(b);
      });
    for (const clubId of losers.slice(0, slotCount)) {
      placements[clubId] = placement;
      assigned.add(clubId);
    }
  }

  for (const team of instance.teams) {
    placements[team.clubId] = placements[team.clubId] ?? team.finalPlacement ?? fallbackPlacement;
  }

  return placements;
}

export function completeTournamentInstance(instance: TournamentInstance, playerWonFinal: boolean): TournamentInstance {
  const resolvedInstance = fastForwardInstance(drawTournamentInstance(lockTournamentInstance(instance)));
  const playerClubId = instance.playerTeamClubId;
  const finalMatch = resolvedInstance.stages[resolvedInstance.stages.length - 1]?.matches[0];
  const completedPlayerOpponent = [...resolvedInstance.stages]
    .reverse()
    .flatMap((stage) => stage.matches)
    .find((match) => match.playerMatch && match.completed);
  const knownOpponent = completedPlayerOpponent && playerClubId
    ? completedPlayerOpponent.teamAClubId === playerClubId
      ? completedPlayerOpponent.teamBClubId
      : completedPlayerOpponent.teamAClubId
    : undefined;
  const finalOpponent = knownOpponent
    ?? resolvedInstance.playerPath?.[resolvedInstance.playerPath.length - 1]?.opponentClubId
    ?? resolvedInstance.playerPath?.[0]?.opponentClubId;
  const abstractChampion = finalMatch?.winnerClubId;
  const championClubId = playerWonFinal && playerClubId
    ? playerClubId
    : abstractChampion ?? finalOpponent ?? playerClubId ?? resolvedInstance.teams[0]?.clubId ?? '';
  const abstractRunnerUp = finalMatch
    ? finalMatch.winnerClubId === finalMatch.teamAClubId ? finalMatch.teamBClubId : finalMatch.teamAClubId
    : undefined;
  const runnerUpClubId = championClubId === playerClubId
    ? finalOpponent ?? resolvedInstance.teams.find((team) => team.clubId !== playerClubId)?.clubId ?? championClubId
    : abstractRunnerUp ?? playerClubId ?? resolvedInstance.teams.find((team) => team.clubId !== championClubId)?.clubId ?? championClubId;
  const finalPlacements = finalPlacementsFor(resolvedInstance, championClubId, runnerUpClubId);
  const teams = resolvedInstance.teams.map((team) => ({
    ...team,
    eliminated: team.clubId !== championClubId,
    finalPlacement: finalPlacements[team.clubId],
  }));
  return {
    ...resolvedInstance,
    status: 'completed',
    teams,
    awards: {
      championClubId,
      runnerUpClubId,
      winnerMvp: awardFor(championClubId, instance, '胜方 MVP', 1.24),
      loserMvp: awardFor(runnerUpClubId, instance, '败方 MVP', 1.12),
      bestPlayers: [
        awardFor(championClubId, instance, '赛事最佳选手', 1.24),
        awardFor(runnerUpClubId, instance, '赛事最佳表现', 1.12),
      ],
    },
  };
}

export function summarizeTournamentInstance(instance: TournamentInstance): TournamentInstanceSummary {
  const playerTeam = instance.playerTeamClubId
    ? instance.teams.find((team) => team.clubId === instance.playerTeamClubId)
    : undefined;
  return {
    id: instance.id,
    tournamentId: instance.tournamentId,
    season: instance.season,
    championClubId: instance.awards?.championClubId,
    runnerUpClubId: instance.awards?.runnerUpClubId,
    playerTeamClubId: instance.playerTeamClubId,
    playerFinalPlacement: playerTeam?.finalPlacement,
    awards: instance.awards,
  };
}
