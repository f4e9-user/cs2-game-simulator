import type { ChoiceDef, ClubTier, EventDef, Stage, StatDelta } from '../types.js';

export type TournamentTier =
  | 'netcafe'
  | 'city'
  | 'platform'
  | 'secondary-league'
  | 'development-league'
  | 'tier2'
  | 'tier1'
  | 'b'
  | 'a'
  | 's-open'
  | 's-closed'
  | 's-class'
  | 'major';

export type TournamentProgressionTier =
  | 'b'
  | 'a'
  | 's-qualifier'
  | 's-main'
  | 'major';

export type TournamentEntryType =
  | 'invite'
  | 'open_qualifier'
  | 'closed_qualifier'
  | 'direct_signup';

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

// One stage in the tournament progression. The synthesized match event for
// this stage uses (baseDifficulty + stage.difficultyBonus) and (totalReward *
// stage.rewardShare) when the player's run ends here.
export interface TournamentStage {
  name: string;
  difficultyBonus: number;
  // 0..1: portion of reward awarded if the player is eliminated *after winning*
  // this stage but losing the next one. The final stage means full reward on win.
  rewardShareOnEarlyExit: number;
}

// Default stage progressions by "depth": small tourneys are 1 stage, Major is 6.
const ONE_STAGE: TournamentStage[] = [
  { name: '决赛', difficultyBonus: 0, rewardShareOnEarlyExit: 0.4 },
];
const TWO_STAGE: TournamentStage[] = [
  { name: '入围赛', difficultyBonus: -1, rewardShareOnEarlyExit: 0.2 },
  { name: '决赛', difficultyBonus: 1, rewardShareOnEarlyExit: 0.5 },
];
const FOUR_STAGE: TournamentStage[] = [
  { name: '入围赛', difficultyBonus: -1, rewardShareOnEarlyExit: 0.1 },
  { name: '小组赛', difficultyBonus: 0, rewardShareOnEarlyExit: 0.25 },
  { name: '半决赛', difficultyBonus: 1, rewardShareOnEarlyExit: 0.5 },
  { name: '决赛', difficultyBonus: 2, rewardShareOnEarlyExit: 0.7 },
];
const SIX_STAGE: TournamentStage[] = [
  { name: '入围赛', difficultyBonus: -2, rewardShareOnEarlyExit: 0.05 },
  { name: '小组赛', difficultyBonus: -1, rewardShareOnEarlyExit: 0.15 },
  { name: '淘汰赛', difficultyBonus: 0, rewardShareOnEarlyExit: 0.3 },
  { name: '八强赛', difficultyBonus: 1, rewardShareOnEarlyExit: 0.5 },
  { name: '半决赛', difficultyBonus: 1, rewardShareOnEarlyExit: 0.7 },
  { name: '决赛', difficultyBonus: 2, rewardShareOnEarlyExit: 0.85 },
];

export interface Tournament {
  id: string;
  tier: TournamentTier;
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
  // Team leaderboard points required to enter (only checked for big events).
  pointsRequired?: number;
  // Weeks (1-48) when signup window is open. 'always' = every week.
  // The match itself fires the *next* week.
  signupWeeks: number[] | 'always';
  // Reward shape if you WIN the entire tournament (final stage success).
  reward: {
    money: number;
    experience: number;
    fame: number;
    points: number;        // leaderboard points
    stressDelta?: number;
  };
  baseDifficulty: number;
  difficulty: number;
  bracket: TournamentStage[];
}

const BASE_CALENDAR_YEAR = 2026;
const YEAR_CACHE = new Map<number, Tournament[]>();

const S_CITIES = ['Cologne', 'Katowice', 'Rio', 'Shanghai', 'Shenzhen', 'London', 'Singapore', 'Melbourne', 'Atlanta', 'Dallas', 'Abu Dhabi', 'Bucharest', 'Astana', 'Belgrade', 'Stockholm'];
const A_CITIES = ['Melbourne', 'Rotterdam', 'Chengdu', 'Dubai', 'Helsinki', 'Prague', 'Lisbon', 'Warsaw', 'Osaka', 'Kuala Lumpur'];
const B_CITIES = ['Chengdu', 'Wuhan', 'Hangzhou', 'Busan', 'Manila', 'Taipei', 'Krakow', 'Sofia', 'Brno', 'Porto'];
const REGIONS = ['Europe', 'North America', 'Asia', 'East Asia', 'South America', 'MENA'];

function displayYear(year: number): number {
  return BASE_CALENDAR_YEAR + year - 1;
}

function pickFrom<T>(arr: T[], index: number): T {
  return arr[((index % arr.length) + arr.length) % arr.length]!;
}

interface TournamentSeed {
  id: string;
  tier: TournamentTier;
  progressionTier: TournamentProgressionTier;
  entryType: TournamentEntryType;
  brand: string;
  subtype: string;
  displayName: string;
  description: string;
  stages: Stage[];
  teamRequirement?: ClubTier | null;
  fameRequired?: number;
  pointsRequired?: number;
  signupWeeks: number[] | 'always';
  reward: Tournament['reward'];
  baseDifficulty: number;
  bracket: TournamentStage[];
  seasonIndex?: number;
  city?: string;
  region?: string;
  qualificationTargets?: string[];
  qualificationRewards?: QualificationReward[];
  qualificationMilestones?: QualificationMilestone[];
}

function finalizeTournament(seed: TournamentSeed, year: number): Tournament {
  return {
    ...seed,
    year,
    name: seed.displayName,
    difficulty: seed.baseDifficulty,
  };
}

function reward(slot: string, count = 1): QualificationReward[] {
  return [{ slot, count }];
}

function milestone(
  stageIndex: number,
  label: string,
  rewards: QualificationReward[],
  requireWin = true,
): QualificationMilestone {
  return { stageIndex, label, rewards, requireWin };
}

