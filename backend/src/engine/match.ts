import { type Tournament, stageRewardDelta } from '../data/tournaments.js';
import { PRIZE_SPLIT } from '../data/clubs.js';
import { getRoleProfile } from '../data/roleProfiles.js';
import type { Outcome, Player, StatKey } from '../types.js';
import { CAREER_TIME_EXPERIENCE_RAW } from './constants.js';
import { applyCareerExperienceGrowth, clampStats, resolveChoice } from './resolver.js';
import { applyMoneyDeltaToStats } from './money.js';
import { type MatchSimResult } from './matchSimulator.js';
import { type TournamentMapResult, type TournamentSeriesContext } from './tournamentSeries.js';

interface MatchReward {
  money: number;
  experience: number;
}

function resolveRoleMatchBonus(text: string): number {
  if (text.includes('统治') || text.includes('关键回合') || text.includes('稳定')) return 2;
  if (text.includes('上限') || text.includes('执行') || text.includes('信息') || text.includes('容错')) return 1;
  if (text.includes('失误') || text.includes('拖低') || text.includes('模糊') || text.includes('脱节')) return -1;
  return 0;
}

export function buildMatchResolveResult(
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

  const winReward: MatchReward = isFinal
    ? { money: r.money, experience: r.experience }
    : { money: Math.max(0, Math.floor(r.money / 4)), experience: Math.max(1, Math.floor(r.experience / 4)) };
  const lossReward: MatchReward = {
    money: Math.max(0, Math.floor(r.money * lossShare)),
    experience: Math.max(1, Math.floor(r.experience * lossShare)),
  };
  const winFame = isFinal ? r.fame : Math.floor(r.fame / 5);
  const lossFame = Math.floor(r.fame * lossShare);
  const winStressDelta = isFinal ? (r.stressDelta ?? 0) * 5 : 0;
  const lossStressDelta = ((r.stressDelta ?? 1) + 2) * 5;
  const matchStressMultiplier = (player.buffs ?? [])
    .filter((buff) => buff.consumeOn === 'match' && (buff.actionTag === 'match' || buff.actionTag === 'all'))
    .reduce((acc, buff) => acc * (buff.matchStressMultiplier ?? 1), 1);
  const roleProfile = player.activeRole ? getRoleProfile(player.activeRole) : null;
  const roleTrustDelta = roleProfile
    ? resolveRoleMatchBonus(roleProfile.matchContributions.primary) +
      resolveRoleMatchBonus(roleProfile.matchContributions.secondary) +
      resolveRoleMatchBonus(roleProfile.matchContributions.risk)
    : 0;
  const roleChemistryDelta = roleProfile
    ? resolveRoleMatchBonus(roleProfile.matchContributions.secondary) +
      Math.floor(resolveRoleMatchBonus(roleProfile.matchContributions.primary) / 2)
    : 0;

  const playerShare = player.team
    ? (PRIZE_SPLIT[player.team.tier] ?? 1.0)
    : 1.0;
  const rawMoney = won ? (winReward.money ?? 0) : (lossReward.money ?? 0);
  const moneyDelta = player.team && playerShare < 1.0
    ? Math.round(rawMoney * playerShare)
    : rawMoney;

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
    effects: {
      teamTrustDelta: roleTrustDelta !== 0 ? roleTrustDelta : undefined,
      teamChemistryDelta: roleChemistryDelta !== 0 ? roleChemistryDelta : undefined,
    },
  };

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

export function buildTournamentMapResolveResult(
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

export function buildTournamentForfeitResolveResult(player: Player, narrative: string): ReturnType<typeof resolveChoice> {
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

export function injuryAdjustedPlayer(player: Player, mode: 'play-injured' | 'reduce-role'): Player {
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
    fatigueDelta: 0,
    winProb: won ? 1 : 0,
    summary: `系列赛${won ? '获胜' : '失利'}，总比分 ${context.playerMapWins}-${context.opponentMapWins}。` +
      maps.map((map, index) => ` Map${index + 1} ${map.mapName} ${map.teamScore}:${map.enemyScore}`).join('；'),
  };
}

export function matchSimToTournamentMapResult(mapName: string, sim: MatchSimResult): TournamentMapResult {
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

export function applyForcedMatchResult(sim: MatchSimResult, forcedResult: 'win' | 'loss'): MatchSimResult {
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

export { stageRewardDelta, CAREER_TIME_EXPERIENCE_RAW };
