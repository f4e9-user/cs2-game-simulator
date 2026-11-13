import type { ClubApplicationSummary, Player, Stage } from './types';

const STAGE_ORDER: Stage[] = ['rookie', 'youth', 'second', 'pro', 'retired'];

export function clubCanApply(
  player: Pick<Player, 'stage' | 'fame'>,
  club: Pick<ClubApplicationSummary, 'requiredStage' | 'requiredFame'>,
): { eligible: boolean; reason: string | null } {
  // Rookie youth applications are scored by the server; match history and traits
  // affect the response, not whether the player can send a resume.
  const rookieCanApplyToYouth = player.stage === 'rookie' && club.requiredStage === 'youth';
  if (!rookieCanApplyToYouth && STAGE_ORDER.indexOf(player.stage) < STAGE_ORDER.indexOf(club.requiredStage)) {
    return { eligible: false, reason: '阶段未达标' };
  }
  if (club.requiredFame !== undefined && (player.fame ?? 0) < club.requiredFame) {
    return { eligible: false, reason: `名气需达到 ${club.requiredFame}` };
  }
  return { eligible: true, reason: null };
}
