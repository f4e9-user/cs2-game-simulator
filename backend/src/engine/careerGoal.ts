import type { Player, Stage } from '../types.js';
import { buildYearTournaments, type Tournament } from '../data/tournaments.js';
import { getTrait } from '../data/traits.js';
import { getClubProfile } from '../data/clubProfiles.js';
import { getGate } from './stages.js';
import { canSeeTournamentOpportunity, tournamentOpportunityStatus, tournamentQualificationStageWaiverApplies } from './tournamentEligibility.js';

export interface CareerGoalProgress {
  id: string;
  label: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface CareerGoalOpportunity {
  tournamentId: string;
  week: number;
  name: string;
  tier: string;
  available: boolean;
  status: string;
}

export interface CareerGoal {
  stage: Stage;
  stageLabel: string;
  summary: string;
  teamHint?: string;
  nextStageLabel?: string;
  goals: CareerGoalProgress[];
  opportunities: CareerGoalOpportunity[];
}

const STAGE_LABELS: Record<Stage, string> = {
  rookie: '路人新人',
  youth: '青训',
  second: '二线',
  pro: '职业',
  retired: '退役',
};

const TIER_LABELS: Record<string, string> = {
  c: 'C 级赛事',
  b: 'B 级赛事',
  a: 'A 级赛事',
  's-qualifier': 'S 级预选',
  's-main': 'S 级正赛',
  's-class': 'S 级赛事',
  major: 'Major',
};
const OPPORTUNITY_LOOKAHEAD_WEEKS = 12;

function sumTiers(record: Record<string, number>, tiers: string[]): number {
  return tiers.reduce((sum, tier) => sum + (record[tier] ?? 0), 0);
}

function tierLabel(tiers: string[]): string {
  return tiers.map((tier) => TIER_LABELS[tier] ?? tier).join('、');
}

function isUpcomingTournament(player: Player, tournament: Tournament): boolean {
  if (!tournament.stages.includes(player.stage)) {
    return tournamentQualificationStageWaiverApplies(player, tournament, 0);
  }
  if (tournament.signupWeeks === 'always') return true;
  const currentWeek = player.week ?? 1;
  return tournament.signupWeeks.some((week) => (
    week >= currentWeek && week <= currentWeek + OPPORTUNITY_LOOKAHEAD_WEEKS
  ));
}

function tournamentWeek(tournament: Tournament, currentWeek: number): number {
  if (tournament.signupWeeks === 'always') return currentWeek;
  return tournament.signupWeeks.find((week) => week >= currentWeek) ?? tournament.signupWeeks[0] ?? currentWeek;
}

function upcomingOpportunities(
  player: Player,
  playerPoints: number,
  predicate: (tournament: Tournament) => boolean,
): CareerGoalOpportunity[] {
  return buildYearTournaments(player.year)
    .filter((tournament) => isUpcomingTournament(player, tournament))
    .filter(predicate)
    .map((tournament) => ({
      tournamentId: tournament.id,
      week: tournamentWeek(tournament, player.week),
      name: tournament.displayName,
      tier: TIER_LABELS[tournament.progressionTier] ?? TIER_LABELS[tournament.tier] ?? tournament.tier,
      available: canSeeTournamentOpportunity(player, tournament, playerPoints),
      status: tournamentOpportunityStatus(player, tournament, playerPoints),
    }))
    .sort((a, b) => a.week - b.week || a.name.localeCompare(b.name))
}

function progress(id: string, label: string, current: number, target: number): CareerGoalProgress {
  const normalizedCurrent = Math.max(0, current);
  return {
    id,
    label,
    current: normalizedCurrent,
    target,
    completed: normalizedCurrent >= target,
  };
}

function teamHint(player: Player): string | undefined {
  if (!player.team) return undefined;
  const profile = getClubProfile(player.team.clubId, player.team.tier);
  const status = player.team.teamStatus === 'trial'
    ? '试训期，先争取稳定出场'
    : player.team.teamStatus === 'rotation'
      ? '轮换位，适合用表现争取首发'
      : '首发定位，适合围绕当前赛事目标推进';
  const styleHint: Record<string, string> = {
    tactical: '这支队伍更适合：战术体系晋级',
    firepower: '这支队伍更适合：公开赛冲成绩',
    development: '这支队伍更适合：稳定积累比赛经验',
    chaotic: '这支队伍更适合：用个人表现打开机会',
    balanced: '这支队伍更适合：均衡推进职业目标',
  };
  return `${styleHint[profile.rosterStyle] ?? styleHint.balanced}。${status}。`;
}

export function buildCareerGoal(player: Player, playerPoints = 0): CareerGoal {
  const hint = teamHint(player);
  if (player.stage === 'retired') {
    return {
      stage: player.stage,
      stageLabel: STAGE_LABELS[player.stage],
      summary: '职业生涯已经结束。',
      teamHint: hint,
      goals: [],
      opportunities: [],
    };
  }

  if (player.stage === 'rookie') {
    const rookieParticipations = sumTiers(player.tierParticipations ?? {}, ['c', 'b']);
    const bParticipations = sumTiers(player.tierParticipations ?? {}, ['b']);
    const rookieChampionships = sumTiers(player.tierChampionships ?? {}, ['c', 'b']);
    const traitTags = player.traits.flatMap((traitId) => getTrait(traitId)?.tags ?? []);
    const hasTalentPath = traitTags.includes('aimer');
    const readyForYouthApplication = player.team?.tier === 'youth'
      || hasTalentPath
      || (rookieParticipations >= 3 && bParticipations >= 1 && rookieChampionships >= 1);

    return {
      stage: player.stage,
      stageLabel: STAGE_LABELS[player.stage],
      summary: '证明自己，申请青训战队。',
      teamHint: hint,
      nextStageLabel: STAGE_LABELS.youth,
      goals: [
        progress('rookie-participations', 'C/B 级赛事参赛', rookieParticipations, 3),
        progress('b-participations', 'B 级赛事参赛', bParticipations, 1),
        progress('rookie-championships', 'C/B 级赛事冠军', rookieChampionships, 1),
        progress('youth-application', '青训申请资格', readyForYouthApplication ? 1 : 0, 1),
      ],
      opportunities: upcomingOpportunities(
        player,
        playerPoints,
        (tournament) => ['c', 'b'].includes(tournament.progressionTier),
      ),
    };
  }

  const gate = getGate(player.stage);
  if (gate) {
    const participations = sumTiers(player.tierParticipations ?? {}, gate.tiers);
    const championships = sumTiers(player.tierChampionships ?? {}, gate.champTiers);
    return {
      stage: player.stage,
      stageLabel: STAGE_LABELS[player.stage],
      summary: `${tierLabel(gate.tiers)}参赛和夺冠，晋级${STAGE_LABELS[gate.to]}。`,
      teamHint: hint,
      nextStageLabel: STAGE_LABELS[gate.to],
      goals: [
        progress(`${gate.tiers.join('-')}-participations`, `${tierLabel(gate.tiers)}参赛`, participations, gate.minParticipations),
        progress(`${gate.champTiers.join('-')}-championships`, `${tierLabel(gate.champTiers)}冠军`, championships, gate.minChampionships),
      ],
      opportunities: upcomingOpportunities(
        player,
        playerPoints,
        (tournament) => gate.tiers.includes(tournament.progressionTier),
      ),
    };
  }

  const sClassParticipations = sumTiers(player.tierParticipations ?? {}, ['s-qualifier', 's-main', 'major']);
  const sClassChampionships = sumTiers(player.tierChampionships ?? {}, ['s-main', 'major']);
  return {
    stage: player.stage,
    stageLabel: STAGE_LABELS[player.stage],
    summary: '冲击 S 级赛事、Major、名气和传奇结局。',
    teamHint: hint,
    goals: [
      progress('s-participations', 'S 级与 Major 参赛', sClassParticipations, 4),
      progress('s-championships', 'S 级或 Major 冠军', sClassChampionships, 1),
      progress('fame', '名气', player.fame ?? 0, 60),
    ],
    opportunities: upcomingOpportunities(
      player,
      playerPoints,
      (tournament) => ['s-qualifier', 's-main', 'major'].includes(tournament.progressionTier),
    ),
  };
}
