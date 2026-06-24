import type { GameSession } from '../../types.js';
import type { ActionRecommendation, MilestoneInsight, RiskInsight } from './types.js';

function hasRisk(risks: RiskInsight[], id: string): boolean {
  return risks.some((risk) => risk.id === id);
}

export function buildActionRecommendations(
  session: GameSession,
  milestones: MilestoneInsight[],
  risks: RiskInsight[],
): ActionRecommendation[] {
  if (session.phase === 'event') {
    return [{
      title: '先处理当前事件',
      priority: 'high',
      reason: '当前处于事件阶段，行动面板暂时不可用，应该先完成事件选择再进入下一回合。',
      expectedBenefit: '推进回合结算，避免误以为还能安排本周行动。',
    }];
  }

  const player = session.player;
  const recommendations: ActionRecommendation[] = [];

  if (hasRisk(risks, 'high-stress') || hasRisk(risks, 'high-fatigue')) {
    recommendations.push({
      actionId: (player.stress ?? 0) >= 85 ? 'action-meditation' : 'action-rest-day',
      title: (player.stress ?? 0) >= 85 ? '先降压' : '先恢复疲劳',
      priority: 'high',
      reason: '当前风险已经高于成长收益，继续训练或比赛可能把状态推向崩盘。',
      expectedBenefit: '降低压力/疲劳，给后续赛事和训练留出安全空间。',
      tradeoff: '本周成长或赛事推进会放慢。',
    });
  }

  if (hasRisk(risks, 'low-money')) {
    recommendations.push({
      actionId: 'action-net-cafe',
      title: '补充现金流',
      priority: recommendations.length === 0 ? 'high' : 'medium',
      reason: '资金紧张会限制报名、恢复和装备选择。',
      expectedBenefit: '提高短期安全垫。',
      tradeoff: '赚钱行动通常会消耗 AP，并带来疲劳或压力。',
    });
  }

  const mainMilestone = milestones[0];
  if (mainMilestone?.status === 'ready') {
    recommendations.push({
      title: '推进已满足的职业节点',
      priority: recommendations.length === 0 ? 'high' : 'medium',
      reason: `${mainMilestone.title} 的关键条件已经满足。`,
      expectedBenefit: '把已经达成的赛事/晋级积累转化为职业阶段推进。',
      tradeoff: '可能需要等待事件、申请回应或合适窗口。',
    });
  } else if (player.stage === 'rookie' || player.stage === 'youth' || player.stage === 'second') {
    recommendations.push({
      actionId: player.stage === 'rookie' ? 'action-ranked-grind' : 'action-structured-training',
      title: player.stage === 'rookie' ? '为赛事证明做准备' : '围绕晋级赛事训练',
      priority: recommendations.length === 0 ? 'high' : 'medium',
      reason: mainMilestone?.nextStep ?? '当前阶段仍需要补足赛事或能力条件。',
      expectedBenefit: '提升后续比赛和申请的成功率。',
      tradeoff: '训练会带来疲劳和压力，需要和恢复行动搭配。',
    });
  } else if (player.stage === 'pro') {
    recommendations.push({
      title: '规划顶级赛事窗口',
      priority: recommendations.length === 0 ? 'high' : 'medium',
      reason: '职业阶段的核心收益来自 S 级赛事、Major、名气和冠军记录。',
      expectedBenefit: '让训练、恢复和报名围绕高价值赛事展开。',
      tradeoff: '顶级赛事失败代价更高，需要保留状态余量。',
    });
  }

  return recommendations.slice(0, 3);
}
