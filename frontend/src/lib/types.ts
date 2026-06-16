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
  growthMultiplier?: number;
  fatigueGainMultiplier?: number;
  stressGainMultiplier?: number;
  matchWinrateDelta?: number;
  matchRatingDelta?: number;
  matchFatigueMultiplier?: number;
  matchStressMultiplier?: number;
  teamChemistryMatchDelta?: number;
  matchScope?: 'series' | 'per-map';
  remainingUses: number;
  consumeOn?: 'growth' | 'fatigue' | 'stress' | 'match' | 'any';
  /** @deprecated Use growthMultiplier instead. */
  multiplier?: number;
}

export interface RoundCombo {
  id: string;
  label: string;
  sourceActionId: string;
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
  | 'bailout'
  | 'betting'
  | 'cheat'
  | 'rest'
  | 'stress'
  | 'rival'
  | 'broadcast'
  | 'daily'
  | 'chains'
  | 'skins'
  | 'agent'
  | 'tournament-context'
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
  qualificationSlotExpiresAt?: QualificationExpiry;
  resolveYear: number;
  resolveWeek: number;
  stageIndex: number;
  opponent?: PendingMatchOpponent;
}

export interface PendingMatchOpponent {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  vrsScore: number;
  power: number;
  form: number;
}

export type TournamentContextPhase =
  | 'signup'
  | 'pre-match'
  | 'match'
  | 'post-match'
  | 'complete';

export interface TournamentContextEventRef {
  eventId: string;
  phase: TournamentContextPhase;
  stageIndex: number;
  priority: number;
  expiresAtRound?: number;
  generatedEvent?: GameEvent;
}

export interface TournamentContextMatchResult {
  won: boolean;
  isFinalStage: boolean;
  teamScore: number;
  enemyScore: number;
  kills: number;
  deaths: number;
  assists: number;
  rating: number;
  headshotRate: number;
}

export interface TournamentContext {
  tournamentId: string;
  stageIndex: number;
  signedUpAtRound: number;
  signedUpAtYear: number;
  signedUpAtWeek: number;
  resolveYear: number;
  resolveWeek: number;
  phase: TournamentContextPhase;
  contextEventQueue: TournamentContextEventRef[];
  consumedContextEventIds: string[];
  lastMatchResult?: TournamentContextMatchResult;
  pressureLevel: number;
  stakesLevel: number;
  expiresAtRound?: number;
}

export interface QualificationExpiry {
  year: number;
  week: number;
}

export interface QualificationSlotBatch {
  slot: string;
  count: number;
  expiresAt: QualificationExpiry;
}

export type TournamentEntryType =
  | 'invite'
  | 'open_qualifier'
  | 'closed_qualifier'
  | 'direct_signup';

export type TournamentProgressionTier =
  | 'c'
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
  clubId?: string;
  name: string;
  tag: string;
  region: string;
  points: number;
  isPlayer: boolean;
  kind?: 'club' | 'rival' | 'free-agent';
}

export type ClubTier = 'youth' | 'semi-pro' | 'pro' | 'top';
export type TournamentTier = 'c' | 'b' | 'a' | 's-open' | 's-closed' | 's-class' | 'major';

export type RosterStyle =
  | 'balanced'
  | 'tactical'
  | 'firepower'
  | 'development'
  | 'chaotic';

export type TeammateRole = 'IGL' | 'AWPer' | 'Entry' | 'Support' | 'Lurker';

export type TeamIdentity =
  | 'caller'
  | 'star'
  | 'veteran'
  | 'rookie'
  | 'glue'
  | 'problem';

export type VisiblePlayerTeamIdentity = TeamIdentity | 'star-caller';

export interface TeamIdentityTarget {
  type: 'player' | 'teammate';
  id: string;
  label: string;
  score: number;
  reasons: string[];
  identities: TeamIdentity[];
}

export interface TeamIdentityScoreDebug {
  identity: TeamIdentity;
  score: number;
  reasons: string[];
}

export interface TeamIdentityDebug {
  player: {
    visibleIdentity?: VisiblePlayerTeamIdentity;
    sinceRound?: number;
    scores: TeamIdentityScoreDebug[];
  };
  teammates: Array<{
    id: string;
    name: string;
    visibleIdentity?: TeamIdentity;
    sinceRound?: number;
    scores: TeamIdentityScoreDebug[];
  }>;
  caller: TeamIdentityTarget | null;
  star: TeamIdentityTarget | null;
}

