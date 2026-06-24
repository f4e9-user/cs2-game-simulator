import type { GameSession } from '../../types.js';
import { buildActionRecommendations } from './actionRecommendation.js';
import { buildCalendarBlocks } from './calendarBlocks.js';
import { buildBlockerInsights, buildEventExplanations } from './eventReason.js';
import { buildOnboardingInsight } from './onboardingInsight.js';
import { buildProgressionMilestones, buildProgressionOpportunities, buildPromotionInsight, buildStageInsight } from './progressionInsight.js';
import { buildRiskInsights } from './riskInsight.js';
import type { CareerInsight, PriorityInsight } from './types.js';

type DebugOnlyResponseFields = 'debugTeamIdentity' | 'debugRole';
type PayloadControlFields = 'includeDebugFields';

export type SessionInsightPayload<T extends Record<string, unknown> = Record<string, never>> = Omit<GameSession, DebugOnlyResponseFields> & Omit<T, DebugOnlyResponseFields | PayloadControlFields> & {
  careerInsight: CareerInsight;
};

export type DebugSessionInsightPayload<T extends Record<string, unknown> = Record<string, never>> = Omit<GameSession, DebugOnlyResponseFields> & Omit<T, PayloadControlFields> & Pick<GameSession, DebugOnlyResponseFields> & {
  careerInsight: CareerInsight;
};

type SessionPayloadControls = {
  includeDebugFields?: boolean;
};

type SessionPayloadOverrides<T extends Record<string, unknown>> = T & SessionPayloadControls;

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
  const promotion = buildPromotionInsight(session.player, milestones, playerPoints);
  const opportunities = buildProgressionOpportunities(session.player, playerPoints);
  const calendarBlocks = buildCalendarBlocks(session, opportunities, playerPoints);
  const risks = buildRiskInsights(session.player);
  const recommendations = buildActionRecommendations(session, milestones, risks);
  const blockers = buildBlockerInsights(session);
  const explanations = buildEventExplanations(session);
  const partial = { milestones, risks };

  return {
    generatedAtRound: session.player.round ?? 0,
    stage,
    promotion,
    headline: `${stage.label}｜${stage.mainObjective}`,
    onboarding: buildOnboardingInsight(session.player),
    priorities: buildPriorities(partial),
    risks,
    recommendations,
    milestones,
    opportunities,
    calendarBlocks,
    blockers,
    explanations,
    compatibility: {
      legacyCareerGoalExposed: false,
      persistenceSafe: true,
    },
  };
}

export function buildSessionPayload<T extends Record<string, unknown> = Record<string, never>>(
  session: GameSession,
  overrides?: T & { includeDebugFields?: false },
): SessionInsightPayload<T>;
export function buildSessionPayload<T extends Record<string, unknown> = Record<string, never>>(
  session: GameSession,
  overrides: T & { includeDebugFields: true },
): DebugSessionInsightPayload<T>;
export function buildSessionPayload<T extends Record<string, unknown> = Record<string, never>>(
  session: GameSession,
  overrides?: SessionPayloadOverrides<T>,
): SessionInsightPayload<T> | DebugSessionInsightPayload<T> {
  const { debugTeamIdentity: _debugTeamIdentity, debugRole: _debugRole, ...persistedSession } = session;
  const { includeDebugFields, ...overrideFields } = (overrides ?? {}) as SessionPayloadOverrides<T>;
  const playerPoints = session.leaderboard?.find((team) => team.isPlayer)?.points ?? 0;
  const basePayload = {
    ...persistedSession,
    careerInsight: buildCareerInsight(session, playerPoints),
  };

  if (includeDebugFields) {
    return {
      ...basePayload,
      ...overrideFields,
    } as DebugSessionInsightPayload<T>;
  }

  const safeOverrides = { ...overrideFields };
  delete (safeOverrides as Partial<Record<DebugOnlyResponseFields, unknown>>).debugTeamIdentity;
  delete (safeOverrides as Partial<Record<DebugOnlyResponseFields, unknown>>).debugRole;
  return {
    ...basePayload,
    ...safeOverrides,
  } as SessionInsightPayload<T>;
}

export * from './types.js';
