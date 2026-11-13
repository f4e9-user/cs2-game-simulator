import type { Player, PlayerTeam, ClubTier } from '../types.js';
import type { Tournament } from '../data/tournaments.js';
import {
  qualificationFallbackSlots,
  qualificationSlotLabel,
  qualificationSlotOwner,
} from './qualification.js';

const WEEKS_PER_YEAR = 48;

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

export function tournamentQualificationStageWaiverApplies(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
): boolean {
  if (!tournament.qualificationTargets?.length) return false;
  if (tournamentDirectEntryBypassApplies(player.team, tournament, playerPoints)) return true;
  return hasUsableQualificationSlot(player, tournament);
}

function tournamentQualificationTierWaiverApplies(
  player: Player,
  tournament: Tournament,
): boolean {
  const teamTier = player.team?.tier;
  if (!teamTier) return false;
  if (tournament.progressionTier === 'b') {
    return teamTier === 'semi-pro' || teamTier === 'pro' || teamTier === 'top';
  }
  if (tournament.progressionTier === 'a') {
    return teamTier === 'pro' || teamTier === 'top';
  }
  return false;
}

function parseTournamentYear(tournament: Tournament): number {
  const match = /^y(\d+)-/.exec(tournament.id);
  return match ? Number(match[1]) : 1;
}

function calendarIndex(year: number, week: number): number {
  return year * WEEKS_PER_YEAR + week;
}

export function tournamentRequiresQualificationSlot(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
): boolean {
  if (!tournament.qualificationTargets?.length) return false;
  if (tournamentDirectEntryBypassApplies(player.team, tournament, playerPoints)) return false;
  if (tournamentQualificationTierWaiverApplies(player, tournament)) return false;
  return true;
}

export function canSignUpForTournament(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
  week = player.week ?? 1,
): boolean {
  const stageOk = tournament.stages.includes(player.stage);
  const stageWaived = tournamentQualificationStageWaiverApplies(player, tournament, playerPoints);
  if (!stageOk && !stageWaived) return false;
  if (tournament.fameRequired !== undefined && (player.fame ?? 0) < tournament.fameRequired) return false;
  if (tournament.pointsRequired !== undefined && playerPoints < tournament.pointsRequired) return false;
  if (tournament.signupWeeks !== 'always' && !tournament.signupWeeks.includes(week)) return false;
  const teamReq = tournament.teamRequirement ?? null;
  const requiresQualificationSlot = tournamentRequiresQualificationSlot(player, tournament, playerPoints);
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
  if (requiresQualificationSlot && !hasUsableQualificationSlot(player, tournament)) return false;
  return true;
}

export function resolveTournamentSignupWeek(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
  currentWeek = player.week ?? 1,
  lookaheadWeeks = 12,
): number | null {
  if (tournament.signupWeeks === 'always') {
    return currentWeek;
  }

  const currentYear = player.year ?? 1;
  const currentIndex = calendarIndex(currentYear, currentWeek);
  const tournamentYear = parseTournamentYear(tournament);
  const signupDates = tournament.signupWeeks.map((week) => ({
    year: tournamentYear,
    week,
  }));

  const candidate = signupDates
    .filter(({ year, week }) => {
      const index = calendarIndex(year, week);
      return index >= currentIndex && index <= currentIndex + lookaheadWeeks;
    })
    .sort((a, b) => calendarIndex(a.year, a.week) - calendarIndex(b.year, b.week))[0];

  if (!candidate) return null;
  return canSignUpForTournament(player, tournament, playerPoints, candidate.week) ? candidate.week : null;
}

export function canSeeTournamentOpportunity(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
): boolean {
  const week = resolveTournamentSignupWeek(player, tournament, playerPoints);
  return week !== null;
}

export function tournamentOpportunityStatus(
  player: Player,
  tournament: Tournament,
  playerPoints: number,
  week = resolveTournamentSignupWeek(player, tournament, playerPoints) ?? (player.week ?? 1),
): string {
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const currentIndex = calendarIndex(currentYear, currentWeek);
  const weekIndex = calendarIndex(parseTournamentYear(tournament), week);
  const isFutureWeek = weekIndex > currentIndex;
  const stageOk = tournament.stages.includes(player.stage);
  const stageWaived = tournamentQualificationStageWaiverApplies(player, tournament, playerPoints);
  if (!stageOk && !stageWaived) return '阶段不符';
  if (tournament.fameRequired !== undefined && (player.fame ?? 0) < tournament.fameRequired) {
    return `名气不足 ${player.fame ?? 0}/${tournament.fameRequired}`;
  }
  if (tournament.pointsRequired !== undefined && playerPoints < tournament.pointsRequired) {
    return `VRS 不足 ${playerPoints}/${tournament.pointsRequired}`;
  }
  if (tournament.signupWeeks !== 'always' && !tournament.signupWeeks.includes(week)) {
    return isFutureWeek ? '未到预报名周' : '未到报名周';
  }
  const teamReq = tournament.teamRequirement ?? null;
  const teamOk = playerTeamMeetsRequirement(player.team, teamReq);
  const requiresQualificationSlot = tournamentRequiresQualificationSlot(player, tournament, playerPoints);
  if (!teamOk && !player.team) return '需要战队';
  if (!teamOk && !tournament.qualificationTargets?.length) return '战队不足';
  if (!teamOk && tournamentDirectEntryBypassApplies(player.team, tournament, playerPoints)) {
    return '排名直通';
  }
  if (requiresQualificationSlot && !hasUsableQualificationSlot(player, tournament)) {
    const missing = tournament.qualificationTargets?.[0];
    if (!missing) return '缺资格';
    const owner = qualificationSlotOwner(missing);
    if (owner === 'team' && player.team?.teamStatus !== 'starter') return '需首发资格';
    return `缺${qualificationSlotLabel(missing)}`;
  }
  return isFutureWeek ? '可预报名' : '可报名';
}