export interface ClubPlayer {
  id: string;
  name: string;
  role: TeammateRole;
  stats: TeammateStats;
  traits: string[];
  personality: PersonalityTag;
  joinedRound: number;
  status: 'starter' | 'bench' | 'trial';
  internalChemistry?: number;
}

export interface ClubQualificationState {
  eligibleTiers: TournamentTier[];
  openQualifierTickets: string[];
  majorPathProgress?: string;
  seasonRank?: number;
}

export type ClubStoryline =
  | 'dark-horse-run'
  | 'core-rebuild'
  | 'chemistry-crisis'
  | 'veteran-decline'
  | 'star-breakout'
  | 'system-clicking'
  | 'promoted-after-breakout-season'
  | 'fallen-giant';

export interface ClubRecentResult {
  round: number;
  tournamentId?: string;
  tier: TournamentTier;
  result: 'win' | 'loss' | 'deep-run' | 'early-exit';
  note: string;
}

export interface ClubRuntimeState {
  clubId: string;
  tier: ClubTier;
  displayName?: string;
  displayTag?: string;
  displayRegion?: string;
  baselineVrsScore?: number;
  fullRoster: ClubPlayer[];
  clubTrust: number;
  currentForm: number;
  rosterStability: number;
  internalChemistry: number;
  seasonPoints: number;
  vrsScore: number;
  qualificationState: ClubQualificationState;
  activeStorylines: ClubStoryline[];
  recentResults: ClubRecentResult[];
  pendingStoryFlags: string[];
  updatedRound: number;
}

export interface ClubDisplayInfo {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
}

export interface ClubSeasonSummary {
  season: number;
  round: number;
  darkHorseClubIds: string[];
  fallenClubIds: string[];
  promotedClubIds: string[];
  majorNewFaceClubIds: string[];
}

export interface WorldClubPool {
  season: number;
  activeClubIds: string[];
  relevantClubIds: string[];
  staticClubIds: string[];
  runtimeByClubId: Record<string, ClubRuntimeState>;
  processedTickKeysByClubId: Record<string, string[]>;
  lastGlobalTickRound?: number;
  seasonSummaries?: ClubSeasonSummary[];
}

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
  chemistry?: number;
  visibleIdentity?: TeamIdentity;
  identitySinceRound?: number;
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

export interface ClubApplicationSummary extends Club {
  runtimeSummary?: {
    rosterStyle: RosterStyle;
    currentForm: number;
    rosterStability: number;
    internalChemistry: number;
    clubTrust: number;
    needs: string[];
    storylines: ClubStoryline[];
    hint: string;
  };
}

export interface PlayerTeam {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  monthlySalary: number;
  joinedRound: number;
  teamStatus?: 'starter' | 'trial' | 'rotation';
  teamStatusUntilRound?: number;
  joinMode?: PlayerJoinMode;
  joinReason?: string;
  roleOverlap?: RoleOverlap[];
}

export type RoundTeamSnapshot = Pick<PlayerTeam, 'clubId' | 'name' | 'tag' | 'region' | 'tier'>;

export type PlayerJoinMode = 'replace-starter' | 'fill-vacancy' | 'trial-sixth' | 'rotation';

