import type { Player, Teammate } from '../types.js';
import { TRAITS } from '../data/traits.js';

export interface SynergyFactor {
  id: string;
  label: string;
  value: number;
}

function playerTraitTags(player: Player): string[] {
  return player.traits
    .map((id) => TRAITS.find((t) => t.id === id)?.tags ?? [])
    .flat();
}

export function explainSynergy(player: Player, roster: Teammate[]): { bonus: number; factors: SynergyFactor[] } {
  let bonus = 0;
  const factors: SynergyFactor[] = [];

  const playerTags = playerTraitTags(player);

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
  if (hasIGL && allTraits.has('tactical')) {
    bonus += 2;
    factors.push({ id: 'igl-tactical', label: 'IGL + 战术特质', value: 2 });
  }
  if (hasAWPer && allTraits.has('aimer')) {
    bonus += 1;
    factors.push({ id: 'awper-aimer', label: 'AWP 位 + 火力特质', value: 1 });
  }
  if ((traitCounts.support ?? 0) >= 2) {
    bonus += 1;
    factors.push({ id: 'support-stack', label: '多名支援型特质', value: 1 });
  }
  if (playerTags.includes('igl') && (traitCounts.support ?? 0) >= 1) {
    bonus += 1;
    factors.push({ id: 'player-igl-support', label: '玩家指挥与支援配合', value: 1 });
  }

  // ── 负面协同 ──
  if ((traitCounts.ego ?? 0) >= 2) {
    bonus -= 2;
    factors.push({ id: 'ego-clash', label: '多个 ego 特质冲突', value: -2 });
  }
  if ((traitCounts.solo ?? 0) >= 3) {
    bonus -= 1;
    factors.push({ id: 'solo-stack', label: '单打倾向过多', value: -1 });
  }

  return { bonus, factors };
}

export function calcSynergyBonus(player: Player, roster: Teammate[]): number {
  return explainSynergy(player, roster).bonus;
}

export function deriveTeamChemistry(roster: Teammate[], teamTrust: number): number {
  if (roster.length === 0) return 0;
  const avgTeammateChemistry =
    roster.reduce((sum, tm) => sum + (tm.chemistry ?? 50), 0) / roster.length;
  const weighted = avgTeammateChemistry * 0.75 + teamTrust * 0.25;
  const trustPenalty = teamTrust < 25 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(weighted - trustPenalty)));
}

export function calcTeamChemistryModifier(teamChemistry: number): number {
  if (teamChemistry >= 70) return 1;
  if (teamChemistry <= 25) return -1;
  return 0;
}
