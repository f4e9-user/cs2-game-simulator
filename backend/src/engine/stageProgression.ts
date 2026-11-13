import type { ClubTier, GameSession, Player, Stage, StagePressureState, TournamentTier } from '../types.js';
import { getTournament } from '../data/tournaments.js';
import { STAGE_ORDER } from './constants.js';

export interface StagePressureEvaluation {
  pressure: StagePressureState;
  demoted: boolean;
  demotionFrom?: Stage;
  demotionTo?: Stage;
  reason?: string;
}

export interface StagePressureOptions {
  resultSeason?: number;
  stateSeason?: number;
}

const STAGE_MARKET_FAME: Partial<Record<Stage, number>> = {
  second: 10,
  pro: 25,
};

function stageRank(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

function tournamentIdFromEventId(eventId: string): string | null {
  const match = /^tournament-(.+)--\d+$/.exec(eventId);
  return match?.[1] ?? null;
}

function seasonRoundRange(season: number): { startExclusive: number; endInclusive: number } {
  return {
    startExclusive: Math.max(0, (season - 1) * 48),
    endInclusive: season * 48,
  };
}

function currentSeasonTournamentResults(session: GameSession, season: number): Array<{ tier: TournamentTier; success: boolean; stageIndex: number }> {
  const range = seasonRoundRange(season);
  const out: Array<{ tier: TournamentTier; success: boolean; stageIndex: number }> = [];
  for (const result of session.history) {
    const round = result.round ?? 0;
    if (round <= range.startExclusive || round > range.endInclusive) continue;
    const tournamentId = tournamentIdFromEventId(result.eventId);
    if (!tournamentId) continue;
    const tournament = getTournament(tournamentId);
    if (!tournament) continue;
    const stageIndex = Number(/^tournament-.+--(\d+)$/.exec(result.eventId)?.[1] ?? 0);
    out.push({ tier: tournament.tier, success: result.success, stageIndex });
  }
  return out;
}

function hasSeasonDeepResult(session: GameSession, season: number, tiers: TournamentTier[]): boolean {
  return currentSeasonTournamentResults(session, season)
    .some((result) => tiers.includes(result.tier) && (result.success || result.stageIndex > 0));
}

function recentHighTierEarlyExitCount(session: GameSession, tiers: TournamentTier[]): number {
  const recentHighTierResults: boolean[] = [];
  for (const result of [...session.history].reverse()) {
    const tournamentId = tournamentIdFromEventId(result.eventId ?? '');
    if (!tournamentId) continue;
    const tournament = getTournament(tournamentId);
    if (!tournament || !tiers.includes(tournament.tier)) continue;
    recentHighTierResults.push(!result.success);
    if (recentHighTierResults.length >= 4) break;
  }
  return recentHighTierResults.filter(Boolean).length;
}

export function minimumStageForTeamTier(teamTier: ClubTier): Stage {
  if (teamTier === 'semi-pro') return 'second';
  if (teamTier === 'pro' || teamTier === 'top') return 'pro';
  return 'youth';
}

export function evaluateStagePressure(session: GameSession, player: Player, options: StagePressureOptions = {}): StagePressureEvaluation {
  const resultSeason = options.resultSeason ?? player.year ?? 1;
  const currentSeason = options.stateSeason ?? player.year ?? 1;
  const previousLevel = player.stagePressure?.level ?? 'none';
  const reasons: string[] = [];
  let score = 0;

  if (player.stage === 'pro') {
    const highTierSuccess = hasSeasonDeepResult(session, resultSeason, ['s-open', 's-closed', 's-class', 'major']);
    if (!highTierSuccess) {
      score += 2;
      reasons.push('本赛季没有 S 级或 Major 深度成绩');
    }
  }

  if (player.stage === 'second') {
    const hasADeep = hasSeasonDeepResult(session, resultSeason, ['a']);
    if (!hasADeep) {
      score += 2;
      reasons.push('本赛季没有 A 级深度成绩');
    }
  }

  const fameLine = STAGE_MARKET_FAME[player.stage];
  if (typeof fameLine === 'number' && (player.fame ?? 0) < fameLine) {
    score += 2;
    reasons.push(`名气低于市场线 ${fameLine}`);
  }

  if (!player.team && typeof player.unattachedSinceRound === 'number' && (player.round ?? 0) - player.unattachedSinceRound >= 12) {
    score += 2;
    reasons.push('无队时间已超过 12 周');
  }

  if (player.team) {
    const minStage = minimumStageForTeamTier(player.team.tier);
    const mismatchSinceRound = player.team.lastTierChange?.round ?? player.team.joinedRound ?? 0;
    if (stageRank(player.stage) > stageRank(minStage) && (player.round ?? 0) - mismatchSinceRound >= 16) {
      score += 1;
      reasons.push('战队层级低于个人身份下限且持续过久');
    }
  }

  if (recentHighTierEarlyExitCount(session, ['a', 's-open', 's-closed', 's-class', 'major']) >= 3) {
    score += 1;
    reasons.push('近 4 场高等级赛事早早出局过多');
  }

  if ((player.stress ?? 0) >= 85 || player.tags.includes('pressure-break')) {
    score += 1;
    reasons.push('压力接近崩溃线');
  }

  if ((player.seasonInjuryRestWeeks ?? 0) >= 8) {
    score += 1;
    reasons.push('伤病休养累计达到 8 周');
  }

  if (player.tags.some((tag) => ['banned', 'dirty-money', 'match-fixing', 'cheat'].includes(tag))) {
    score += 3;
    reasons.push('存在禁赛或违规标签');
  }

  const next: StagePressureState = {
    level: 'none',
    season: currentSeason,
    score,
    reasons,
    evaluatedRound: player.round ?? 0,
  };
  if (score >= 6) {
    next.level = previousLevel === 'at_risk' ? 'none' : 'at_risk';
  } else if (score >= 4) {
    next.level = 'at_risk';
  } else if (score >= 3) {
    next.level = 'watch';
  }

  if (score >= 6 && previousLevel === 'at_risk') {
    const demotionOrder: Stage[] = ['pro', 'second', 'youth'];
    const index = demotionOrder.indexOf(player.stage);
    if (index >= 0 && index < demotionOrder.length - 1) {
      const demotedTo = demotionOrder[index + 1]!;
      return {
        pressure: next,
        demoted: true,
        demotionFrom: player.stage,
        demotionTo: demotedTo,
        reason: reasons.join('；'),
      };
    }
  }

  return { pressure: next, demoted: false };
}
