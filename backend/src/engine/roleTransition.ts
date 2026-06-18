import type { Player, RoundResult, RoleTransition } from '../types.js';

export function deriveRolePressure(player: Player, history: RoundResult[]): number {
  let pressure = 0;
  if (player.preferredRole && player.activeRole && player.preferredRole !== player.activeRole) {
    pressure += 20;
  }
  if (player.team && (player.teamTrust ?? 50) < 40) {
    pressure += Math.min(20, 40 - (player.teamTrust ?? 50));
  }
  if (player.activeRole && player.roster?.some((tm) => tm.role === player.activeRole)) {
    pressure += 25;
  }
  if (hasPoorRecentMatch(history)) {
    pressure += 15;
  }
  if (player.roleTransition) {
    pressure += 10;
  }
  return Math.max(0, Math.min(100, pressure));
}

export function canCrystallizeRole(player: Player, history: RoundResult[]): boolean {
  if (!player.activeRole) return false;
  if ((player.activeRoleRounds ?? 0) < 24) return false;
  if (player.roleCrystallized) return true;
  return deriveRolePressure(player, history) <= 30;
}

export function normalizeRoleTransition(transition: RoleTransition | null | undefined): RoleTransition | null {
  if (!transition) return null;
  return {
    ...transition,
    stage: transition.stage ?? 'trial',
    source: transition.source ?? 'team-need',
  };
}

function hasPoorRecentMatch(history: RoundResult[]): boolean {
  const recent = [...history].reverse().slice(0, 5);
  const match = recent.find((entry) => entry.matchStats);
  return (match?.matchStats?.rating ?? 1) < 0.95;
}
