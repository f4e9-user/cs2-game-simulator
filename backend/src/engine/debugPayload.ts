import type { GameSession, Player, RoleDebug, TeamIdentityDebug } from '../types.js';
import { derivePlayerIdentityScores, deriveTeammateIdentityScores, findTeamCaller, findTeamStar } from './teamIdentity.js';
import { canCrystallizeRole, deriveRolePressure, normalizeRoleTransition } from './roleTransition.js';
import { roleFitScore } from '../data/roleProfiles.js';

export function buildTeamIdentityDebug(player: Player): TeamIdentityDebug {
  const roster = player.roster ?? [];
  return {
    player: {
      visibleIdentity: player.visibleTeamIdentity,
      sinceRound: player.teamIdentitySinceRound,
      scores: derivePlayerIdentityScores(player, roster),
    },
    teammates: roster.map((tm) => ({
      id: tm.id,
      name: tm.name,
      visibleIdentity: tm.visibleIdentity,
      sinceRound: tm.identitySinceRound,
      scores: deriveTeammateIdentityScores(tm, roster),
    })),
    caller: findTeamCaller(player, roster),
    star: findTeamStar(player, roster),
  };
}

export function buildRoleDebug(player: Player, history: GameSession['history']): RoleDebug {
  const fitScores = {
    IGL: roleFitScore(player, 'IGL'),
    AWPer: roleFitScore(player, 'AWPer'),
    Entry: roleFitScore(player, 'Entry'),
    Support: roleFitScore(player, 'Support'),
    Lurker: roleFitScore(player, 'Lurker'),
  };
  const pressure = deriveRolePressure(player, history);
  const crystallizeThreshold = 70;
  const crystallizeReady = canCrystallizeRole(player, history);
  return {
    fitScores,
    pressure: Math.max(0, Math.min(100, pressure)),
    crystallizeReady,
    crystallizeThreshold,
    activeRole: player.activeRole,
    preferredRole: player.preferredRole,
    roleTransition: normalizeRoleTransition(player.roleTransition),
    activeRoleRounds: player.activeRoleRounds,
  };
}
