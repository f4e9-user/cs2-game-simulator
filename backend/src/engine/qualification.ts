import type { Player, QualificationExpiry, QualificationSlotBatch } from '../types.js';

const QUALIFICATION_TTL_WEEKS = 48;

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
    case 'b-seed':  return 'B级种子资格';
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
  if (slot === 'b-seed') return [slot];
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

function compareExpiry(a: QualificationExpiry, b: QualificationExpiry): number {
  return a.year - b.year || a.week - b.week;
}

function addWeeks(year: number, week: number, weeks: number): QualificationExpiry {
  const zeroBased = (year - 1) * 48 + (week - 1) + weeks;
  return {
    year: Math.floor(zeroBased / 48) + 1,
    week: (zeroBased % 48) + 1,
  };
}

export function defaultQualificationExpiry(year: number, week: number): QualificationExpiry {
  return addWeeks(year, week, QUALIFICATION_TTL_WEEKS);
}

function summarizeBatches(batches: QualificationSlotBatch[]): Record<string, number> {
  return batches.reduce<Record<string, number>>((acc, batch) => {
    if (batch.count > 0) acc[batch.slot] = (acc[batch.slot] ?? 0) + batch.count;
    return acc;
  }, {});
}

export function normalizeQualificationBatches(
  slots: Record<string, number>,
  batches: QualificationSlotBatch[] | undefined,
  fallbackExpiry: QualificationExpiry,
): { slots: Record<string, number>; batches: QualificationSlotBatch[] } {
  const sourceBatches = batches && batches.length > 0
    ? batches
    : Object.entries(slots)
      .filter(([, count]) => count > 0)
      .map(([slot, count]) => ({ slot, count, expiresAt: fallbackExpiry }));
  const normalized = sourceBatches
    .filter((batch) => batch.count > 0)
    .sort((a, b) => compareExpiry(a.expiresAt, b.expiresAt) || a.slot.localeCompare(b.slot));
  return {
    slots: summarizeBatches(normalized),
    batches: normalized,
  };
}

export function expireQualificationBatches(
  batches: QualificationSlotBatch[],
  current: QualificationExpiry,
): { slots: Record<string, number>; batches: QualificationSlotBatch[]; expiredCount: number } {
  let expiredCount = 0;
  const active = batches.filter((batch) => {
    const expired = compareExpiry(batch.expiresAt, current) <= 0;
    if (expired) expiredCount += batch.count;
    return !expired;
  });
  return {
    slots: summarizeBatches(active),
    batches: active,
    expiredCount,
  };
}

export function addQualificationRewardsByOwnerWithExpiry(
  playerSlots: Record<string, number>,
  teamSlots: Record<string, number>,
  playerBatches: QualificationSlotBatch[] | undefined,
  teamBatches: QualificationSlotBatch[] | undefined,
  rewards: { slot: string; count: number }[],
  expiresAt: QualificationExpiry,
): {
  playerSlots: Record<string, number>;
  teamSlots: Record<string, number>;
  playerBatches: QualificationSlotBatch[];
  teamBatches: QualificationSlotBatch[];
} {
  const nextPlayerBatches = [...(playerBatches ?? [])];
  const nextTeamBatches = [...(teamBatches ?? [])];
  for (const reward of rewards) {
    const batch = { slot: reward.slot, count: reward.count, expiresAt };
    if (qualificationSlotOwner(reward.slot) === 'team') {
      nextTeamBatches.push(batch);
    } else {
      nextPlayerBatches.push(batch);
    }
  }
  return {
    playerSlots: summarizeBatches(nextPlayerBatches),
    teamSlots: summarizeBatches(nextTeamBatches),
    playerBatches: nextPlayerBatches,
    teamBatches: nextTeamBatches,
  };
}

export function consumeQualificationSlot(
  slots: Record<string, number>,
  batches: QualificationSlotBatch[] | undefined,
  slot: string,
  fallbackExpiry: QualificationExpiry,
): { slots: Record<string, number>; batches: QualificationSlotBatch[]; consumedExpiry?: QualificationExpiry } {
  const normalized = normalizeQualificationBatches(slots, batches, fallbackExpiry);
  const nextBatches = [...normalized.batches];
  const idx = nextBatches.findIndex((batch) => batch.slot === slot && batch.count > 0);
  if (idx < 0) return { ...normalized, consumedExpiry: undefined };
  const batch = nextBatches[idx]!;
  const consumedExpiry = batch.expiresAt;
  if (batch.count <= 1) {
    nextBatches.splice(idx, 1);
  } else {
    nextBatches[idx] = { ...batch, count: batch.count - 1 };
  }
  return {
    slots: summarizeBatches(nextBatches),
    batches: nextBatches,
    consumedExpiry,
  };
}

export function refundQualificationSlot(
  slots: Record<string, number>,
  batches: QualificationSlotBatch[] | undefined,
  slot: string,
  expiresAt: QualificationExpiry,
): { slots: Record<string, number>; batches: QualificationSlotBatch[] } {
  const normalized = normalizeQualificationBatches(slots, batches, expiresAt);
  const nextBatches = [...normalized.batches, { slot, count: 1, expiresAt }];
  return {
    slots: summarizeBatches(nextBatches),
    batches: nextBatches,
  };
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
    teamQualificationSlotBatches: [],
    pendingMatch:
      player.pendingMatch?.qualificationSlotOwner === 'team'
        ? null
        : player.pendingMatch,
  };
}
