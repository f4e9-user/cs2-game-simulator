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
  | 'retired';

export type EventType =
  | 'training'
  | 'ranked'
  | 'team'
  | 'tryout'
  | 'match'
  | 'media'
  | 'life'
  | 'bailout'
  | 'betting'
  | 'cheat'
  | 'rest'
  | 'routine';

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

// ── 战队/经济相关类型 ──────────────────────────────────────────
export type ClubTier = 'youth' | 'semi-pro' | 'pro' | 'top';

export interface PlayerTeam {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  monthlySalary: number;
  joinedRound: number;
}

export interface PendingApplication {
  clubId: string;
  clubName: string;
  appliedRound: number;
  responseRound: number;
}

export interface TeamOffer {
  clubId: string;
  clubName: string;
  tag: string;
  tier: ClubTier;
  region: string;
  monthlySalary: number;
}

export type ForcedMatchResult = 'win' | 'loss';

export interface Loan {
  id: string;
  principal: number;
  interestRate: number;
  remainingPrincipal: number;
  issuedRound: number;
  dueRound: number;
  paid: boolean;
  defaulted: boolean;
}

export interface SalaryTracker {
  lastPayRound: number;
  joinedRound: number;
  payCycle: number;
  originalMonthlySalary?: number;
  salaryRestoreRound?: number;
}

// Dynamic state that is NOT part of the 6-stat allocation.
// Derived display values live on the frontend (psychological = mentality*2 etc).
export interface DynamicState {
  stress: number;
  fame: number;
  restRounds: number;
  stressMaxRounds: number;
  year: number;
  week: number;
  pendingMatch: PendingMatch | null;
  qualificationSlots: Record<string, number>;
  teamQualificationSlots: Record<string, number>;
  actionPoints: number;
  shopCooldowns: Record<string, number>;
  team: PlayerTeam | null;
  pendingApplication: PendingApplication | null;
  consecutiveLosses: number;
  everHadTeam: boolean;
  contractRenewals: number;
  forceNextEvent: string | null;
  forceMatchResult: ForcedMatchResult | null;
  bailoutCooldown: number;
  teamBailoutCooldown: number;
  consecutiveBrokeRounds: number;
}

// A tournament the player has signed up for. Resolves when (year, month) match.
export interface PendingMatch {
  tournamentId: string;
  tier: string;
  name: string;
  displayName?: string;
  progressionTier?: string;
  entryType?: string;
  qualificationSlotUsed?: string;
  qualificationSlotOwner?: 'player' | 'team';
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

export type TeammateRole = 'IGL' | 'AWPer' | 'Entry' | 'Support' | 'Lurker';

export type PersonalityTag =
  | 'strict'
  | 'supportive'
  | 'star'
  | 'grinder'
  | 'drama';

export interface TeammateStats {
  agility: number;
  intelligence: number;
  mentality: number;
  experience: number;
}

export interface RoleTransition {
  targetRole: TeammateRole;
  startedRound: number;
  resolveRound: number;
}

export interface Teammate {
  id: string;
  name: string;
  role: TeammateRole;
  personality: PersonalityTag;
  traits: string[];
  stats: TeammateStats;
  growthSpent: number;
  injuryRisk: number;
  retired: boolean;
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
  loans: Loan[];
  salaryTracker: SalaryTracker | null;
  pawnedItemIds: string[];
  ownedItems: string[];
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
  naturalRoll?: number;
  narrative: string;
  statChanges: StatDelta;
  newStats: Stats;
  stageBefore: Stage;
  stageAfter: Stage;
  tagsAdded: string[];
  passiveEffects: string[];
  qualificationChanges: string[];
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