const LEGACY_TOURNAMENTS: Tournament[] = [
  {
    id: 't-netcafe',
    tier: 'netcafe',
    name: '本地网吧赛',
    displayName: '本地网吧赛',
    description: '街边网吧的小型 BO1，奖金不多但能涨经验。',
    stages: ['rookie'],
    progressionTier: 'b',
    entryType: 'direct_signup',
    brand: 'Open Cup',
    subtype: 'local_open',
    year: 0,
    teamRequirement: null,
    signupWeeks: 'always',
    reward: { money: 10, experience: 2, fame: 1, points: 1 },
    baseDifficulty: 1,
    difficulty: 1,
    bracket: ONE_STAGE,
  },
  {
    id: 't-city',
    tier: 'city',
    name: '城市公开赛',
    displayName: '城市公开赛',
    description: '区域办的周末赛，混着主播和路人队。',
    stages: ['rookie', 'youth'],
    progressionTier: 'b',
    entryType: 'direct_signup',
    brand: 'City Masters',
    subtype: 'city_open',
    year: 0,
    teamRequirement: null,
    signupWeeks: [10, 22, 34, 46],
    reward: { money: 25, experience: 2, fame: 2, points: 2 },
    baseDifficulty: 2,
    difficulty: 2,
    bracket: TWO_STAGE,
  },
  {
    id: 't-platform',
    tier: 'platform',
    name: '平台赛 (Faceit/ESEA)',
    displayName: '平台赛 (Faceit/ESEA)',
    description: '线上分级赛事，输赢直接体现在 ELO 上。',
    stages: ['rookie', 'youth', 'second'],
    progressionTier: 'b',
    entryType: 'direct_signup',
    brand: 'Faceit Proving Series',
    subtype: 'platform_series',
    year: 0,
    teamRequirement: null,
    signupWeeks: 'always',
    reward: { money: 25, experience: 3, fame: 2, points: 2 },
    baseDifficulty: 2,
    difficulty: 2,
    bracket: TWO_STAGE,
  },
  {
    id: 't-secondary',
    tier: 'secondary-league',
    name: '次级联赛',
    displayName: '次级联赛',
    description: '俱乐部青训队的常规联赛。',
    stages: ['youth', 'second'],
    progressionTier: 'b',
    entryType: 'direct_signup',
    brand: 'Academy League',
    subtype: 'academy_league',
    year: 0,
    teamRequirement: 'youth',
    fameRequired: 6,
    signupWeeks: [6, 18, 30, 42],
    reward: { money: 40, experience: 4, fame: 4, points: 4 },
    baseDifficulty: 3,
    difficulty: 3,
    bracket: TWO_STAGE,
  },
  {
    id: 't-development',
    tier: 'development-league',
    name: '发展联赛',
    displayName: '发展联赛',
    description: '介于次级和职业之间，赢了能直接被一线队签下。',
    stages: ['youth', 'second'],
    progressionTier: 'a',
    entryType: 'direct_signup',
    brand: 'ESL Challenger League',
    subtype: 'challenger_league',
    year: 0,
    teamRequirement: 'semi-pro',
    fameRequired: 12,
    signupWeeks: [14, 38],
    reward: { money: 55, experience: 5, fame: 6, points: 6 },
    baseDifficulty: 3,
    difficulty: 3,
    bracket: FOUR_STAGE,
  },
  {
    id: 't-tier2',
    tier: 'tier2',
    name: 'Tier 2 邀请赛',
    displayName: 'Tier 2 邀请赛',
    description: '小型职业邀请赛，混着新晋职业队。',
    stages: ['second', 'pro'],
    progressionTier: 'a',
    entryType: 'direct_signup',
    brand: 'CCT',
    subtype: 'tier2_invite',
    year: 0,
    teamRequirement: 'pro',
    fameRequired: 18,
    pointsRequired: 5,
    signupWeeks: [10, 22, 34, 46],
    reward: { money: 70, experience: 5, fame: 8, points: 8, stressDelta: 1 },
    baseDifficulty: 4,
    difficulty: 4,
    bracket: FOUR_STAGE,
  },
  {
    id: 't-tier1',
    tier: 'tier1',
    name: 'Tier 1 国际邀请赛',
    displayName: 'Tier 1 国际邀请赛',
    description: '一线职业队互锤的赛季级邀请赛。',
    stages: ['pro'],
    progressionTier: 's-main',
    entryType: 'invite',
    brand: 'ESL Pro League',
    subtype: 'tier1_invite',
    year: 0,
    teamRequirement: 'pro',
    fameRequired: 30,
    pointsRequired: 15,
    signupWeeks: [8, 20, 32, 44],
    reward: { money: 110, experience: 6, fame: 14, points: 14, stressDelta: 2 },
    baseDifficulty: 4,
    difficulty: 4,
    bracket: FOUR_STAGE,
  },
  {
    id: 't-s-class',
    tier: 's-class',
    name: 'S 级赛事',
    displayName: 'S 级赛事',
    description: '顶级邀请赛，赢一次能让你被记住一年。',
    stages: ['pro'],
    progressionTier: 's-main',
    entryType: 'invite',
    brand: 'IEM',
    subtype: 's_class',
    year: 0,
    teamRequirement: 'top',
    fameRequired: 45,
    pointsRequired: 25,
    signupWeeks: [12, 36],
    reward: { money: 84, experience: 6, fame: 20, points: 22, stressDelta: 3 },
    baseDifficulty: 5,
    difficulty: 5,
    bracket: SIX_STAGE,
  },
  {
    id: 't-major',
    tier: 'major',
    name: 'Major 大赛',
    displayName: 'Major 大赛',
    description: '一年两届的桂冠赛，赢了就是写入历史。',
    stages: ['pro'],
    progressionTier: 'major',
    entryType: 'invite',
    brand: 'Major',
    subtype: 'major',
    year: 0,
    teamRequirement: 'top',
    fameRequired: 35,
    pointsRequired: 30,
    signupWeeks: [22, 46],
    reward: { money: 120, experience: 8, fame: 30, points: 30, stressDelta: 4 },
    baseDifficulty: 5,
    difficulty: 5,
    bracket: SIX_STAGE,
  },
];

