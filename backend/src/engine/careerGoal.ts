import type { Player, Stage } from '../types.js';
import { buildYearTournaments, type Tournament } from '../data/tournaments.js';
import { getGate } from './stages.js';

export interface CareerGoalProgress {
  id: string;
  label: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface CareerGoalOpportunity {
  week: number;
  name: string;
  tier: string;
}

export interface CareerGoal {
  stage: Stage;
  stageLabel: string;
  summary: string;
  nextStageLabel?: string;
  goals: CareerGoalProgress[];
  opportunities: CareerGoalOpportunity[];
}

const STAGE_LABELS: Record<Stage, string> = {
  rookie: '路人新人',
  youth: '青训',
  second: '二线队',
  pro: '职业队',
  retired: '退役',
};

const TIER_LABELS: Record<string, string> = {
  b: 'B 级赛事',
  a: 'A 级赛事',
  's-qualifier': 'S 级预选',
  's-main': 'S 级正赛',
  's-class': 'S 级赛事',
  major: 'Major',
};

function sumTiers(record: Record<string, number>, tiers: string[]): number {
  return tiers.reduce((sum, tier) => sum + (record[tier] ?? 0), 0);
}

function tierLabel(tiers: string[]): string {
  return tiers.map((tier) => TIER_LABELS[tier] ?? tier).join('、');
}

function isUpcomingTournament(player: Player, tournament: Tournament): boolean {
  if (!tournament.stages.includes(player.stage)) return false;
  if (tournament.signupWeeks === 'always') return true;
  return tournament.signupWeeks.some((week) => week >= player.week);
}

function tournamentWeek(tournament: Tournament, currentWeek: number): number {
  if (tournament.signupWeeks === 'always') return currentWeek;
  return tournament.signupWeeks.find((week) => week >= currentWeek) ?? tournament.signupWeeks[0] ?? currentWeek;
}

function upcomingOpportunities(
  player: Player,
  predicate: (tournament: Tournament) => boolean,
): CareerGoalOpportunity[] {
  return buildYearTournaments(player.year)
    .filter((tournament) => isUpcomingTournament(player, tournament))
    .filter(predicate)
    .map((tournament) => ({
      week: tournamentWeek(tournament, player.week),
      name: tournament.displayName,
      tier: TIER_LABELS[tournament.progressionTier] ?? TIER_LABELS[tournament.tier] ?? tournament.tier,
    }))
    .sort((a, b) => a.week - b.week || a.name.localeCompare(b.name))
    .slice(0, 3);
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

export function buildCareerGoal(player: Player): CareerGoal {
  if (player.stage === 'retired') {
    return {
      stage: player.stage,
      stageLabel: STAGE_LABELS[player.stage],
      summary: '职业生涯已经结束。',
      goals: [],
      opportunities: [],
    };
  }

  if (player.stage === 'rookie') {
    const openParticipations = sumTiers(player.tierParticipations ?? {}, ['b', 'a']);
    const openChampionships = sumTiers(player.tierChampionships ?? {}, ['b', 'a']);
    const hasTalentPath = player.traits.some((traitId) => traitId === 'aimer')
      || player.tags.some((tag) => tag === 'aimer');
    const readyForYouthApplication = player.team?.tier === 'youth' || hasTalentPath || (openParticipations >= 3 && openChampionships >= 1);

    return {
      stage: player.stage,
      stageLabel: STAGE_LABELS[player.stage],
      summary: '证明自己，申请青训战队。',
      nextStageLabel: STAGE_LABELS.youth,
      goals: [
        progress('open-participations', 'B/A 级赛事参赛', openParticipations, 3),
        progress('open-championships', 'B/A 级赛事冠军', openChampionships, 1),
        progress('youth-application', '青训申请资格', readyForYouthApplication ? 1 : 0, 1),
      ],
      opportunities: upcomingOpportunities(
        player,
        (tournament) => ['b', 'a'].includes(tournament.progressionTier),
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
      nextStageLabel: STAGE_LABELS[gate.to],
      goals: [
        progress(`${gate.tiers.join('-')}-participations`, `${tierLabel(gate.tiers)}参赛`, participations, gate.minParticipations),
        progress(`${gate.champTiers.join('-')}-championships`, `${tierLabel(gate.champTiers)}冠军`, championships, gate.minChampionships),
      ],
      opportunities: upcomingOpportunities(
        player,
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
    goals: [
      progress('s-participations', 'S 级与 Major 参赛', sClassParticipations, 4),
      progress('s-championships', 'S 级或 Major 冠军', sClassChampionships, 1),
      progress('fame', '名气', player.fame ?? 0, 60),
    ],
    opportunities: upcomingOpportunities(
      player,
      (tournament) => ['s-qualifier', 's-main', 'major'].includes(tournament.progressionTier),
    ),
  };
}
