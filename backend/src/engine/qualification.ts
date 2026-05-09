import type { Player } from '../types.js';

export function qualificationSlotLabel(slot: string): string {
  const match = /^(iem|blast|pgl)-(open|closed|main)$/.exec(slot);
  if (match) {
    const brand = match[1]!.toUpperCase();
    const phase =
      match[2]! === 'open'
        ? '公开预选门票'
        : match[2]! === 'closed'
          ? '封闭预选门票'
          : '正赛资格';
    return `${brand}${phase}`;
  }
  switch (slot) {
    case 'a-open':  return 'A级公开预选门票';
    case 'a-main':  return 'A级正赛资格';
    case 's-open':  return 'S公开预选门票';
    case 's-closed': return 'S封闭预选门票';
    case 's-main':  return 'S正赛资格';
    default:        return slot;
  }
}

export function qualificationSlotOwner(slot: string): 'player' | 'team' {
  if (slot === 'a-main' || slot === 's-main') return 'team';
  if (slot.endsWith('-main')) return 'team';
  return 'player';
}

// Brand-specific slots (e.g. iem-open) also accept the generic equivalent (s-open).
// This lets a player use a generic S-class ticket for any brand's open qualifier.
// Precedence: brand-specific first, then generic fallback.
export function qualificationFallbackSlots(slot: string): string[] {
  if (slot === 'a-open' || slot === 'a-main') return [slot];
  const match = /^(iem|blast|pgl)-(open|closed|main)$/.exec(slot);
  if (!match) return [slot];
  return [slot, `s-${match[2]}`];
}

export function formatQualificationRewards(
  rewards: { slot: string; count: number }[],
): string {
  return rewards
    .map((r) => `${qualificationSlotLabel(r.slot)} x${r.count}`)
    .join('、');
}

export function addQualificationRewardsByOwner(
  playerSlots: Record<string, number>,
  teamSlots: Record<string, number>,
  rewards: { slot: string; count: number }[],
): { playerSlots: Record<string, number>; teamSlots: Record<string, number> } {
  const nextPlayerSlots = { ...playerSlots };
  const nextTeamSlots = { ...teamSlots };
  for (const reward of rewards) {
    if (qualificationSlotOwner(reward.slot) === 'team') {
      nextTeamSlots[reward.slot] = (nextTeamSlots[reward.slot] ?? 0) + reward.count;
    } else {
      nextPlayerSlots[reward.slot] = (nextPlayerSlots[reward.slot] ?? 0) + reward.count;
    }
  }
  return { playerSlots: nextPlayerSlots, teamSlots: nextTeamSlots };
}

/**
 * Clear team-owned qualification slots from a player.
 * If `qualificationChanges` is provided, loss messages are appended to it.
 */
export function clearTeamQualifications(
  player: Player,
  qualificationChanges?: string[],
): Player {
  const total = Object.values(player.teamQualificationSlots ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (qualificationChanges) {
    if (total > 0)
      qualificationChanges.push(`离开战队：失去 ${total} 张战队资格门票`);
    if (player.pendingMatch?.qualificationSlotOwner === 'team') {
      qualificationChanges.push(
        `离开战队：失去 ${player.pendingMatch.displayName ?? player.pendingMatch.name} 的参赛资格`,
      );
    }
  }
  return {
    ...player,
    teamQualificationSlots: {},
    pendingMatch:
      player.pendingMatch?.qualificationSlotOwner === 'team'
        ? null
        : player.pendingMatch,
  };
}
