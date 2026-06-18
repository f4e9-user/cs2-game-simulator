// Mirror of shared/types.ts, kept in sync by hand for the MVP.

// ── 核心属性 key（旧 key 保留用于事件兼容）──────────────────────
export type StatKey =
  | 'intelligence'
  | 'agility'
  | 'experience'
  | 'money'
  | 'mentality'
  | 'constitution';

export type Stats = Record<StatKey, number>;

// ── 状态系统（高频变化、不永久影响核心属性）──────────────────────
export interface VolatileState {
  feel: number;    // -3 ~ +3  (手感冷热 Cold/Hot)
  tilt: number;    // 0 ~ 3    (心态波动 Tilt)
  fatigue: number; // 0 ~ 100  (疲劳)
}

// ── 临时 Buff ──────────────────────────────────────────────────
export interface Buff {
  id: string;
  label: string;
  actionTag: string;    // 'training' | 'ranked' | 'all'
  growthKey?: StatKey;  // 受益的属性 key
  growthMultiplier?: number;   // e.g. 1.3 = +30%
  fatigueGainMultiplier?: number; // 仅作用于正向疲劳增量
  stressGainMultiplier?: number;  // 仅作用于正向压力增量
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
  | 'routine'; // 每日行动（天梯/训练/休息/度假）

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
  startMoney?: number; // 初始资金覆盖（0-20 scale）
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
  generatedEvent?: EventDef;
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
  players?: string[]; // Key player handles for social feed
}

export type ClubTier = 'youth' | 'semi-pro' | 'pro' | 'top';
export type TournamentTier = 'c' | 'b' | 'a' | 's-open' | 's-closed' | 's-class' | 'major';

export type RosterStyle =
  | 'balanced'
  | 'tactical'
  | 'firepower'
  | 'development'
  | 'chaotic';

// ── 队友阵容系统 ────────────────────────────────────────────────
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

export interface ClubManagementModifiers {
  teamPracticeDc?: number;
  teamPracticeGrowthMultiplier?: number;
  teamMeetingDc?: number;
  lockerRoomTalkDc?: number;
  stressMultiplier?: number;
  fatigueMultiplier?: number;
}

export interface ClubPoliticsBias {
  callerWeight: number;
  starWeight: number;
  coachControl: number;
  conflictRisk: number;
}

