import type { Player, Teammate } from '../types.js';
import { TRAITS } from '../data/traits.js';

export function calcSynergyBonus(player: Player, roster: Teammate[]): number {
  let bonus = 0;

  const playerTags = player.traits
    .map((id) => TRAITS.find((t) => t.id === id)?.tags ?? [])
    .flat();

  const allTraits = new Set(playerTags);
  for (const tm of roster) {
    for (const tag of tm.traits) allTraits.add(tag);
  }

  const hasIGL = roster.some((tm) => tm.role === 'IGL');
  const hasAWPer = roster.some((tm) => tm.role === 'AWPer');

  const traitCounts: Record<string, number> = {};
  for (const tag of allTraits) {
    let count = playerTags.filter((t) => t === tag).length;
    for (const tm of roster) {
      count += tm.traits.filter((t) => t === tag).length;
    }
    traitCounts[tag] = count;
  }

  // ── 正面协同 ──
  if (hasIGL && allTraits.has('tactical')) bonus += 2;
  if (hasAWPer && allTraits.has('aimer')) bonus += 1;
  if ((traitCounts.support ?? 0) >= 2) bonus += 1;
  if (playerTags.includes('igl') && (traitCounts.support ?? 0) >= 1) bonus += 1;

  // ── 负面协同 ──
  // ego tag: reserved for future trait; no current trait carries it
  if ((traitCounts.solo ?? 0) >= 3) bonus -= 1;

  return bonus;
}

export function calcTrustModifier(teamTrust: number): number {
  if (teamTrust >= 65) return 1;
  if (teamTrust <= 15) return -2;
  if (teamTrust <= 30) return -1;
  return 0;
}
