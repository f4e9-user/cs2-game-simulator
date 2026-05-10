// Mirror of backend/src/types.ts (kept in sync by hand for the MVP).

export type StatKey =
  | 'intelligence'
  | 'agility'
  | 'experience'
  | 'money'
  | 'mentality'
  | 'constitution';

export type Stats = Record<StatKey, number>;

export interface VolatileState {
  feel: number;    // -3 ~ +3
  tilt: number;    // 0 ~ 3
  fatigue: number; // 0 ~ 100
}

export interface Buff {
  id: string;
  label: string;
  actionTag: string;
  growthKey?: StatKey;
  multiplier: number;
  remainingUses: number;
}

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
  stageIndex: number;
}

export type TournamentEntryType =
  | 'invite'
  | 'open_qualifier'
  | 'closed_qualifier'
  | 'direct_signup';

export type TournamentProgressionTier =
  | 'b'
  | 'a'
  | 's-qualifier'
  | 's-main'
  | 'major';

export interface QualificationReward {
  slot: string;
  count: number;
}

export interface QualificationMilestone {
  stageIndex: number;
  requireWin?: boolean;
  label: string;
  rewards: QualificationReward[];
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

export type ClubTier = 'youth' | 'semi-pro' | 'pro' | 'top';

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

export interface Club {
  id: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  requiredStage: Stage;
  requiredFame?: number;
  baseSalary: number;
  salaryRange: [number, number];
  isRival?: boolean;
  rivalIndex?: number;
}

export interface PlayerTeam {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  weeklySalary: number;
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
  weeklySalary: number;
}

export interface PendingDeparture {
  slotId: string;
  departureRound: number;
  rumorShown: boolean;
  revealed: boolean;
  destTeamName: string;
  earlyRecruit: boolean;
}

export interface DynamicState {
  stress: number;
  fame: number;
  restRounds: number;
  stressMaxRounds: number;
  year: number;
  week: number;
  pendingMatch: PendingMatch | null;
  actionPoints: number;
  shopCooldowns: Record<string, number>;
  team: PlayerTeam | null;
  pendingApplication: PendingApplication | null;
  qualificationSlots: Record<string, number>;
  teamQualificationSlots: Record<string, number>;
  consecutiveLosses: number;
  everHadTeam: boolean;
  contractRenewals: number;
}

export interface ActionResult {
  actionId: string;
  actionLabel: string;
  success: boolean;
  roll: number;
  dc: number;
  narrative: string;
  feelChange: number;
  fatigueChange: number;
  stressChange: number;
  growthKey?: StatKey;
  growthAmount?: number;
  newStats: Stats;
  newVolatile: { feel: number; tilt: number; fatigue: number };
}

export type ShopCategory = 'consumable' | 'service' | 'equipment' | 'social';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  priceMoney: number;
  cooldownRounds: number;
  requireFame?: number;
  requireStage?: Stage[];
}

export interface Player extends DynamicState {
  name: string;
  stats: Stats;
  volatile: VolatileState;
  feelCap: number;
  peripheralTier: number;
  buffs: Buff[];
  growthSpent: number;
  traits: string[];
  backgroundId: string;
  stage: Stage;
  round: number;
  tags: string[];
  tagExpiry: Record<string, number>;
  rivals: Rival[];
  tournamentParticipations: number;
  tournamentChampionships: number;
  tierParticipations: Record<string, number>;
  tierChampionships: Record<string, number>;
  promotionPending: Stage | null;
  promotionCooldown: number;
  pendingOffer: TeamOffer | null;
  roster: Teammate[] | null;
  preferredRole: TeammateRole | null;
  activeRole: TeammateRole | null;
  roleCrystallized: boolean;
  activeRoleRounds: number;
  roleTransition: RoleTransition | null;
  teamTrust: number;
  pendingDeparture?: PendingDeparture;
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

export interface MatchStats {
  kills: number;
  deaths: number;
  assists: number;
  headshotRate: number;
  rating: number;
  teamScore: number;
  enemyScore: number;
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
  qualificationChanges: string[];
  stressChange: number;
  fameChange: number;
  feelChange: number;
  tiltChange: number;
  fatigueChange: number;
  buffsAdded: Buff[];
  matchStats?: MatchStats;
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
  displayName: string;
  description: string;
  stages: Stage[];
  progressionTier: TournamentProgressionTier;
  entryType: TournamentEntryType;
  brand: string;
  subtype: string;
  year: number;
  seasonIndex?: number;
  city?: string;
  region?: string;
  teamRequirement?: ClubTier | null;
  qualificationTargets?: string[];
  qualificationRewards?: QualificationReward[];
  qualificationMilestones?: QualificationMilestone[];
  fameRequired?: number;
  signupWeeks: number[] | 'always';
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

// ── 派生属性（显示用）──────────────────────────────────────────
export interface DerivedStats {
  aim: number;       // 枪法 0-100  = agility*0.7 + experience*0.3 → /20*100
  gameSense: number; // 决策 0-100  = intelligence*0.7 + experience*0.3 → /20*100
  stability: number; // 稳定性 0-100 = mentality/20*100
  stamina: number;   // 续航 0-100   = constitution/20*100
}