export interface ClubProfile {
  clubId: string;
  rosterStyle: RosterStyle;
  roleBias: Partial<Record<TeammateRole, number>>;
  traitBias: Record<string, number>;
  personalityBias: Partial<Record<PersonalityTag, number>>;
  identityBias: Partial<Record<TeamIdentity, number>>;
  fitWeights: Partial<Record<StatKey, number>>;
  preferredTraitTags: string[];
  managementModifiers: ClubManagementModifiers;
  politicsBias: ClubPoliticsBias;
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
  | 'strict'      // 严格型：teamTrust 建立慢但上限高
  | 'supportive'  // 支持型：teamTrust 建立快，冲突少
  | 'star'        // 明星型：自我意识强，冲突频率高
  | 'grinder'     // 苦练型：稳定，低方差
  | 'drama';      // 戏精型：事件方差大

export interface TeammateStats {
  agility: number;
  intelligence: number;
  mentality: number;
  experience: number;
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
}

export interface RoleTransition {
  targetRole: TeammateRole;
  startedRound: number;
  resolveRound: number;
  stage?: 'suggested' | 'trial' | 'contested' | 'settling';
  source?: 'coach' | 'team-need' | 'player-choice' | 'performance';
}

export type RoleEventTheme =
  | 'calling'
  | 'space-taking'
  | 'utility'
  | 'late-round'
  | 'opening-duel'
  | 'resource-conflict'
  | 'adaptation';

export interface RoleProfile {
  role: TeammateRole;
  label: string;
  primaryStats: CoreStatKey[];
  secondaryStats: CoreStatKey[];
  preferredTraits: string[];
  riskTraits: string[];
  resultTags: string[];
  eventThemes: RoleEventTheme[];
  matchContributions: {
    primary: string;
    secondary: string;
    risk: string;
  };
  transitionCost: 'medium' | 'medium-high' | 'high';
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

export interface RoleDebug {
  fitScores: Record<TeammateRole, number>;
  pressure: number;
  crystallizeReady: boolean;
  crystallizeThreshold: number;
  activeRole: TeammateRole | null;
  preferredRole: TeammateRole | null;
  roleTransition: RoleTransition | null;
  activeRoleRounds: number;
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

export interface RosterNeed {
  neededRoles: TeammateRole[];
  neededIdentities: TeamIdentity[];
  reasons: string[];
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
  slotId: string;           // 即将离队的队友 id（'slot-1' … 'slot-4'）
  departureRound: number;   // 当前预测的离队回合
  rumorShown: boolean;      // 匿名预警事件（-7 回合）已触发
  revealed: boolean;        // 具名预警事件（-4 回合）已触发
  destTeamName: string;     // 目标俱乐部名称（来自 rivals）
  earlyRecruit: boolean;    // 玩家提前行动，新人质量更好
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
  consecutiveLosses: number;         // 连续赛事失利计数
  everHadTeam: boolean;               // 是否曾拥有过战队（用于结局判定）
  contractRenewals: number;           // 续约次数（用于 loyal-veteran 结局）
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

export interface Player extends DynamicState {
  name: string;
  stats: Stats;
  // ── 状态系统 ──
  volatile: VolatileState;
  // ── 手感上限（外设升级可提升，默认 3，范围 2.5~5）──
  feelCap: number;
  // ── 外设等级（0~4，决定下次购买价格）──
  peripheralTier: number;
  // ── Buff 系统 ──
  buffs: Buff[];
  // ── 成长上限追踪（生涯累计成长点数，上限 30）──
  growthSpent: number;
  // ──
  traits: string[];
  backgroundId: string;
  stage: Stage;
  round: number;
  tags: string[];
  tagExpiry: Record<string, number>; // tag → round number when it expires
  rivals: Rival[];
  tournamentParticipations: number;
  tournamentChampionships: number;
  tierParticipations: Record<string, number>;
  tierChampionships: Record<string, number>;
  championshipSeries?: Record<string, number>;
  promotionPending: Stage | null;
  promotionCooldown: number;
  pendingOffer: TeamOffer | null;
  ownedItems: string[];
  loans: Loan[];
  salaryTracker: SalaryTracker | null;
  pawnedItemIds: string[];
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

export type StatDelta = Partial<Omit<Stats, 'money'>>;
export type CoreStatKey = Exclude<StatKey, 'money'>;
export type CoreStatDelta = Partial<Record<CoreStatKey, number>>;

export interface StateDelta {
  feel?: number;
  tilt?: number;
  fatigue?: number;
  stress?: number;
}

export interface ResourceDelta {
  money?: number;
  fame?: number;
  points?: number;
  actionPoints?: number;
}

export interface ProgressionDelta {
  stageSet?: Stage;
  stageDelta?: number;
  teamTierSet?: ClubTier;
  injuryRestRounds?: number;
  endRun?: boolean;
  endReason?: string;
}

export interface TagDelta {
  add?: string[];
  remove?: string[];
  cooldowns?: Record<string, number>;
}

export interface EffectDelta {
  buffAdd?: Buff;
  buffRemoveId?: string;
  teamTrustDelta?: number;
  teamChemistryDelta?: number;
  targetTeammateChemistryDelta?: number;
  targetIdentity?: TeamIdentity;
  opposingTargetTeammateChemistryDelta?: number;
  opposingTargetIdentity?: TeamIdentity;
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
  | 'team-onboarding'
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
  generatedEvent?: EventDef;
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
  statChanges: StatDelta;   // 实际核心属性变化（极小，来自成长系统）
  newStats: Stats;
  stageBefore: Stage;
  stageAfter: Stage;
  tagsAdded: string[];
  tagsRemoved: string[];
  passiveEffects: string[];
  qualificationChanges: string[];
  stressChange: number;
  fameChange: number;
  // ── 新增：状态变化（主要展示项）──
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

export interface GameSession {
  id: string;
  apiToken: string;
  player: Player;
  phase: RoundPhase;
  currentEvent: GameEventPublic | null;
  activeEventSequence?: EventSequence;
  history: RoundResult[];
  status: SessionStatus;
  ending?: string;
  createdAt: string;
  updatedAt: string;
  leaderboard: LeaderboardTeam[];
  worldClubs?: WorldClubPool;
  worldClubsVersion?: number;
  debugTeamIdentity?: TeamIdentityDebug;
  debugRole?: RoleDebug;
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

// --- Internal-only engine types ---

export interface Outcome {
  narrative: string;
  coreGrowth?: CoreStatDelta;
  stateDelta?: StateDelta;
  resourceDelta?: ResourceDelta;
  progression?: ProgressionDelta;
  tags?: TagDelta;
  effects?: EffectDelta;
  dailyGrowth?: CoreStatKey;
}

export interface DetectionCheck {
  chanceByStage: Partial<Record<Stage, number>>;
}

export interface ChoiceDef {
  id: string;
  label: string;
  description: string;
  isRefusal?: boolean;
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

/**
 * 事件级叙事覆写元数据。
 * 用于覆盖事件类型默认的叙事语义，供 LLM Prompt 构建时注入精准的情感/冲突上下文。
 * 所有字段均为可选，未指定时 fallback 到事件类型默认元数据。
 */
export interface EventNarrativeOverride {
  eventId: string;
  emotionTone?: string;
  playerStance?: string;
  conflictType?: string;
  traitReactions?: Record<string, { emphasis: string[]; avoid: string[] }>;
  narrativeConstraints?: string[];
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
  narrativeMeta?: EventNarrativeOverride;
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AI?: unknown;
}

// ── 晋级检查 ──────────────────────────────────────────────────
export interface PromotionCheck {
  canPromote: boolean;
  to?: Stage;
  reasons: string[];
}
