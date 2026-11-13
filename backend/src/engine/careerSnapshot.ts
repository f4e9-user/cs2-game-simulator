import type { GameSession, Player, CareerPeaks, TeamCareer, CareerCompetitiveStage, Stage } from '../types.js';

const STAGE_RANK: Record<CareerCompetitiveStage, number> = {
  rookie: 0,
  youth: 1,
  second: 2,
  pro: 3,
};

function betterStage(a: CareerCompetitiveStage | undefined, b: CareerCompetitiveStage): CareerCompetitiveStage {
  if (!a) return b;
  return STAGE_RANK[b] > STAGE_RANK[a] ? b : a;
}

function normalizeCareerPeaks(player: Player): CareerPeaks {
  const previous = player.careerPeaks;
  const currentStage = player.stage === 'retired'
    ? previous?.highestStage ?? 'rookie'
    : (player.stage as CareerCompetitiveStage);

  return {
    highestStage: betterStage(previous?.highestStage, currentStage),
    peakFame: Math.max(previous?.peakFame ?? 0, player.fame ?? 0),
    peakStress: Math.max(previous?.peakStress ?? 0, player.stress ?? 0),
    lowestConstitution: Math.min(previous?.lowestConstitution ?? Number.POSITIVE_INFINITY, player.stats.constitution ?? Number.POSITIVE_INFINITY),
  };
}

function normalizeTeamCareer(player: Player): TeamCareer | undefined {
  const currentTeam = player.team;
  const previous = player.teamCareer;
  const base: TeamCareer = previous ?? {
    longestTeamRounds: 0,
  };

  if (!currentTeam) {
    return previous ? { ...previous } : undefined;
  }

  const currentRounds = Math.max(0, (player.round ?? 0) - (currentTeam.joinedRound ?? player.round ?? 0));
  if (currentRounds <= (previous?.longestTeamRounds ?? 0)) {
    return previous ? { ...previous } : {
      longestTeamName: currentTeam.name,
      longestTeamTag: currentTeam.tag,
      longestTeamTier: currentTeam.tier,
      longestTeamRounds: currentRounds,
    };
  }

  return {
    ...base,
    longestTeamName: currentTeam.name,
    longestTeamTag: currentTeam.tag,
    longestTeamTier: currentTeam.tier,
    longestTeamRounds: currentRounds,
  };
}

export function finalizePlayerCareerSnapshot(player: Player): Player {
  const careerPeaks = normalizeCareerPeaks(player);
  const teamCareer = normalizeTeamCareer(player);

  return {
    ...player,
    careerPeaks,
    ...(teamCareer ? { teamCareer } : {}),
  };
}

export function finalizeGameSessionCareerSnapshot(session: GameSession): GameSession {
  const finalizedPlayer = finalizePlayerCareerSnapshot(session.player);
  return {
    ...session,
    player: finalizedPlayer,
  };
}
