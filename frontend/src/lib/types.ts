// Mirror of shared/types.ts (kept in sync by hand for the MVP).
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
  tournamentParticipations: number;
  tournamentChampionships: number;
  tierParticipations: Record<string, number>;
  tierChampionships: Record<string, number>;
  promotionPending: Stage | null;
  promotionCooldown: number;
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
  statChanges: Partial<Stats>;
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

export interface StartGameResponse {
  sessionId: string;
  player: Player;
  currentEvent: GameEvent | null;
  leaderboard: LeaderboardTeam[];
}

export interface RollTraitsResponse {
  traits: Trait[];
}

export interface Tournament {
  id: string;
  tier: string;
  name: string;
  description: string;
  stages: Stage[];
  fameRequired?: number;
  signupMonths: number[] | 'monthly';
  reward: { money: number; experience: number; fame: number; stressDelta?: number };
  difficulty: number;
}

export interface TournamentsResponse {
  open: Tournament[];
  pendingMatch: PendingMatch | null;
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
