// Mirror of shared/types.ts, kept in sync by hand for the MVP.
export type StatKey =
  | 'intelligence'
  | 'agility'
  | 'experience'
  | 'money'
  | 'mentality'
  | 'constitution';

export type Stats = Record<StatKey, number>;

export type Stage =
  | 'rookie'
  | 'youth'
  | 'second'
  | 'pro'
  | 'star'
  | 'veteran'
  | 'retired';

export type EventType =
  | 'training'
  | 'ranked'
  | 'team'
  | 'tryout'
  | 'match'
  | 'media'
  | 'life'
  | 'betting'
  | 'cheat'
  | 'rest';

export interface Trait {
  id: string;
  name: string;
  description: string;
  modifiers: Partial<Stats>;
  tags: string[];
}

export interface Background {
  id: string;
  name: string;
  description: string;
  startStage: Stage;
  statBias: Partial<Stats>;
  tags: string[];
}

export interface PendingMatch {
  tournamentId: string;
  tier: string;
  name: string;
  resolveYear: number;
  resolveWeek: number;
  stageIndex: number;
}

export interface Rival {
  name: string;
  tag: string;
  region: string;
}

export interface LeaderboardTeam {
  name: string;
  tag: string;
  region: string;
  points: number;
  isPlayer: boolean;
}

export interface DynamicState {
  stress: number;
  fame: number;
  restRounds: number;
  stressMaxRounds: number;
  year: number;
  week: number;
  pendingMatch: PendingMatch | null;
}

export interface Player extends DynamicState {
  name: string;
  stats: Stats;
  traits: string[];
  backgroundId: string;
  stage: Stage;
  round: number;
  tags: string[];
  rivals: Rival[];
  // Tournament career record
  tournamentParticipations: number;
  tournamentChampionships: number;
  tierParticipations: Record<string, number>;
  tierChampionships: Record<string, number>;
  // Pending stage promotion (set when gate conditions are met, cleared on accept/decline)
  promotionPending: Stage | null;
  // Round number after which promotion can re-trigger (cooldown after decline)
  promotionCooldown: number;
}

export interface ChoicePublic {
  id: string;
  label: string;
  description: string;
}

export interface GameEventPublic {
  id: string;
  type: EventType;
  title: string;
  narrative: string;
  choices: ChoicePublic[];
}

export type StatDelta = Partial<Stats>;

export interface RoundResult {
  round: number;
  eventId: string;
  eventType: EventType;
  eventTitle: string;
  choiceId: string;
  choiceLabel: string;
  success: boolean;
  roll: number;
  dc: number;
  narrative: string;
  statChanges: StatDelta;
  newStats: Stats;
  stageBefore: Stage;
  stageAfter: Stage;
  tagsAdded: string[];
  passiveEffects: string[];
  stressChange: number;
  fameChange: number;
  createdAt: string;
}

export type SessionStatus = 'active' | 'ended';

export interface GameSession {
  id: string;
  player: Player;
  currentEvent: GameEventPublic | null;
  history: RoundResult[];
  status: SessionStatus;
  ending?: string;
  createdAt: string;
  updatedAt: string;
  leaderboard: LeaderboardTeam[];
}

// --- Internal-only engine types (not sent to client) ---

export interface Outcome {
  narrative: string;
  statChanges: StatDelta;
  tagAdds?: string[];
  tagRemoves?: string[];
  stageDelta?: number;
  stageSet?: Stage;
  endRun?: boolean;
  endReason?: string;
  // Dynamic state deltas — NOT subject to growth curve.
  stressDelta?: number;
  fameDelta?: number;
  // Force N rounds of "rest" events after this outcome.
  injuryRestRounds?: number;
  // Extra leaderboard points credited on top of the stage base reward.
  pointsDelta?: number;
}

export interface DetectionCheck {
  chanceByStage: Partial<Record<Stage, number>>;
}

export interface ChoiceDef {
  id: string;
  label: string;
  description: string;
  check: {
    primary: StatKey;
    secondary?: StatKey;
    dc: number;
    traitBonuses?: Record<string, number>;
    traitPenalties?: Record<string, number>;
    detection?: DetectionCheck;
  };
  success: Outcome;
  failure: Outcome;
}

export interface EventDef {
  id: string;
  type: EventType;
  title: string;
  narrative: string;
  stages: Stage[];
  difficulty: number;
  weight?: number;
  requireTags?: string[];
  forbidTags?: string[];
  choices: ChoiceDef[];
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AI?: unknown;
}
