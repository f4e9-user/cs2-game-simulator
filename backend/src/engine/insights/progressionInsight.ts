import type { Player, Stage } from '../../types.js';
import { buildCareerGoal, type CareerGoal } from '../careerGoal.js';
import type { MilestoneInsight, OpportunityInsight, StageInsight } from './types.js';

const STAGE_LABELS: Record<Stage, string> = {
  rookie: '路人新人',
  youth: '青训',
  second: '二线队',
  pro: '职业队',
  retired: '退役',
};

const STAGE_SUMMARIES: Record<Stage, string> = {
  rookie: '你还没有进入俱乐部体系，当前重点是通过 C/B 级赛事证明自己。',
  youth: '你已经进入青训体系，当前重点是用 B 级赛事表现争取二线队机会。',
  second: '你已经进入二线队，当前重点是通过 A 级赛事证明职业队价值。',
  pro: '你已经进入职业阶段，当前重点是冲击 S 级赛事、Major 和传奇评价。',
  retired: '职业生涯已经结束，当前重点是复盘最终成就和结局原因。',
};

const STAGE_OBJECTIVES: Record<Stage, string> = {
  rookie: '积累 C/B 级赛事经历并争取冠军，为申请青训战队做准备。',
  youth: '积累 B 级赛事参赛和冠军记录，推动晋级二线队。',
  second: '积累 A 级赛事参赛和冠军记录，推动晋级职业队。',
  pro: '冲击 S 级赛事、Major、名气和高评价结局。',
  retired: '查看生涯总结，理解这段职业道路的最终评价。',
};

const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  rookie: 'youth',
  youth: 'second',
  second: 'pro',
};

export function buildStageInsight(player: Player): StageInsight {
  const next = NEXT_STAGE[player.stage];
  return {
    stage: player.stage,
    label: STAGE_LABELS[player.stage],
    summary: STAGE_SUMMARIES[player.stage],
    mainObjective: STAGE_OBJECTIVES[player.stage],
    nextStage: next ? STAGE_LABELS[next] : undefined,
  };
}

function milestoneId(goal: CareerGoal): string {
  switch (goal.stage) {
    case 'rookie': return 'rookie-to-youth';
    case 'youth': return 'youth-to-second';
    case 'second': return 'second-to-pro';
    case 'pro': return 'pro-legacy';
    case 'retired': return 'career-ended';
  }
}

function milestoneTitle(goal: CareerGoal): string {
  switch (goal.stage) {
    case 'rookie': return '申请青训战队';
    case 'youth': return '晋级二线队';
    case 'second': return '晋级职业队';
    case 'pro': return '冲击顶级荣誉';
    case 'retired': return '生涯已收束';
  }
}

export function buildProgressionOpportunities(player: Player, playerPoints = 0): OpportunityInsight[] {
  const goal = buildCareerGoal(player, playerPoints);
  return goal.opportunities.map((opportunity) => ({
    id: `${opportunity.week}:${opportunity.name}`,
    week: opportunity.week,
    name: opportunity.name,
    tier: opportunity.tier,
    available: opportunity.available,
    status: opportunity.status,
  }));
}

export function buildProgressionMilestones(player: Player, playerPoints = 0): MilestoneInsight[] {
  const goal = buildCareerGoal(player, playerPoints);
  if (player.stage === 'retired') {
    return [{
      id: milestoneId(goal),
      title: milestoneTitle(goal),
      category: 'ending',
      status: 'completed',
      progressText: '职业生涯已经结束',
      missing: [],
      nextStep: '查看生涯总结和关键转折。',
    }];
  }

  const missing = goal.goals
    .filter((item) => !item.completed)
    .map((item) => `还需要 ${item.label} ${Math.min(item.current, item.target)}/${item.target}`);
  const completed = goal.goals.length > 0 && goal.goals.every((item) => item.completed);

  return [{
    id: milestoneId(goal),
    title: milestoneTitle(goal),
    category: goal.stage === 'pro' ? 'fame' : 'promotion',
    status: completed ? 'ready' : 'in_progress',
    progressText: goal.goals.length > 0
      ? goal.goals.map((item) => `${item.label} ${Math.min(item.current, item.target)}/${item.target}`).join('，')
      : goal.summary,
    missing,
    nextStep: completed
      ? '条件已满足，关注晋级、申请或荣誉结算事件。'
      : goal.opportunities.length > 0
        ? '优先查看未来 12 周的相关赛事窗口。'
        : '先通过训练、天梯或战队行动补足当前短板。',
  }];
}
