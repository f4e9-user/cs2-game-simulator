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
  multiplier: number;   // e.g. 1.3 = +30%
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

export type ClubTier = 'youth' | 'semi-pro' | 'pro' | 'top';

// ── 队友阵容系统 ────────────────────────────────────────────────
export type TeammateRole = 'IGL' | 'AWPer' | 'Entry' | 'Support' | 'Lurker';

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
}

export interface RoleTransition {
  targetRole: TeammateRole;
  startedRound: number;
  resolveRound: number;
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
  slotId: string;           // 即将离队的队友 id（'slot-1' … 'slot-4'）
  departureRound: number;   // 实际离队回合
  rumorShown: boolean;      // 匿名预警事件（-7 回合）已触发
  revealed: boolean;        // 具名预警事件（-4 回合）已触发
  destTeamName: string;     // 目标俱乐部名称（来自 rivals）
  earlyRecruit: boolean;    // 玩家提前行动，新人质量更好
}

export type ForcedMatchResult = 'win' | 'loss';

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
  consecutiveLosses: number;         // 连续赛事失利计数
  everHadTeam: boolean;               // 是否曾拥有过战队（用于结局判定）
  contractRenewals: number;           // 续约次数（用于 loyal-veteran 结局）
  forceNextEvent: string | null;
  forceMatchResult: ForcedMatchResult | null;
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
  promotionPending: Stage | null;
  promotionCooldown: number;
  pendingOffer: TeamOffer | null;
  ownedItems: string[];
  roster: Teammate[] | null;
  preferredRole: TeammateRole | null;
  activeRole: TeammateRole | null;
  roleCrystallized: boolean;
  activeRoleRounds: number;
  roleTransition: RoleTransition | null;
  teamTrust: number;
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

export type StatDelta = Partial<Stats>;

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

export interface RoundResult {
  round: number;
  eventId: string;
  eventType: EventType;
  eventTitle: string;
  choiceId: string;
  choiceLabel: string;
  success: boolean;
  resultTier?: ResultTier;
  roll: number;
  dc: number;
  narrative: string;
  statChanges: StatDelta;   // 实际核心属性变化（极小，来自成长系统）
  newStats: Stats;
  stageBefore: Stage;
  stageAfter: Stage;
  tagsAdded: string[];
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
  createdAt: string;
}

export type SessionStatus = 'active' | 'ended';

export interface GameSession {
  id: string;
  apiToken: string;
  player: Player;
  currentEvent: GameEventPublic | null;
  history: RoundResult[];
  status: SessionStatus;
  ending?: string;
  createdAt: string;
  updatedAt: string;
  leaderboard: LeaderboardTeam[];
}

// --- Internal-only engine types ---

export interface Outcome {
  narrative: string;
  // 旧版属性变化（现在转译为状态效果，不直接改核心属性）
  statChanges?: StatDelta;
  tagAdds?: string[];
  tagRemoves?: string[];
  stageDelta?: number;
  stageSet?: Stage;
  teamTierSet?: ClubTier;
  endRun?: boolean;
  endReason?: string;
  stressDelta?: number;
  fameDelta?: number;
  injuryRestRounds?: number;
  pointsDelta?: number;
  // ── 新增：直接状态效果 ──
  feelDelta?: number;
  tiltDelta?: number;
  fatigueDelta?: number;
  moneyDelta?: number;
  // ── 新增：每日行动触发核心成长 ──
  dailyGrowth?: StatKey;  // 指定哪个核心属性从此次行动获得成长机会
  // ── 新增：添加 Buff ──
  buffAdd?: Buff;
  // ── 冷却 tag：key = tag 名称，value = 持续轮数（从本轮起算）──
  tagCooldowns?: Record<string, number>;
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
