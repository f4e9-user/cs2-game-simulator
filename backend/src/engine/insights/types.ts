import type { Stage } from '../../types.js';

export interface CareerInsight {
  generatedAtRound: number;
  stage: StageInsight;
  promotion: PromotionInsight;
  stagePressure?: StagePressureInsight;
  headline: string;
  onboarding?: OnboardingInsight;
  priorities: PriorityInsight[];
  risks: RiskInsight[];
  recommendations: ActionRecommendation[];
  milestones: MilestoneInsight[];
  opportunities: OpportunityInsight[];
  calendarBlocks: CalendarBlockInsight[];
  blockers: BlockerInsight[];
  explanations: ExplanationInsight[];
  compatibility: CareerInsightCompatibility;
}

export interface StageInsight {
  stage: Stage;
  label: string;
  summary: string;
  mainObjective: string;
  nextStage?: string;
}

export interface PromotionInsight {
  ready: boolean;
  currentStage: Stage;
  nextStage?: Stage;
  nextStageLabel?: string;
  milestoneId?: string;
  progressText: string;
  missing: string[];
  nextStep?: string;
}

export interface StagePressureInsight {
  level: 'none' | 'watch' | 'at_risk';
  score: number;
  season: number;
  reasons: string[];
  summary: string;
}

export interface CareerInsightCompatibility {
  /**
   * API responses should expose CareerInsight as the single display contract.
   * The legacy CareerGoal shape remains an internal helper only.
   */
  legacyCareerGoalExposed: false;
  /** CareerInsight is generated per response and is not part of persisted GameSession. */
  persistenceSafe: true;
}

export interface PriorityInsight {
  id: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MilestoneInsight {
  id: string;
  title: string;
  category: 'promotion' | 'team' | 'tournament' | 'economy' | 'fame' | 'ending';
  status: 'locked' | 'in_progress' | 'ready' | 'completed';
  progressText: string;
  missing: string[];
  nextStep?: string;
}

export interface OpportunityInsight {
  id: string;
  tournamentId: string;
  week: number;
  name: string;
  tier: string;
  available: boolean;
  status: string;
}

export interface CalendarBlockInsight {
  id: string;
  year: number;
  week: number;
  endYear?: number;
  endWeek?: number;
  kind: 'opportunity' | 'commitment' | 'travel' | 'prep' | 'match' | 'recovery' | 'empty';
  title: string;
  shortTitle: string;
  tier?: string;
  status: string;
  tone: 'neutral' | 'available' | 'locked' | 'active' | 'major' | 'warning';
  source: 'career-goal' | 'tournament-calendar' | 'pending-match' | 'tournament-context' | 'system';
  tournamentId?: string;
  action?: 'signup' | 'preregister' | 'withdraw' | 'none';
  detail?: string;
}

export interface RiskInsight {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  reason: string;
  suggestedMitigation?: string;
  relatedStats: string[];
}

export interface ActionRecommendation {
  actionId?: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  expectedBenefit: string;
  tradeoff?: string;
}

export interface OnboardingInsight {
  mode: 'first_round' | 'early_game' | 'stage_intro' | 'hidden';
  title: string;
  message: string;
  checklist: string[];
  dismissible: boolean;
}

export interface BlockerInsight {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface ExplanationInsight {
  id: string;
  title: string;
  detail: string;
  visibility: 'player' | 'debug';
}
