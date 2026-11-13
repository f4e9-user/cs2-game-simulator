import type { Player } from './types';

export interface CareerReviewChip {
  label: string;
  tone: 'gold' | 'good' | 'warn' | 'danger' | 'neutral';
}

export interface CareerReview {
  title: string;
  summary: string;
  chips: CareerReviewChip[];
}

function normalizeStage(player: Player): Player['stage'] | NonNullable<Player['careerPeaks']>['highestStage'] {
  if (player.careerPeaks?.highestStage) return player.careerPeaks.highestStage;
  return player.stage === 'retired' ? 'rookie' : player.stage;
}

function hasLoanIssue(player: Player): boolean {
  return (player.loans ?? []).some((loan) => (!loan.paid && !loan.defaulted) || loan.defaulted);
}

function teamRounds(player: Player): number | null {
  if (player.teamCareer) return player.teamCareer.longestTeamRounds;
  if (!player.team) return null;
  return Math.max(0, (player.round ?? 0) - (player.team.joinedRound ?? player.round ?? 0));
}

function highestChampionshipTier(player: Player): string {
  const tiers = player.tierChampionships ?? {};
  if ((tiers.major ?? 0) > 0) return 'major';
  if ((tiers.s ?? 0) > 0) return 's';
  if ((tiers.a ?? 0) > 0) return 'a';
  if ((tiers.b ?? 0) > 0) return 'b';
  return 'c';
}

function buildTitle(player: Player, ending?: string): string {
  if (ending === 'legend') return '大满贯传奇';
  if (ending === 'free-agent-legend') return '草根枪男';
  if (ending === 'loyal-veteran') return '体系型老将';
  if (ending === 'banned_for_match_fixing') return '禁赛坠落者';
  if (ending === 'banned_for_cheating') return '作弊毁掉的职业路';
  if (ending === 'family_crisis_career_ended') return '被生活截断的职业路';
  if (ending === 'injury_ended_career' || (player.careerPeaks?.lowestConstitution ?? player.stats.constitution) <= 3) {
    return '被伤病拖住的天才';
  }
  if (ending === 'stress_breakdown' || (player.careerPeaks?.peakStress ?? player.stress) >= 90) {
    return '透支型选手';
  }
  if (ending === 'champion' || (player.tierChampionships?.major ?? 0) > 0) return '冠军老兵';
  if (ending === 'retired_on_top' && ((player.tierChampionships?.s ?? 0) > 0 || (player.careerPeaks?.peakFame ?? player.fame) >= 70)) {
    return '巅峰退役者';
  }
  if (((player.championshipSeries?.pgl ?? 0) + (player.championshipSeries?.blast ?? 0) + (player.championshipSeries?.major ?? 0)) > 0
    || (player.tierChampionships?.s ?? 0) >= 2) {
    return '顶级赛事常客';
  }
  if ((player.tierChampionships?.a ?? 0) + (player.tierChampionships?.b ?? 0) >= 3) return '二线联赛常青树';
  if ((player.careerPeaks?.peakFame ?? player.fame) >= 70 && (player.tournamentChampionships ?? 0) <= 1) return '高光很多但冠军太少';
  if (!player.everHadTeam) return '自由人游侠';
  if (hasLoanIssue(player) || (player.creditScore ?? 0) <= 30 || (player.consecutiveBrokeRounds ?? 0) >= 4) return '被经济拖累的职业路';
  return '平凡但完整的职业生涯';
}

function buildSummary(player: Player, title: string): string {
  const stage = normalizeStage(player);
  const peakFame = player.careerPeaks?.peakFame ?? player.fame ?? 0;
  const lowestConstitution = player.careerPeaks?.lowestConstitution ?? player.stats.constitution ?? 0;
  const peakStress = player.careerPeaks?.peakStress ?? player.stress ?? 0;
  const rounds = teamRounds(player);
  const tier = highestChampionshipTier(player);

  if (title === '大满贯传奇') return '你完成了最顶级的职业闭环，冠军、名气和履历都达到了顶点。';
  if (title === '被伤病拖住的天才') return '身体状态压住了上限，但你仍留下过足够亮眼的竞技证明。';
  if (title === '透支型选手') return '你在高压下持续燃烧，代价是很高的职业透支。';
  if (title === '高光很多但冠军太少') return '你有足够多的闪光时刻，但关键奖杯始终差一口气。';

  const stageText = stage === 'pro' ? '职业' : stage === 'second' ? '二线' : stage === 'youth' ? '青训' : '路人局';
  const roundsText = rounds != null ? `最长效力 ${rounds} 回合` : '没有稳定战队记录';
  const tierText = tier === 'major' ? 'Major' : tier === 's' ? 'S 级' : tier === 'a' ? 'A 级' : tier === 'b' ? 'B 级' : 'C 级';

  return `你主要在${stageText}阶段活动，${roundsText}，最高履历停留在${tierText}，峰值人气 ${peakFame}。`;
}

function buildChips(player: Player, title: string): CareerReviewChip[] {
  const chips: CareerReviewChip[] = [];
  const stage = normalizeStage(player);
  const peakFame = player.careerPeaks?.peakFame ?? player.fame ?? 0;
  const peakStress = player.careerPeaks?.peakStress ?? player.stress ?? 0;
  const lowestConstitution = player.careerPeaks?.lowestConstitution ?? player.stats.constitution ?? 0;
  const teamRoundsValue = teamRounds(player);

  chips.push({ label: `最高阶段：${stage === 'pro' ? '职业' : stage === 'second' ? '二线' : stage === 'youth' ? '青训' : '路人'}`, tone: 'neutral' });

  if (peakFame >= 70) chips.push({ label: `峰值人气 ${peakFame}`, tone: 'gold' });
  if ((player.tournamentChampionships ?? 0) > 0) chips.push({ label: `总冠军 ×${player.tournamentChampionships ?? 0}`, tone: 'good' });
  if ((player.tierChampionships?.major ?? 0) > 0) chips.push({ label: 'Major 冠军', tone: 'gold' });
  if ((player.championshipSeries?.pgl ?? 0) > 0) chips.push({ label: `PGL ×${player.championshipSeries?.pgl ?? 0}`, tone: 'good' });
  if ((player.championshipSeries?.blast ?? 0) > 0) chips.push({ label: `BLAST ×${player.championshipSeries?.blast ?? 0}`, tone: 'good' });
  if (teamRoundsValue != null) chips.push({ label: `最长效力 ${teamRoundsValue} 回合`, tone: 'good' });
  if (peakStress >= 90) chips.push({ label: `压力峰值 ${peakStress}`, tone: 'warn' });
  if (lowestConstitution <= 3) chips.push({ label: `体质最低 ${lowestConstitution}`, tone: 'danger' });
  if (hasLoanIssue(player)) chips.push({ label: '贷款状态异常', tone: 'warn' });
  if (title === '自由人游侠') chips.push({ label: '全程自由人', tone: 'good' });

  return chips.slice(0, 6);
}

export function buildCareerReview(player: Player, ending?: string): CareerReview {
  const title = buildTitle(player, ending);
  return {
    title,
    summary: buildSummary(player, title),
    chips: buildChips(player, title),
  };
}