export interface RoleOverlap {
  kind: 'identity' | 'role';
  value: TeamIdentity | TeammateRole;
  teammateId?: string;
  teammateName?: string;
  severity: 'low' | 'medium' | 'high';
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

export interface PendingDeparture {
  slotId: string;
  departureRound: number;
  rumorShown: boolean;
  revealed: boolean;
  destTeamName: string;
  earlyRecruit: boolean;
  baseWindowStartRound?: number;
  pressure?: number;
  pressureThreshold?: number;
  lastPressureRound?: number;
  lockedUntilRound?: number;
  reasonTags?: string[];
  retentionAttempted?: boolean;
  retentionAttemptRound?: number;
}

export type ForcedMatchResult = 'win' | 'loss';

export interface Loan {
  id: string;
  source?: 'bank' | 'friend';
  principal: number;
  interestRate: number;
  remainingPrincipal: number;
  issuedRound: number;
  dueRound: number;
  paid: boolean;
  defaulted: boolean;
}

export interface PendingFamilyCrisis {
  amountNeeded: number;
  deadlineRound: number;
}

export interface SalaryTracker {
  lastPayRound: number;
  joinedRound: number;
  payCycle: number;
  originalMonthlySalary?: number;
  salaryRestoreRound?: number;
}

export interface DynamicState {
  stress: number;
  fame: number;
  restRounds: number;
  stressMaxRounds: number;
  year: number;
  week: number;
  pendingMatch: PendingMatch | null;
  tournamentContext?: TournamentContext;
  actionPoints: number;
  shopCooldowns: Record<string, number>;
  weeklyShopPurchases: Record<string, { year: number; week: number; count: number }>;
  weeklyTeamActions: Record<string, { year: number; week: number; count: number }>;
  team: PlayerTeam | null;
  pendingApplication: PendingApplication | null;
  qualificationSlots: Record<string, number>;
  teamQualificationSlots: Record<string, number>;
  qualificationSlotBatches?: QualificationSlotBatch[];
  teamQualificationSlotBatches?: QualificationSlotBatch[];
  consecutiveLosses: number;
  everHadTeam: boolean;
  contractRenewals: number;
  forceNextEvent: string | null;
  forceMatchResult: ForcedMatchResult | null;
  bailoutCooldown: number;
  teamBailoutCooldown: number;
  consecutiveBrokeRounds: number;
  creditScore: number;
  familyBailoutCount: number;
  pendingFamilyCrisis?: PendingFamilyCrisis;
  roundCombos: RoundCombo[];
}

export interface ActionResult {
  actionId: string;
  actionLabel: string;
  success: boolean;
  roll: number;
  dc: number;
  naturalRoll?: number;
  narrative: string;
  feelChange: number;
  fatigueChange: number;
  stressChange: number;
  growthKey?: StatKey;
  growthAmount?: number;
  newStats: Stats;
  newVolatile: { feel: number; tilt: number; fatigue: number };
  comboTriggeredLabels?: string[];
  comboAddedLabels?: string[];
}

export interface TeamActionResult {
  actionId: string;
  label: string;
  success: boolean;
  roll: number;
  dc: number;
  narrative: string;
  effects: string[];
  teammateId?: string;
  comboTriggeredLabels?: string[];
  comboAddedLabels?: string[];
}

export type ShopCategory = 'consumable' | 'service' | 'equipment' | 'social';

export interface ShopEffect {
  fatigueDelta?: number;
  stressDelta?: number;
  feelReset?: boolean;
  moneyDelta?: number;
  constitutionDelta?: number;
  mentalityDelta?: number;
  fameDelta?: number;
  buffAdd?: Buff;
  buffRemoveId?: string;
  tagRemove?: string;
  tagAdd?: string;
}

export interface ShopNegativeEvent {
  chance: number;
  effect: ShopEffect;
  narrative: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  priceMoney: number;
  cooldownRounds: number;
  requireFame?: number;
  requireStage?: Stage[];
  effect?: ShopEffect;
  negativeEvents?: ShopNegativeEvent[];
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
  visibleTeamIdentity?: VisiblePlayerTeamIdentity;
  teamIdentitySinceRound?: number;
  pendingDeparture?: PendingDeparture;
  ownedItems: string[];
  loans: Loan[];
  salaryTracker: SalaryTracker | null;
  pawnedItemIds: string[];
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

export type ResultTier = 'critical_success' | 'success' | 'failure' | 'critical_failure';

export type EventSequenceType =
  | 'test-sequence'
  | 'tournament-series'
  | 'club-interview'
  | 'family-crisis'
  | 'team-conflict'
  | 'tournament-context'
  | 'custom';

export type EventSequenceDynamicKind =
  | 'tournament-map'
  | 'tournament-series-decider'
  | 'interview-question'
  | 'family-crisis-step'
  | 'team-conflict-step'
  | 'ai-generated-step';

export type EventSequenceCondition =
  | { kind: 'series-score-reached'; wins: number }
  | { kind: 'context-flag'; key: string; value: unknown }
  | { kind: 'player-tag'; tag: string }
  | { kind: 'player-missing-tag'; tag: string };

export type EventSequenceContext = Record<string, unknown>;

export interface EventSequenceStep {
  id: string;
  eventId?: string;
  dynamicEventKind?: EventSequenceDynamicKind;
  generatedEvent?: GameEvent;
  completeSequenceAfter?: boolean;
  optional?: boolean;
  skipIf?: EventSequenceCondition;
}

export interface EventSequence {
  id: string;
  type: EventSequenceType;
  currentIndex: number;
  steps: EventSequenceStep[];
  startedRound: number;
  mustCompleteInCurrentRound: boolean;
  status: 'active' | 'completed' | 'cancelled';
  context: EventSequenceContext;
  cancelReason?: string;
}

export interface RoundResult {
  round: number;
  eventId: string;
  eventType: EventType;
  eventTitle: string;
  teamSnapshot?: RoundTeamSnapshot;
  choiceId: string;
  choiceLabel: string;
  success: boolean;
  resultTier?: ResultTier;
  roll: number;
  dc: number;
  naturalRoll?: number;
  narrative: string;
  statChanges: Partial<Stats>;
  newStats: Stats;
  stageBefore: Stage;
  stageAfter: Stage;
  tagsAdded: string[];
  tagsRemoved: string[];
  passiveEffects: string[];
  qualificationChanges: string[];
  stressChange: number;
  fameChange: number;
  feelChange: number;
  tiltChange: number;
  fatigueChange: number;
  buffsAdded: Buff[];
  matchStats?: MatchStats;
  sequenceId?: string;
  sequenceType?: EventSequenceType;
  sequenceStepIndex?: number;
  sequenceStepCount?: number;
  sequenceFinal?: boolean;
  createdAt: string;
}

export type SessionStatus = 'active' | 'ended';
export type RoundPhase = 'action' | 'event';

export interface PromotionCheck {
  canPromote: boolean;
  to?: Stage;
  reasons: string[];
}

export interface CareerGoalProgress {
  id: string;
  label: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface CareerGoalOpportunity {
  week: number;
  name: string;
  tier: string;
  available?: boolean;
  status?: string;
}

export interface CareerGoal {
  stage: Stage;
  stageLabel: string;
  summary: string;
  teamHint?: string;
  nextStageLabel?: string;
  goals: CareerGoalProgress[];
  opportunities: CareerGoalOpportunity[];
}

export interface GameSession {
  id: string;
  apiToken: string;
  player: Player;
  phase: RoundPhase;
  currentEvent: GameEvent | null;
  activeEventSequence?: EventSequence;
  history: RoundResult[];
  status: SessionStatus;
  ending?: string;
  createdAt: string;
  updatedAt: string;
  promotion?: PromotionCheck;
  careerGoal?: CareerGoal;
  leaderboard: LeaderboardTeam[];
  worldClubs?: WorldClubPool;
  worldClubsVersion?: number;
  debugTeamIdentity?: TeamIdentityDebug;
}

export interface SessionSummary {
  id: string;
  name: string;
  stage: Stage;
  round: number;
  status: SessionStatus;
  ending: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartGameResponse {
  sessionId: string;
  apiToken: string;
  player: Player;
  phase: RoundPhase;
  currentEvent: GameEvent | null;
  careerGoal?: CareerGoal;
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
  phase: RoundPhase;
  currentEvent: GameEvent | null;
  activeEventSequence?: EventSequence;
  status: SessionStatus;
  ending?: string;
  promotion?: PromotionCheck;
  careerGoal?: CareerGoal;
  leaderboard?: LeaderboardTeam[];
}

// ── 社区动态 ───────────────────────────────────────────────────
export type SocialPostAuthorType = 'teammate' | 'club' | 'rival' | 'media' | 'star' | 'industry' | 'fan';

export interface SocialPost {
  author: string;
  authorType: SocialPostAuthorType;
  handle: string;
  content: string;
}

// ── 派生属性（显示用）──────────────────────────────────────────
export interface DerivedStats {
  aim: number;       // 枪法 0-100  = agility*0.7 + experience*0.3 → /20*100
  gameSense: number; // 决策 0-100  = intelligence*0.7 + experience*0.3 → /20*100
  stability: number; // 稳定性 0-100 = mentality/20*100
  stamina: number;   // 续航 0-100   = constitution/20*100
}
