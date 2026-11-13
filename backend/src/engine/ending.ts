import type { Player } from '../types.js';
import {
  LEGEND_FAME_THRESHOLD,
  MAX_ROUNDS,
  STRESS_GRACE_ROUNDS,
} from './constants.js';

function hasGrandSlam(player: Player): boolean {
  const series = player.championshipSeries ?? {};
  return (series.pgl ?? 0) > 0 && (series.blast ?? 0) > 0 && (series.major ?? 0) > 0;
}

export function checkEnding(player: Player, endRun: boolean, endReason?: string): string | undefined {
  if (endRun) return endReason ?? 'career_ended';
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
    if (!player.everHadTeam && (player.fame ?? 0) >= 70 &&
        player.tags.includes('tournament-winner') &&
        isSemiProPlus) {
      return 'free-agent-legend';
    }
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
