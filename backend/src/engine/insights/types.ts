import type { Stage } from '../../types.js';

export interface CareerInsight {
  generatedAtRound: number;
  stage: StageInsight;
  headline: string;
  onboarding?: OnboardingInsight;
  priorities: PriorityInsight[];
  risks: RiskInsight[];
  recommendations: ActionRecommendation[];
  milestones: MilestoneInsight[];
  blockers: BlockerInsight[];
  explanations: ExplanationInsight[];
}

export interface StageInsight {
  stage: Stage;
  label: string;
  summary: string;
  mainObjective: string;
  nextStage?: string;
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
