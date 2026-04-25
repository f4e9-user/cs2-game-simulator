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

// Dynamic state that is NOT part of the 6-stat allocation.
// Derived display values live on the frontend (psychological = mentality*2 etc).
export interface DynamicState {
  stress: number;
  fame: number;
  restRounds: number;          // >0 means next N rounds forced to "rest" events
  stressMaxRounds: number;     // consecutive rounds stuck at stress >= MAX
  year: number;                // 1-indexed in-game year
  week: number;                // 1-48 (4 weeks per month, 12 months)
  pendingMatch: PendingMatch | null;
}

// A tournament the player has signed up for. Resolves when (year, month) match.
export interface PendingMatch {
  tournamentId: string;
  tier: string;
  name: string;
  resolveYear: number;
  resolveWeek: number;
  // For multi-stage tournaments: the current stage index within Tournament.stages.
  stageIndex: number;
}

// Rival teams generated at session creation. Used in event narratives.
export interface Rival {
  name: string;
  tag: string;
  region: string;
}

// Leaderboard entry for the global ranking. Player's team has isPlayer=true.
export interface LeaderboardTeam {
  name: string;
  tag: string;
  region: string;
  points: number;
  isPlayer: boolean;
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
}

export interface Choice {
  id: string;
  label: string;
  description: string;
}

export interface GameEvent {
  id: string;
  type: EventType;
  title: string;
  narrative: string;
  choices: Choice[];
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

export interface PromotionCheck {
  canPromote: boolean;
  to?: Stage;
  reasons: string[];
}

export interface GameSession {
  id: string;
  player: Player;
  currentEvent: GameEvent | null;
  history: RoundResult[];
  status: SessionStatus;
  ending?: string;
  createdAt: string;
  updatedAt: string;
  promotion?: PromotionCheck;
  leaderboard: LeaderboardTeam[];
}

export interface StartGameRequest {
  name: string;
  traitIds: string[];
  backgroundId: string;
  stats?: Stats;
}

export interface StartGameResponse {
  sessionId: string;
  player: Player;
  currentEvent: GameEvent | null;
  leaderboard: LeaderboardTeam[];
}

export interface RollTraitsResponse {
  traits: Trait[];
}

export interface ChoiceRequest {
  choiceId: string;
}

export interface ChoiceResponse {
  result: RoundResult;
  player: Player;
  currentEvent: GameEvent | null;
  status: SessionStatus;
  ending?: string;
  promotion?: PromotionCheck;
  leaderboard?: LeaderboardTeam[];
}
