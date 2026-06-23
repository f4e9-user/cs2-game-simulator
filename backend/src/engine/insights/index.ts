import type { GameSession } from '../../types.js';
import { buildActionRecommendations } from './actionRecommendation.js';
import { buildBlockerInsights, buildEventExplanations } from './eventReason.js';
import { buildOnboardingInsight } from './onboardingInsight.js';
import { buildProgressionMilestones, buildStageInsight } from './progressionInsight.js';
import { buildRiskInsights } from './riskInsight.js';
import type { CareerInsight, PriorityInsight } from './types.js';

function buildPriorities(insight: Pick<CareerInsight, 'milestones' | 'risks'>): PriorityInsight[] {
  const priorities: PriorityInsight[] = [];
  const topRisk = insight.risks[0];
  if (topRisk && topRisk.severity !== 'info') {
    priorities.push({
      id: `risk:${topRisk.id}`,
      title: topRisk.title,
      detail: topRisk.reason,
      priority: topRisk.severity === 'danger' ? 'high' : 'medium',
    });
  }

  const milestone = insight.milestones[0];
  if (milestone) {
    priorities.push({
      id: `milestone:${milestone.id}`,
      title: milestone.title,
      detail: milestone.nextStep ?? milestone.progressText,
      priority: milestone.status === 'ready' ? 'high' : 'medium',
    });
  }

  return priorities.slice(0, 3);
}

export function buildCareerInsight(session: GameSession, playerPoints = 0): CareerInsight {
  const stage = buildStageInsight(session.player);
  const milestones = buildProgressionMilestones(session.player, playerPoints);
  const risks = buildRiskInsights(session.player);
  const recommendations = buildActionRecommendations(session, milestones, risks);
  const blockers = buildBlockerInsights(session);
  const explanations = buildEventExplanations(session);
  const partial = { milestones, risks };

  return {
    generatedAtRound: session.player.round ?? 0,
    stage,
    headline: `${stage.label}｜${stage.mainObjective}`,
    onboarding: buildOnboardingInsight(session.player),
    priorities: buildPriorities(partial),
    risks,
    recommendations,
    milestones,
    blockers,
    explanations,
  };
}

export * from './types.js';