function buildYearTournaments(year: number): Tournament[] {
  const cached = YEAR_CACHE.get(year);
  if (cached) return cached;

  const yyyy = displayYear(year);
  const proLeagueSeasonBase = (year - 1) * 2;
  const blastOpenSeasonBase = (year - 1) * 2;
  const blastRivalsSeasonBase = (year - 1) * 2;
  const blastBountySeasonBase = (year - 1) * 2;
  const challengerLeagueSeasonBase = (year - 1) * 2;
  const academyLeagueSeasonBase = (year - 1) * 2;
  const starSeriesBase = (year - 1) * 2;
  const fissureBase = (year - 1) * 2;
  const cctBase = (year - 1) * 3;
  const openCupBase = (year - 1) * 2;

  const seeds: TournamentSeed[] = [
    {
      id: `y${year}-b-01`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Academy League', subtype: 'academy_league',
      displayName: `Academy League Season ${academyLeagueSeasonBase + 1}`,
      description: '青训队的常规赛季，适合年轻选手稳定刷比赛经验。',
      stages: ['rookie', 'youth', 'second'], teamRequirement: 'youth', fameRequired: 3, signupWeeks: [2], reward: { money: 24, experience: 3, fame: 2, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, seasonIndex: academyLeagueSeasonBase + 1, qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-02`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'City Masters', subtype: 'city_masters',
      displayName: `City Masters ${pickFrom(B_CITIES, year)} ${yyyy}`,
      description: '地方舞台但曝光不错，常有主播队和路人强队混战。',
      stages: ['rookie', 'youth'], teamRequirement: null, signupWeeks: [3], reward: { money: 18, experience: 2, fame: 2, points: 1 }, baseDifficulty: 2, bracket: TWO_STAGE, city: pickFrom(B_CITIES, year), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-03`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Open Cup', subtype: 'regional_open',
      displayName: `Open Cup ${pickFrom(REGIONS, year)} #${openCupBase + 1}`,
      description: '地区公开赛，报名门槛低，适合新队冲击更高舞台。',
      stages: ['rookie', 'youth', 'second'], teamRequirement: null, signupWeeks: [5], reward: { money: 20, experience: 3, fame: 2, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, region: pickFrom(REGIONS, year), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-04`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Faceit Proving Series', subtype: 'platform_series',
      displayName: `Faceit Proving Series ${pickFrom(REGIONS, year + 1)}`,
      description: '高频线上 B 级赛，适合刷状态和补基础赛事量。',
      stages: ['rookie', 'youth', 'second'], teamRequirement: null, signupWeeks: [7], reward: { money: 18, experience: 3, fame: 2, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, region: pickFrom(REGIONS, year + 1), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-05`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Rising Stars Cup', subtype: 'rising_stars',
      displayName: `Rising Stars Cup ${pickFrom(REGIONS, year + 2)} ${yyyy}`,
      description: '给强青训和新队刷曝光的升级赛，节奏快、对抗直接。',
      stages: ['youth', 'second'], teamRequirement: 'youth', fameRequired: 4, signupWeeks: [9], reward: { money: 22, experience: 3, fame: 3, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, region: pickFrom(REGIONS, year + 2), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-06`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Campus Clash', subtype: 'campus_clash',
      displayName: `Campus Clash ${pickFrom(B_CITIES, year + 3)} ${yyyy}`,
      description: '偏地区化的青训赛事，适合补足 B 级冠军履历。',
      stages: ['rookie', 'youth'], teamRequirement: null, signupWeeks: [14], reward: { money: 16, experience: 2, fame: 2, points: 1 }, baseDifficulty: 2, bracket: TWO_STAGE, city: pickFrom(B_CITIES, year + 3), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-07`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Open Cup', subtype: 'regional_open',
      displayName: `Open Cup ${pickFrom(REGIONS, year + 4)} #${openCupBase + 2}`,
      description: '下半季前的地区公开赛，给二线边缘队冲 A 预选门票。',
      stages: ['youth', 'second'], teamRequirement: 'youth', fameRequired: 5, signupWeeks: [18], reward: { money: 22, experience: 3, fame: 3, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, region: pickFrom(REGIONS, year + 4), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-08`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Academy League', subtype: 'academy_league',
      displayName: `Academy League Season ${academyLeagueSeasonBase + 2}`,
      description: '下半程学院联赛，赛程稳定，适合培养中期新人。',
      stages: ['youth', 'second'], teamRequirement: 'youth', fameRequired: 6, signupWeeks: [31], reward: { money: 24, experience: 4, fame: 3, points: 3 }, baseDifficulty: 3, bracket: TWO_STAGE, seasonIndex: academyLeagueSeasonBase + 2, qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-09`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'City Masters', subtype: 'city_masters',
      displayName: `City Masters ${pickFrom(B_CITIES, year + 5)} ${yyyy}`,
      description: '年末前的地方线下赛，方便补 B 级参赛和冠军次数。',
      stages: ['rookie', 'youth', 'second'], teamRequirement: null, signupWeeks: [35], reward: { money: 20, experience: 3, fame: 2, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, city: pickFrom(B_CITIES, year + 5), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-b-10`, tier: 'b', progressionTier: 'b', entryType: 'direct_signup', brand: 'Faceit Proving Series', subtype: 'platform_series',
      displayName: `Faceit Proving Series ${pickFrom(REGIONS, year + 6)}`,
      description: '赛季末高频平台赛，适合抢最后一批 A 级门票。',
      stages: ['youth', 'second'], teamRequirement: 'youth', fameRequired: 6, signupWeeks: [41], reward: { money: 20, experience: 3, fame: 2, points: 2 }, baseDifficulty: 2, bracket: TWO_STAGE, region: pickFrom(REGIONS, year + 6), qualificationMilestones: [milestone(1, '夺冠', reward('a-open'))],
    },
    {
      id: `y${year}-a-open-01`, tier: 'a', progressionTier: 'a', entryType: 'open_qualifier', brand: 'ESL Challenger', subtype: 'open_qualifier',
      displayName: `ESL Challenger ${pickFrom(A_CITIES, year)} ${yyyy} Open Qualifier`,
      description: '通往 A 级正赛的公开预选，B 级打出成绩后从这里往上爬。',
      stages: ['youth', 'second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 6, pointsRequired: 3, signupWeeks: [4], reward: { money: 22, experience: 3, fame: 3, points: 3 }, baseDifficulty: 3, bracket: FOUR_STAGE, city: pickFrom(A_CITIES, year), qualificationTargets: ['a-open'], qualificationMilestones: [milestone(2, '晋级决赛', reward('a-main'))],
    },
    {
      id: `y${year}-a-01`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'ESL Challenger', subtype: 'challenger',
      displayName: `ESL Challenger ${pickFrom(A_CITIES, year)} ${yyyy}`,
      description: '二线顶级线下赛，表现出色就能摸到更高层资格。',
      stages: ['youth', 'second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 8, pointsRequired: 4, signupWeeks: [11], reward: { money: 36, experience: 4, fame: 5, points: 5 }, baseDifficulty: 3, bracket: FOUR_STAGE, city: pickFrom(A_CITIES, year), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('iem-open')), milestone(3, '夺冠加码', reward('iem-open'))],
    },
    {
      id: `y${year}-s-open-01`, tier: 's-open', progressionTier: 's-qualifier', entryType: 'open_qualifier', brand: 'IEM', subtype: 'open_qualifier',
      displayName: `IEM ${pickFrom(S_CITIES, year)} ${yyyy} Open Qualifier`,
      description: '顶级赛事公开预选，二线强队可以从这里开始冲主赛。',
      stages: ['second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 12, pointsRequired: 8, signupWeeks: [6], reward: { money: 28, experience: 4, fame: 5, points: 6, stressDelta: 1 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year), qualificationTargets: ['iem-open'], qualificationMilestones: [milestone(2, '晋级决赛', reward('iem-main'))],
    },
    {
      id: `y${year}-s-main-01`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'IEM', subtype: 'iem',
      displayName: `IEM ${pickFrom(S_CITIES, year + 1)} ${yyyy}`,
      description: '顶级国际大赛，赢一届就会被整个圈子记住。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 24, pointsRequired: 12, signupWeeks: [11], reward: { money: 70, experience: 6, fame: 10, points: 12, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year + 1), qualificationTargets: ['iem-main'], qualificationMilestones: [milestone(2, '晋级决赛', reward('iem-main'))],
    },
    {
      id: `y${year}-a-02`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'ESL Challenger League', subtype: 'challenger_league',
      displayName: `ESL Challenger League Season ${challengerLeagueSeasonBase + 1}`,
      description: '二线联赛主舞台，稳定拿分是冲击 S 级预选的关键。',
      stages: ['youth', 'second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 10, pointsRequired: 4, signupWeeks: [13], reward: { money: 40, experience: 5, fame: 5, points: 6 }, baseDifficulty: 3, bracket: FOUR_STAGE, seasonIndex: challengerLeagueSeasonBase + 1, qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('blast-closed')), milestone(3, '夺冠加码', reward('blast-closed'))],
    },
    {
      id: `y${year}-s-main-02`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'BLAST Bounty', subtype: 'blast_bounty',
      displayName: `BLAST Bounty Season ${blastBountySeasonBase + 1}`,
      description: '顶级奖金池赛事，邀请名单紧，压力也高。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 26, pointsRequired: 14, signupWeeks: [12], reward: { money: 72, experience: 6, fame: 10, points: 12, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, seasonIndex: blastBountySeasonBase + 1, qualificationMilestones: [milestone(2, '晋级决赛', reward('blast-main'))],
    },
    {
      id: `y${year}-major-01`, tier: 'major', progressionTier: 'major', entryType: 'invite', brand: 'IEM', subtype: 'major',
      displayName: `IEM ${pickFrom(S_CITIES, year + 2)} Major ${yyyy}`,
      description: '上半年 Major，进场本身就是实力与地位的证明。',
      stages: ['pro'], teamRequirement: 'top', fameRequired: 30, pointsRequired: 20, signupWeeks: [15], reward: { money: 110, experience: 7, fame: 18, points: 20, stressDelta: 3 }, baseDifficulty: 5, bracket: SIX_STAGE, city: pickFrom(S_CITIES, year + 2), qualificationTargets: ['iem-main'], qualificationMilestones: [milestone(3, '打进四强', reward('iem-main')), milestone(5, 'Major夺冠', reward('iem-main', 2))],
    },
    {
      id: `y${year}-a-03`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'CCT', subtype: 'cct',
      displayName: `CCT ${pickFrom(REGIONS, year + 3)} Series #${cctBase + 1}`,
      description: '高强度地区系列赛，强青训和二线职业队都会来抢分。',
      stages: ['youth', 'second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 10, pointsRequired: 5, signupWeeks: [16], reward: { money: 38, experience: 5, fame: 5, points: 6 }, baseDifficulty: 3, bracket: FOUR_STAGE, region: pickFrom(REGIONS, year + 3), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('blast-closed'))],
    },
    {
      id: `y${year}-a-open-02`, tier: 'a', progressionTier: 'a', entryType: 'open_qualifier', brand: 'Regional Masters', subtype: 'open_qualifier',
      displayName: `Regional Masters ${pickFrom(REGIONS, year + 4)} ${yyyy} Open Qualifier`,
      description: '下半年 A 级公开预选，给二线和强青训一个冲正赛的入口。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 10, pointsRequired: 5, signupWeeks: [21], reward: { money: 24, experience: 3, fame: 3, points: 3 }, baseDifficulty: 3, bracket: FOUR_STAGE, region: pickFrom(REGIONS, year + 4), qualificationTargets: ['a-open'], qualificationMilestones: [milestone(2, '晋级决赛', reward('a-main'))],
    },
    {
      id: `y${year}-a-09`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'Galaxy Battle', subtype: 'galaxy_battle',
      displayName: `Galaxy Battle ${pickFrom(A_CITIES, year + 6)} ${yyyy}`,
      description: '年中额外补充的 A 级线下赛，给二线队更稳定的比赛密度。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 12, pointsRequired: 6, signupWeeks: [29], reward: { money: 42, experience: 5, fame: 6, points: 6 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(A_CITIES, year + 6), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('pgl-open'))],
    },
    {
      id: `y${year}-a-open-03`, tier: 'a', progressionTier: 'a', entryType: 'open_qualifier', brand: 'Champion of Champions Tour', subtype: 'open_qualifier',
      displayName: `Champion of Champions Tour ${pickFrom(REGIONS, year + 7)} Open Qualifier`,
      description: '赛季后段的 A 公开预选，给冲刺队伍最后一次爬升机会。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 11, pointsRequired: 5, signupWeeks: [34], reward: { money: 24, experience: 3, fame: 3, points: 3 }, baseDifficulty: 3, bracket: FOUR_STAGE, region: pickFrom(REGIONS, year + 7), qualificationTargets: ['a-open'], qualificationMilestones: [milestone(2, '晋级决赛', reward('a-main'))],
    },
    {
      id: `y${year}-a-10`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'YaLLa Compass', subtype: 'yalla_compass',
      displayName: `YaLLa Compass ${pickFrom(A_CITIES, year + 7)} ${yyyy}`,
      description: '补强下半年的 A 级赛程密度，避免二线阶段断档。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 14, pointsRequired: 7, signupWeeks: [38], reward: { money: 44, experience: 5, fame: 6, points: 7 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(A_CITIES, year + 7), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('blast-closed'))],
    },
    {
      id: `y${year}-a-11`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'Regional Masters', subtype: 'regional_masters',
      displayName: `Regional Masters ${pickFrom(REGIONS, year + 8)} ${yyyy}`,
      description: '赛季尾声的 A 级地区赛，给 PGL 链最后一轮补票机会。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 15, pointsRequired: 8, signupWeeks: [45], reward: { money: 44, experience: 5, fame: 6, points: 7 }, baseDifficulty: 4, bracket: FOUR_STAGE, region: pickFrom(REGIONS, year + 8), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('pgl-open'))],
    },
    {
      id: `y${year}-s-closed-01`, tier: 's-closed', progressionTier: 's-qualifier', entryType: 'closed_qualifier', brand: 'BLAST Open', subtype: 'closed_qualifier',
      displayName: `BLAST Open ${pickFrom(S_CITIES, year + 3)} Season ${blastOpenSeasonBase + 1} Closed Qualifier`,
      description: 'S 级封闭预选，差一步就能进主舞台。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 16, pointsRequired: 10, signupWeeks: [18], reward: { money: 34, experience: 4, fame: 6, points: 7, stressDelta: 1 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year + 3), seasonIndex: blastOpenSeasonBase + 1, qualificationTargets: ['blast-closed'], qualificationMilestones: [milestone(2, '晋级决赛', reward('blast-main'))],
    },
    {
      id: `y${year}-s-main-03`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'ESL Pro League', subtype: 'pro_league',
      displayName: `ESL Pro League Season ${proLeagueSeasonBase + 1}`,
      description: '顶级联赛循环，考验的是整段赛程的稳定性。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 28, pointsRequired: 15, signupWeeks: [20], reward: { money: 76, experience: 6, fame: 11, points: 13, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, seasonIndex: proLeagueSeasonBase + 1, qualificationMilestones: [milestone(2, '晋级决赛', reward('s-main'))],
    },
    {
      id: `y${year}-a-04`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'YaLLa Compass', subtype: 'yalla_compass',
      displayName: `YaLLa Compass ${pickFrom(A_CITIES, year + 1)} ${yyyy}`,
      description: '中东风格的高奖金挑战赛，二线队很爱来抢曝光。',
      stages: ['youth', 'second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 12, pointsRequired: 6, signupWeeks: [25], reward: { money: 42, experience: 5, fame: 6, points: 6 }, baseDifficulty: 3, bracket: FOUR_STAGE, city: pickFrom(A_CITIES, year + 1), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('blast-closed'))],
    },
    {
      id: `y${year}-s-main-04`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'BLAST Open', subtype: 'blast_open',
      displayName: `BLAST Open ${pickFrom(S_CITIES, year + 4)} Season ${blastOpenSeasonBase + 1}`,
      description: 'BLAST 正赛站点，赛制凶，关注度也凶。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 28, pointsRequired: 16, signupWeeks: [24], reward: { money: 78, experience: 6, fame: 11, points: 13, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year + 4), seasonIndex: blastOpenSeasonBase + 1, qualificationTargets: ['blast-main'], qualificationMilestones: [milestone(2, '晋级决赛', reward('blast-main'))],
    },
    {
      id: `y${year}-a-05`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'Regional Masters', subtype: 'regional_masters',
      displayName: `Regional Masters ${pickFrom(REGIONS, year + 4)} ${yyyy}`,
      description: '地区头名争夺战，赢了就能直接抬身价。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 14, pointsRequired: 6, signupWeeks: [27], reward: { money: 44, experience: 5, fame: 6, points: 7 }, baseDifficulty: 4, bracket: FOUR_STAGE, region: pickFrom(REGIONS, year + 4), qualificationTargets: ['a-main'], qualificationMilestones: [milestone(1, '晋级四强', reward('pgl-open'))],
    },
    {
      id: `y${year}-s-main-05`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'FISSURE Playground', subtype: 'fissure',
      displayName: `FISSURE Playground #${fissureBase + 1}`,
      description: '高对抗度国际赛，队伍都爱拿来检验版本理解。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 30, pointsRequired: 16, signupWeeks: [28], reward: { money: 78, experience: 6, fame: 11, points: 13, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, seasonIndex: fissureBase + 1, qualificationMilestones: [milestone(2, '晋级决赛', reward('s-main'))],
    },
    {
      id: `y${year}-a-06`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'Champion of Champions Tour', subtype: 'cct_alt',
      displayName: `Champion of Champions Tour ${pickFrom(REGIONS, year + 5)}`,
      description: '积分赛味道很浓的一站，适合想稳步攒排名的队伍。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 14, pointsRequired: 7, signupWeeks: [30], reward: { money: 44, experience: 5, fame: 6, points: 7 }, baseDifficulty: 4, bracket: FOUR_STAGE, region: pickFrom(REGIONS, year + 5), qualificationMilestones: [milestone(1, '晋级四强', reward('pgl-open'))],
    },
    {
      id: `y${year}-s-open-02`, tier: 's-open', progressionTier: 's-qualifier', entryType: 'open_qualifier', brand: 'PGL', subtype: 'open_qualifier',
      displayName: `PGL ${pickFrom(S_CITIES, year + 5)} ${yyyy} Open Qualifier`,
      description: '下半年公开预选，野心足的二线队都会来赌一次。',
      stages: ['second', 'pro'], teamRequirement: 'semi-pro', fameRequired: 14, pointsRequired: 9, signupWeeks: [32], reward: { money: 30, experience: 4, fame: 5, points: 6, stressDelta: 1 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year + 5), qualificationTargets: ['pgl-open'], qualificationMilestones: [milestone(2, '晋级决赛', reward('pgl-closed'))],
    },
    {
      id: `y${year}-s-main-06`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'Esports World Cup', subtype: 'ewc',
      displayName: `Esports World Cup ${yyyy}`,
      description: '超级奖金池赛事，所有人都会认真备战。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 32, pointsRequired: 18, signupWeeks: [34], reward: { money: 84, experience: 6, fame: 12, points: 14, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, qualificationMilestones: [milestone(2, '晋级决赛', reward('s-main'))],
    },
    {
      id: `y${year}-a-07`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'ESL Challenger League', subtype: 'challenger_league',
      displayName: `ESL Challenger League Season ${challengerLeagueSeasonBase + 2}`,
      description: '下半年 Challenger League，二线冲分最密集的时段。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 16, pointsRequired: 8, signupWeeks: [36], reward: { money: 46, experience: 5, fame: 6, points: 7 }, baseDifficulty: 4, bracket: FOUR_STAGE, seasonIndex: challengerLeagueSeasonBase + 2, qualificationMilestones: [milestone(1, '晋级四强', reward('blast-closed'))],
    },
    {
      id: `y${year}-s-main-07`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'BLAST Rivals', subtype: 'blast_rivals',
      displayName: `BLAST Rivals ${pickFrom(S_CITIES, year + 6)} Season ${blastRivalsSeasonBase + 1}`,
      description: '对手都很熟，细节被放大，失误就会被惩罚。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 32, pointsRequired: 18, signupWeeks: [39], reward: { money: 82, experience: 6, fame: 12, points: 14, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year + 6), seasonIndex: blastRivalsSeasonBase + 1, qualificationTargets: ['blast-main'], qualificationMilestones: [milestone(2, '晋级决赛', reward('blast-main'))],
    },
    {
      id: `y${year}-s-main-08`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'CS Asia Championships', subtype: 'asian_championship',
      displayName: `CS Asia Championships ${yyyy}`,
      description: '亚洲最高规格之一，区域豪强都会准时集合。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 30, pointsRequired: 17, signupWeeks: [40], reward: { money: 80, experience: 6, fame: 12, points: 14, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, region: 'Asia', qualificationMilestones: [milestone(2, '晋级决赛', reward('s-main'))],
    },
    {
      id: `y${year}-a-08`, tier: 'a', progressionTier: 'a', entryType: 'direct_signup', brand: 'Thunderpick World Championship Qualifier', subtype: 'thunderpick',
      displayName: 'Thunderpick World Championship Qualifier',
      description: '偏线上但竞争很足，很多职业边缘队拿它救全年。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 16, pointsRequired: 8, signupWeeks: [42], reward: { money: 42, experience: 5, fame: 6, points: 7 }, baseDifficulty: 4, bracket: FOUR_STAGE, qualificationMilestones: [milestone(1, '晋级四强', reward('pgl-open'))],
    },
    {
      id: `y${year}-s-closed-02`, tier: 's-closed', progressionTier: 's-qualifier', entryType: 'closed_qualifier', brand: 'PGL', subtype: 'closed_qualifier',
      displayName: `PGL ${pickFrom(S_CITIES, year + 7)} ${yyyy} Closed Qualifier`,
      description: 'Major 前哨战，许多职业边缘队都会被逼到极限。',
      stages: ['second', 'pro'], teamRequirement: 'pro', fameRequired: 18, pointsRequired: 10, signupWeeks: [43], reward: { money: 34, experience: 4, fame: 6, points: 7, stressDelta: 1 }, baseDifficulty: 4, bracket: FOUR_STAGE, city: pickFrom(S_CITIES, year + 7), qualificationTargets: ['pgl-closed'], qualificationMilestones: [milestone(2, '晋级决赛', reward('pgl-main'))],
    },
    {
      id: `y${year}-major-02`, tier: 'major', progressionTier: 'major', entryType: 'invite', brand: 'PGL', subtype: 'major',
      displayName: `PGL ${pickFrom(S_CITIES, year + 8)} Major ${yyyy}`,
      description: '年终 Major，拿下就是真正写进历史。',
      stages: ['pro'], teamRequirement: 'top', fameRequired: 34, pointsRequired: 22, signupWeeks: [48], reward: { money: 120, experience: 8, fame: 20, points: 22, stressDelta: 3 }, baseDifficulty: 5, bracket: SIX_STAGE, city: pickFrom(S_CITIES, year + 8), qualificationTargets: ['pgl-main'], qualificationMilestones: [milestone(3, '打进四强', reward('pgl-main')), milestone(5, 'Major夺冠', reward('pgl-main', 2))],
    },
    {
      id: `y${year}-s-main-09`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'StarLadder StarSeries', subtype: 'starseries',
      displayName: `StarLadder StarSeries S${starSeriesBase + 1}`,
      description: '传统强赛，老牌豪门和新贵都想来这里站稳脚跟。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 30, pointsRequired: 18, signupWeeks: [46], reward: { money: 80, experience: 6, fame: 12, points: 14, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, seasonIndex: starSeriesBase + 1, qualificationMilestones: [milestone(2, '晋级决赛', reward('s-main'))],
    },
    {
      id: `y${year}-s-main-10`, tier: 's-class', progressionTier: 's-main', entryType: 'invite', brand: 'ESL Pro League', subtype: 'pro_league',
      displayName: `ESL Pro League Season ${proLeagueSeasonBase + 2}`,
      description: '年末 EPL，队伍状态、深度与执行力都会被彻底检验。',
      stages: ['pro'], teamRequirement: 'pro', fameRequired: 32, pointsRequired: 18, signupWeeks: [47], reward: { money: 82, experience: 6, fame: 12, points: 14, stressDelta: 2 }, baseDifficulty: 4, bracket: FOUR_STAGE, seasonIndex: proLeagueSeasonBase + 2, qualificationMilestones: [milestone(2, '晋级决赛', reward('s-main'))],
    },
  ];

  const built = seeds.map((seed) => finalizeTournament(seed, year));
  YEAR_CACHE.set(year, built);
  return built;
}

export function getTournament(id: string): Tournament | undefined {
  const generatedYear = /^y(\d+)-/.exec(id)?.[1];
  if (generatedYear) {
    const year = Number(generatedYear);
    return buildYearTournaments(year).find((t) => t.id === id);
  }
  return LEGACY_TOURNAMENTS.find((t) => t.id === id);
}

// --- Stage-contextual match decision system ---

type StagePhase = 'opening' | 'crunch' | 'finale';
type TierGroup = 'rookie' | 'circuit' | 'pro' | 'elite';

function getPhase(stageIndex: number, isFinal: boolean): StagePhase {
  if (isFinal) return 'finale';
  if (stageIndex === 0) return 'opening';
  return 'crunch';
}

function getTierGroup(tier: TournamentTier): TierGroup {
  if (tier === 'netcafe' || tier === 'city' || tier === 'platform' || tier === 'b') return 'rookie';
  if (tier === 'secondary-league' || tier === 'development-league' || tier === 'a') return 'circuit';
  if (tier === 'tier2' || tier === 'tier1' || tier === 's-open' || tier === 's-closed') return 'pro';
  return 'elite';
}

const STAGE_NARRATIVES: Record<StagePhase, Record<TierGroup, string>> = {
  opening: {
    rookie: '对面是本地老手，积分一路打上来的。你在候场区翻了翻他们的对局记录。',
    circuit: '联赛首场，对面已经提前备战一周。场边几个俱乐部星探在旁观，你感觉得到。',
    pro: '直播开场，弹幕涌入。你在备战区盯着对手的数据页，分析他们上一场的 demo。',
    elite: '主舞台首秀。灯光还没全亮，你已经感觉到现场观众的低频嗡嗡声。',
  },
  crunch: {
    rookie: '打到这一步，队友悄悄告诉你他手腕有点不对劲。再输就淘汰了。',
    circuit: '淘汰赛压力上来了。教练在暂停时要求换战术，你有几秒钟做决定。',
    pro: '对面开始针对你的打法，分析师在耳机里给你提示。改还是不改？',
    elite: '中盘胶着，观众席安静下来。对方暂停结束，你必须做出选择。',
  },
  finale: {
    rookie: '决赛！奖金不多，但这是你打过最大的舞台。紧不紧张只有自己知道。',
    circuit: '决赛对面是联赛顶队，赢了能直接被签下。你感觉手指没有平时那么灵。',
    pro: '大场决赛。弹幕全是你的名字，直播间气氛把你的心率推上去了。',
    elite: '万人馆，决赛局。对面上台时全场爆出欢呼声。你戴上耳机，按下准备。',
  },
};

function buildOpeningChoices(
  diff: number,
  isFinal: boolean,
  winReward: StatDelta,
  winFame: number,
  winStress: number,
  lossReward: StatDelta,
  lossFame: number,
  lossStress: number,
  advanceNote: string,
  winNarrative: string,
): ChoiceDef[] {
  return [
    {
      id: 'scout-play',
      label: '战术研究：针对对手的打法备战',
      description: '赛前分析找到弱点，靠战术开局。成功后额外 +1 积分。',
      check: {
        primary: 'intelligence',
        secondary: 'experience',
        dc: 8 + diff,
        traitBonuses: { tactical: 3, igl: 2, steady: 1 },
      },
      success: {
        narrative: '分析到位，开局就打出了针对性压制，对面措手不及。' + advanceNote,
        statChanges: { ...winReward, intelligence: (winReward.intelligence ?? 0) + 1 },
        fameDelta: Math.floor(winFame * 0.9),
        stressDelta: winStress - 1,
        pointsDelta: 1,
        tagAdds: isFinal ? ['tournament-winner'] : [],
      },
      failure: {
        narrative: '对面提前有应对方案，你们的战术被逐一拆解。',
        statChanges: lossReward,
        fameDelta: lossFame,
        stressDelta: lossStress,
      },
    },
    {
      id: 'peak-form',
      label: '用状态说话：今天手感不错，放开打',
      description: '相信个人发挥，高风险高收益。',
      check: {
        primary: 'agility',
        secondary: 'mentality',
        dc: 10 + diff,
        traitBonuses: { mechanical: 2, clutch: 2, aimer: 2 },
        traitPenalties: { fragile: 1 },
      },
      success: {
        narrative: isFinal ? winNarrative : '手感在线，开局个人数据领先，队伍节奏也上来了。' + advanceNote,
        statChanges: winReward,
        fameDelta: winFame,
        stressDelta: winStress,
        tagAdds: isFinal ? ['tournament-winner', 'highlight-clip'] : [],
      },
      failure: {
        narrative: '状态没跟上预期，关键枪被对面压住，开局就落入被动。',
        statChanges: lossReward,
        fameDelta: lossFame,
        stressDelta: lossStress,
      },
    },
    {
      id: 'steady-start',
      label: '稳扎稳打：先别冒险，把基础打扎实',
      description: '降低翻车概率，收益会少一些。',
      check: {
        primary: 'experience',
        dc: 7 + diff,
        traitBonuses: { steady: 3, support: 1 },
      },
      success: {
        narrative: isFinal
          ? '稳扎稳打走完全程，靠经验拿下冠军。'
          : '节奏稳住，对面没找到破绽，晋级。' + advanceNote,
        statChanges: {
          experience: Math.max(1, Math.floor((winReward.experience ?? 1) * 0.8)),
          money: Math.max(0, Math.floor((winReward.money ?? 0) * 0.8)),
        },
        fameDelta: Math.floor(winFame * 0.7),
        stressDelta: 0,
        tagAdds: isFinal ? ['tournament-winner'] : [],
      },
      failure: {
        narrative: '保守过头，被对面找到节奏咬住，最终没能翻身。',
        statChanges: { ...lossReward, money: 0 },
        fameDelta: -1,
        stressDelta: Math.max(1, lossStress - 1),
      },
    },
  ];
}

function buildCrunchChoices(
  diff: number,
  isFinal: boolean,
  winReward: StatDelta,
  winFame: number,
  winStress: number,
  lossReward: StatDelta,
  lossFame: number,
  lossStress: number,
  advanceNote: string,
  winNarrative: string,
): ChoiceDef[] {
  return [
    {
      id: 'resource-share',
      label: '让枪给队友：自己空枪，把资源交给主力',
      description: '牺牲个人经济扶主力 carry，成功额外 +2 积分，但个人金钱奖励减半。',
      check: {
        primary: 'intelligence',
        dc: 8 + diff,
        traitBonuses: { support: 3, selfless: 2, igl: 1 },
        traitPenalties: { ego: 2, solo: 1 },
      },
      success: {
        narrative: '队友接住了你让的枪，打出了名场面。积分板上差距拉开了。' + advanceNote,
        statChanges: {
          experience: Math.max(1, Math.floor((winReward.experience ?? 1) * 0.8)),
          money: Math.max(0, Math.floor((winReward.money ?? 0) * 0.5)),
        },
        fameDelta: Math.floor(winFame * 0.8),
        stressDelta: -2,
        pointsDelta: 2,
        tagAdds: isFinal ? ['tournament-winner'] : [],
      },
      failure: {
        narrative: '队友没接住，你空枪被打爆，资源白让了这局白给了。',
        statChanges: { ...lossReward, mentality: (lossReward.mentality ?? 0) - 1 },
        fameDelta: lossFame - 1,
        stressDelta: lossStress + 2,
      },
    },
    {
      id: 'play-through-pain',
      label: '带伤硬上：身体没到最佳状态，但这局没人能替',
      description: '强撑上场，成功有体质损耗，失败可能加重伤势被迫休养。',
      check: {
        primary: 'constitution',
        secondary: 'mentality',
        dc: 10 + diff,
        traitBonuses: { grinder: 2, obsessed: 1 },
        traitPenalties: { fragile: 3 },
      },
      success: {
        narrative: '你咬牙撑过去，收掉了几个关键枪，耳麦里队友在喊你。' + advanceNote,
        statChanges: { ...winReward, constitution: (winReward.constitution ?? 0) - 1 },
        fameDelta: winFame + 2,
        stressDelta: -1,
        tagAdds: isFinal ? ['tournament-winner', 'highlight-clip'] : [],
      },
      failure: {
        narrative: '身体在关键回合突然加重，发挥受影响拖累了全队。',
        statChanges: { ...lossReward, constitution: (lossReward.constitution ?? 0) - 2 },
        fameDelta: lossFame,
        stressDelta: lossStress + 2,
        injuryRestRounds: 1,
      },
    },
    {
      id: 'tactical-switch',
      label: '临场换战术：放弃原计划，根据对手即时调整',
      description: '教练建议换打法，考验临场应变和执行力。',
      check: {
        primary: 'intelligence',
        secondary: 'experience',
        dc: 9 + diff,
        traitBonuses: { tactical: 3, igl: 2 },
        traitPenalties: { obsessed: 1 },
      },
      success: {
        narrative: '临场应变打乱了对手的预判，你们的反击打得漂亮。' + advanceNote,
        statChanges: { ...winReward, intelligence: (winReward.intelligence ?? 0) + 1 },
        fameDelta: winFame,
        stressDelta: winStress,
        tagAdds: isFinal ? ['tournament-winner'] : [],
      },
      failure: {
        narrative: '临场换战术执行太仓促，队员之间信号混乱，被对面抓住破绽。',
        statChanges: lossReward,
        fameDelta: lossFame,
        stressDelta: lossStress,
      },
    },
  ];
}

function buildFinaleChoices(
  diff: number,
  winReward: StatDelta,
  winFame: number,
  lossReward: StatDelta,
  lossFame: number,
  lossStress: number,
  winNarrative: string,
): ChoiceDef[] {
  return [
    {
      id: 'clutch-time',
      label: '关键时刻决死：让压力变成武器，自己扛',
      description: '最高风险最高收益。赢了名气 +5、额外 +2 积分；输了压力暴涨。',
      check: {
        primary: 'agility',
        secondary: 'mentality',
        dc: 12 + diff,
        traitBonuses: { clutch: 4, mechanical: 2, aimer: 1 },
        traitPenalties: { fragile: 2, steady: 1 },
      },
      success: {
        narrative: '你打出了本届最高光时刻，全场爆发欢呼声。' + winNarrative,
        statChanges: {
          ...winReward,
          agility: (winReward.agility ?? 0) + 1,
          mentality: (winReward.mentality ?? 0) + 1,
        },
        fameDelta: winFame + 5,
        stressDelta: -3,
        pointsDelta: 2,
        tagAdds: ['tournament-winner', 'highlight-clip'],
      },
      failure: {
        narrative: '压力在决赛把你压垮了，手开始颤，回合走不出去。',
        statChanges: { ...lossReward, mentality: (lossReward.mentality ?? 0) - 2 },
        fameDelta: lossFame - 1,
        stressDelta: lossStress + 5,
      },
    },
    {
      id: 'pressure-control',
      label: '心态制胜：把注意力从结果移开，专注过程',
      description: '压力管理优先。赢了压力大幅下降，输了也不会崩得太难看。',
      check: {
        primary: 'mentality',
        secondary: 'experience',
        dc: 9 + diff,
        traitBonuses: { steady: 3, clutch: 1 },
        traitPenalties: { fragile: 2 },
      },
      success: {
        narrative: '你保持住了情绪，稳健走完全程，对手急了你没急。' + winNarrative,
        statChanges: winReward,
        fameDelta: winFame,
        stressDelta: -3,
        tagAdds: ['tournament-winner'],
      },
      failure: {
        narrative: '决赛心理关没过，越想放松越紧张，最终输在心态上。',
        statChanges: { ...lossReward, mentality: (lossReward.mentality ?? 0) - 1 },
        fameDelta: lossFame,
        stressDelta: lossStress + 3,
      },
    },
    {
      id: 'system-execute',
      label: '执行体系：靠训练赛打出来的体系拿冠军',
      description: '信任团队，按体系走完最后一步。稳健中等收益。',
      check: {
        primary: 'intelligence',
        secondary: 'experience',
        dc: 9 + diff,
        traitBonuses: { igl: 3, tactical: 2, support: 2, steady: 1 },
      },
      success: {
        narrative: '体系打得行云流水，对手的反应比你们慢了半步。' + winNarrative,
        statChanges: { ...winReward, intelligence: (winReward.intelligence ?? 0) + 1 },
        fameDelta: winFame,
        stressDelta: 0,
        tagAdds: ['tournament-winner'],
      },
      failure: {
        narrative: '体系被提前读透，临场没有 plan B，被人追过去。',
        statChanges: { ...lossReward, experience: (lossReward.experience ?? 0) + 1 },
        fameDelta: lossFame + 1,
        stressDelta: lossStress,
      },
    },
  ];
}

// Synthesize an EventDef for a specific stage of a tournament.
// A single "上场" choice is returned; the actual outcome is determined by
// matchSimulator.simulateMatch in applyChoice, not by a d20 roll.
export function synthesizeMatchEvent(
  t: Tournament,
  stageIndex: number,
): EventDef {
  const stage = t.bracket[stageIndex] ?? t.bracket[0]!;
  const isFinal = stageIndex === t.bracket.length - 1;
  const diff = t.baseDifficulty + stage.difficultyBonus;
  const nextStageName = !isFinal ? t.bracket[stageIndex + 1]!.name : '';

  const phase = getPhase(stageIndex, isFinal);
  const tierGroup = getTierGroup(t.tier);
  const narrative = `《${t.name}》${stage.name}。${STAGE_NARRATIVES[phase][tierGroup]}`;

  const choices: ChoiceDef[] = [
    {
      id: 'match-play',
      label: '上场比赛',
      description: isFinal
        ? '决赛，全力以赴。'
        : `赢下晋级${nextStageName ? `，进入${nextStageName}` : '下一阶段'}。`,
      // dc=0: 实际胜负由 matchSimulator 决定，resolveChoice 不会被调用
      check: { primary: 'agility', dc: 0 },
      success: { narrative: '' }, // 由 simulateMatch.summary 覆盖
      failure: { narrative: '' },
    },
  ];

  return {
    id: `tournament-${t.id}--${stageIndex}`,
    type: 'match',
    title: `${t.name} · ${stage.name}`,
    narrative,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: diff,
    weight: 1,
    choices,
  };
}

// Tournaments whose signup window is OPEN this week for the player's stage,
// taking the fame and points gates into account.
export function tournamentsOpenForSignup(
  stage: Stage,
  fame: number,
  points: number,
  week: number,
  year: number,
  qualificationSlots: Record<string, number>,
): Tournament[] {
  return buildYearTournaments(year).filter((t) => {
    if (!t.stages.includes(stage)) return false;
    if (t.fameRequired !== undefined && fame < t.fameRequired) return false;
    if (t.pointsRequired !== undefined && points < t.pointsRequired) return false;
    if (t.qualificationTargets?.length) {
      const hasTarget = t.qualificationTargets.some((slot) => {
        const specific = qualificationSlots[slot] ?? 0;
        const generic = qualificationSlots[`s-${slot.split('-')[1]}`] ?? 0;
        return specific > 0 || generic > 0;
      });
      if (!hasTarget) return false;
    }
    if (t.signupWeeks === 'always') return true;
    return t.signupWeeks.includes(week);
  });
}

// Bracket length (number of stages) for a tournament — used by frontend to
// show "X / Y" progress.
export function tournamentBracketLength(t: Tournament): number {
  return t.bracket.length;
}

// Win-points + win-fame at this stage (leaderboard simulation might use this).
export function stageRewardDelta(
  t: Tournament,
  stageIndex: number,
  won: boolean,
): { points: number; fame: number } {
  const stage = t.bracket[stageIndex] ?? t.bracket[0]!;
  const isFinal = stageIndex === t.bracket.length - 1;
  if (won) {
    return isFinal
      ? { points: t.reward.points, fame: t.reward.fame }
      : {
          points: Math.floor(t.reward.points / 4),
          fame: Math.floor(t.reward.fame / 5),
        };
  }
  return {
    points: Math.floor(t.reward.points * stage.rewardShareOnEarlyExit),
    fame: Math.floor(t.reward.fame * stage.rewardShareOnEarlyExit),
  };
}
