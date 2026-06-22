import type { Player, PlayerTeam, ClubTier } from '../types.js';
import type { Tournament } from '../data/tournaments.js';
import {
  qualificationFallbackSlots,
  qualificationSlotLabel,
  qualificationSlotOwner,
} from './qualification.js';

export function playerTeamMeetsRequirement(playerTeam: PlayerTeam | null, required: ClubTier | null): boolean {
  if (!required) return true;
  if (!playerTeam) return false;
  const tierOrder: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
  return tierOrder.indexOf(playerTeam.tier) >= tierOrder.indexOf(required);
}

export function tournamentDirectEntryBypassApplies(
  playerTeam: PlayerTeam | null,
  tournament: Tournament,
  playerPoints: number,
): boolean {
  const bypass = tournament.directEntryBypass;
  if (!bypass || !playerTeam) return false;
  const tierOrder: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
  if (bypass.minTeamTier && tierOrder.indexOf(playerTeam.tier) < tierOrder.indexOf(bypass.minTeamTier)) {
    return false;
  }
  if (bypass.minVrsScore !== undefined && playerPoints < bypass.minVrsScore) {
    return false;
  }
  return true;
}

function hasUsableQualificationSlot(player: Player, tournament: Tournament): boolean {
  if (!tournament.qualificationTargets?.length) return true;
  return tournament.qualificationTargets
    .flatMap((slot) => qualificationFallbackSlots(slot))
    .some((slot) => {
      const owner = qualificationSlotOwner(slot);
      if (owner === 'team' && player.team?.teamStatus !== 'starter') return false;
      const pool = owner === 'team'
        ? (player.teamQualificationSlots ?? {})
        : (player.qualificationSlots ?? {});
      return (pool[slot] ?? 0) > 0;
    });
}

export function canSignUpForTournament(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
  week = player.week ?? 1,
): boolean {
  if (!tournament.stages.includes(player.stage)) return false;
  if (tournament.fameRequired !== undefined && (player.fame ?? 0) < tournament.fameRequired) return false;
  if (tournament.pointsRequired !== undefined && playerPoints < tournament.pointsRequired) return false;
  if (tournament.signupWeeks !== 'always' && !tournament.signupWeeks.includes(week)) return false;
  const teamReq = tournament.teamRequirement ?? null;
  if (!playerTeamMeetsRequirement(player.team, teamReq)) {
    if (!player.team) return false;
    if (tournamentDirectEntryBypassApplies(player.team, tournament, playerPoints)) {
      return true;
    }
    if (!tournament.qualificationTargets?.length) return false;
    return hasUsableQualificationSlot(player, tournament);
  }
  if (tournamentDirectEntryBypassApplies(player.team, tournament, playerPoints)) {
    return true;
  }
  if (!hasUsableQualificationSlot(player, tournament)) return false;
  return true;
}

export function canSeeTournamentOpportunity(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
): boolean {
  const week = tournament.signupWeeks === 'always'
    ? (player.week ?? 1)
    : tournament.signupWeeks.find((candidate) => candidate >= (player.week ?? 1));
  if (week === undefined) return false;
  return canSignUpForTournament(player, tournament, playerPoints, week);
}

export function tournamentOpportunityStatus(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
  week = tournament.signupWeeks === 'always'
    ? (player.week ?? 1)
    : tournament.signupWeeks.find((candidate) => candidate >= (player.week ?? 1)) ?? (player.week ?? 1),
): string {
  if (!tournament.stages.includes(player.stage)) return '阶段不符';
  if (tournament.fameRequired !== undefined && (player.fame ?? 0) < tournament.fameRequired) {
    return `名气不足 ${player.fame ?? 0}/${tournament.fameRequired}`;
  }
  if (tournament.pointsRequired !== undefined && playerPoints < tournament.pointsRequired) {
    return `VRS 不足 ${playerPoints}/${tournament.pointsRequired}`;
  }
  if (tournament.signupWeeks !== 'always' && !tournament.signupWeeks.includes(week)) {
    return '未到报名周';
  }
  const teamReq = tournament.teamRequirement ?? null;
  const teamOk = playerTeamMeetsRequirement(player.team, teamReq);
  if (!teamOk && !player.team) return '需要战队';
  if (!teamOk && !tournament.qualificationTargets?.length) return '战队不足';
  if (!teamOk && tournamentDirectEntryBypassApplies(player.team, tournament, playerPoints)) {
    return '排名直通';
  }
  if (!teamOk && !hasUsableQualificationSlot(player, tournament)) {
    const missing = tournament.qualificationTargets?.[0];
    if (!missing) return '缺资格';
    const owner = qualificationSlotOwner(missing);
    if (owner === 'team' && player.team?.teamStatus !== 'starter') return '需首发资格';
    return `缺${qualificationSlotLabel(missing)}`;
  }
  if (teamOk && !hasUsableQualificationSlot(player, tournament)) {
    const missing = tournament.qualificationTargets?.[0];
    return missing ? `缺${qualificationSlotLabel(missing)}` : '缺资格';
  }
  return '可报名';
}
