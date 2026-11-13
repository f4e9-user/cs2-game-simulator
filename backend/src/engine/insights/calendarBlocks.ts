import type { GameSession, Player } from '../../types.js';
import { buildYearTournaments, type Tournament } from '../../data/tournaments.js';
import { canSignUpForTournament, tournamentOpportunityStatus } from '../tournamentEligibility.js';
import type { CalendarBlockInsight, OpportunityInsight } from './types.js';

const LOOKAHEAD_WEEKS = 12;
const TIER_LABELS: Record<string, string> = {
  c: 'C 级赛事',
  b: 'B 级赛事',
  a: 'A 级赛事',
  's-qualifier': 'S 级预选',
  's-main': 'S 级正赛',
  's-class': 'S 级赛事',
  major: 'Major',
};

function addWeeks(year: number, week: number, offset: number): { year: number; week: number } {
  let y = year;
  let w = week + offset;
  while (w > 48) {
    w -= 48;
    y += 1;
  }
  return { year: y, week: w };
}

function weekDistance(fromYear: number, fromWeek: number, toYear: number, toWeek: number): number {
  return (toYear - fromYear) * 48 + (toWeek - fromWeek);
}

function shortTournamentName(name: string): string {
  return name
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\b(Open|Closed) Qualifier\b/gi, (match) => match === 'Open Qualifier' ? '公开预选' : '封闭预选')
    .replace(/\s+/g, ' ')
    .trim();
}

function tierTone(tier?: string): CalendarBlockInsight['tone'] {
  if (!tier) return 'neutral';
  if (tier.toLowerCase().includes('major')) return 'major';
  return 'neutral';
}

function tournamentTierLabel(tournament: Tournament): string {
  return TIER_LABELS[tournament.progressionTier] ?? TIER_LABELS[tournament.tier] ?? tournament.tier;
}

function tournamentBlock(
  session: GameSession,
  tournament: Tournament,
  year: number,
  week: number,
  playerPoints: number,
): CalendarBlockInsight {
  const currentYear = session.player.year ?? 1;
  const currentWeek = session.player.week ?? 1;
  const isFutureWeek = year > currentYear || (year === currentYear && week > currentWeek);
  const available = canSignUpForTournament(session.player, tournament, playerPoints, week);
  const actionKind = isFutureWeek ? 'preregister' : 'signup';
  const canSubmitSignup = available && !session.player.pendingMatch;
  const status = available
    ? isFutureWeek ? '可预报名' : canSubmitSignup ? '可报名' : '可报名窗口'
    : tournamentOpportunityStatus(session.player, tournament, playerPoints, week);
  const tier = tournamentTierLabel(tournament);
  return {
    id: `tournament:${tournament.id}:${year}:${week}`,
    year,
    week,
    kind: 'opportunity',
    title: tournament.displayName,
    shortTitle: shortTournamentName(tournament.displayName),
    tier,
    status,
    tone: available ? 'available' : tierTone(tier) === 'major' ? 'major' : 'locked',
    source: 'tournament-calendar',
    tournamentId: tournament.id,
    action: canSubmitSignup && !session.player.pendingMatch ? actionKind : 'none',
    detail: status,
  };
}

function allTournamentBlocks(session: GameSession, playerPoints: number): CalendarBlockInsight[] {
  const currentYear = session.player.year ?? 1;
  const currentWeek = session.player.week ?? 1;
  const blocks: CalendarBlockInsight[] = [];

  for (let offset = 0; offset < LOOKAHEAD_WEEKS; offset += 1) {
    const { year, week } = addWeeks(currentYear, currentWeek, offset);
    const tournaments = buildYearTournaments(year).filter((tournament) => (
      tournament.signupWeeks === 'always' || tournament.signupWeeks.includes(week)
    ));
    for (const tournament of tournaments) {
      blocks.push(tournamentBlock(session, tournament, year, week, playerPoints));
    }
  }

  return blocks;
}

