import type { ChoiceDef, Player } from '../types.js';
import { applyMoneyTransaction } from './money.js';
import { processLoanRepayment } from './loan.js';
import { processLivingEconomy } from './housing.js';

export function processRecoverySystems(
  player: Player,
  eventId: string,
  effects?: string[],
  choiceDef?: ChoiceDef,
  options?: { processLivingEconomy?: boolean },
): void {
  if (options?.processLivingEconomy) {
    processLivingEconomy(player, effects);
  }
  processLoanRepayment(player, effects);

  const isTeamBailout = eventId.startsWith('bailout-team-');
  const isFamilyBailout = !isTeamBailout && eventId.startsWith('bailout-');
  const isRefusal = choiceDef?.isRefusal ?? false;

  if (isTeamBailout) {
    player.teamBailoutCooldown = isRefusal ? 5 : 24;
    if (!isRefusal) player.consecutiveBrokeRounds = 0;
  } else if (isFamilyBailout) {
    player.bailoutCooldown = isRefusal ? 5 : 24;
    if (!isRefusal) {
      player.consecutiveBrokeRounds = 0;
      if (eventId === 'bailout-old-friend') {
        player.creditScore = Math.max(0, (player.creditScore ?? 100) - 5);
      } else {
        player.familyBailoutCount = (player.familyBailoutCount ?? 0) + 1;
      }
    }
  }

  if (!isFamilyBailout && (player.bailoutCooldown ?? 0) > 0) {
    player.bailoutCooldown -= 1;
  }

  if (!isTeamBailout && (player.teamBailoutCooldown ?? 0) > 0) {
    player.teamBailoutCooldown -= 1;
  }

  if (player.pendingFamilyCrisis && player.round >= player.pendingFamilyCrisis.deadlineRound) {
    const crisis = player.pendingFamilyCrisis;
    if (player.stats.money >= crisis.amountNeeded) {
      applyMoneyTransaction(player, -crisis.amountNeeded);
      player.pendingFamilyCrisis = undefined;
      player.creditScore = Math.min(100, (player.creditScore ?? 100) + 10);
      if (!player.tagExpiry) player.tagExpiry = {};
      player.tagExpiry['family-crisis-cd'] = Number.MAX_SAFE_INTEGER;
      effects?.push(`家人手术费到位 -${crisis.amountNeeded}K（危机解除，信用值+10）`);
    }
  }
}