function pendingMatchBlocks(player: Player): CalendarBlockInsight[] {
  const pending = player.pendingMatch;
  if (!pending) return [];

  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const signedUpAtYear = player.tournamentContext?.signedUpAtYear ?? currentYear;
  const signedUpAtWeek = player.tournamentContext?.signedUpAtWeek ?? currentWeek;
  const startOffset = Math.max(0, weekDistance(currentYear, currentWeek, signedUpAtYear, signedUpAtWeek));
  const endOffset = Math.min(
    LOOKAHEAD_WEEKS - 1,
    Math.max(0, weekDistance(currentYear, currentWeek, pending.resolveYear, pending.resolveWeek)),
  );
  const title = pending.displayName ?? pending.name;
  const blocks: CalendarBlockInsight[] = [];

  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    const { year, week } = addWeeks(currentYear, currentWeek, offset);
    const isSignupWeek = year === signedUpAtYear && week === signedUpAtWeek;
    const isMatchWeek = year === pending.resolveYear && week === pending.resolveWeek;
    const weeksUntilMatch = weekDistance(year, week, pending.resolveYear, pending.resolveWeek);
    blocks.push({
      id: `pending:${pending.tournamentId}:${year}:${week}`,
      year,
      week,
      kind: isMatchWeek ? 'match' : 'commitment',
      title,
      shortTitle: shortTournamentName(title),
      tier: pending.progressionTier ?? pending.tier,
      status: isMatchWeek
        ? '比赛周'
        : isSignupWeek
          ? '已报名'
          : weeksUntilMatch === 1
            ? '备赛周'
            : '等待比赛',
      tone: isMatchWeek ? 'active' : 'warning',
      source: weeksUntilMatch === 1 || isSignupWeek || isMatchWeek ? 'tournament-context' : 'pending-match',
      tournamentId: pending.tournamentId,
      action: isSignupWeek ? 'withdraw' : 'none',
      detail: `阶段 ${pending.stageIndex + 1}`,
    });
  }

  return blocks;
}

export function buildCalendarBlocks(
  session: GameSession,
  _opportunities: OpportunityInsight[],
  playerPoints = 0,
): CalendarBlockInsight[] {
  const currentYear = session.player.year ?? 1;
  const currentWeek = session.player.week ?? 1;
  const pendingBlocks = pendingMatchBlocks(session.player);
  const pendingTournamentId = session.player.pendingMatch?.tournamentId ?? null;
  const tournamentBlocks = allTournamentBlocks(session, playerPoints)
    .filter((block) => !pendingTournamentId || block.tournamentId !== pendingTournamentId);
  const occupiedKeys = new Set([...pendingBlocks, ...tournamentBlocks].map((block) => `${block.year}:${block.week}`));
  const emptyBlocks: CalendarBlockInsight[] = Array.from({ length: LOOKAHEAD_WEEKS }, (_, offset) => {
    const { year, week } = addWeeks(currentYear, currentWeek, offset);
    return {
      id: `empty:${year}:${week}`,
      year,
      week,
      kind: 'empty',
      title: '空档',
      shortTitle: '空档',
      status: '空档',
      tone: 'neutral',
      source: 'system',
      action: 'none',
    } satisfies CalendarBlockInsight;
  }).filter((block) => !occupiedKeys.has(`${block.year}:${block.week}`));
  const blocks = [...pendingBlocks, ...tournamentBlocks, ...emptyBlocks]
    .filter((block) => {
      const distance = weekDistance(currentYear, currentWeek, block.year, block.week);
      return distance >= 0 && distance < LOOKAHEAD_WEEKS;
    })
    .sort((a, b) => (
      weekDistance(currentYear, currentWeek, a.year, a.week) -
      weekDistance(currentYear, currentWeek, b.year, b.week) ||
      a.title.localeCompare(b.title)
    ));

  return blocks;
}
