import type { EventDef, Stage } from '../types.js';

export type TournamentTier =
  | 'netcafe'
  | 'city'
  | 'platform'
  | 'secondary-league'
  | 'development-league'
  | 'tier2'
  | 'tier1'
  | 's-class'
  | 'major';

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
  description: string;
  stages: Stage[];
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
  bracket: TournamentStage[];
}

export const TOURNAMENTS: Tournament[] = [
  // --- Rookie / pubber circuit ---
  {
    id: 't-netcafe',
    tier: 'netcafe',
    name: '本地网吧赛',
    description: '街边网吧的小型 BO1，奖金不多但能涨经验。',
    stages: ['rookie'],
    signupWeeks: 'always',
    reward: { money: 1, experience: 2, fame: 1, points: 1 },
    baseDifficulty: 1,
    bracket: ONE_STAGE,
  },
  {
    id: 't-city',
    tier: 'city',
    name: '城市公开赛',
    description: '区域办的周末赛，混着主播和路人队。',
    stages: ['rookie', 'youth'],
    signupWeeks: [10, 22, 34, 46],
    reward: { money: 2, experience: 2, fame: 2, points: 2 },
    baseDifficulty: 2,
    bracket: TWO_STAGE,
  },
  {
    id: 't-platform',
    tier: 'platform',
    name: '平台赛 (Faceit/ESEA)',
    description: '线上分级赛事，输赢直接体现在 ELO 上。',
    stages: ['rookie', 'youth', 'second'],
    signupWeeks: 'always',
    reward: { money: 2, experience: 3, fame: 2, points: 2 },
    baseDifficulty: 2,
    bracket: TWO_STAGE,
  },

  // --- Youth / academy circuit ---
  {
    id: 't-secondary',
    tier: 'secondary-league',
    name: '次级联赛',
    description: '俱乐部青训队的常规联赛。',
    stages: ['youth', 'second'],
    fameRequired: 6,
    signupWeeks: [6, 18, 30, 42],
    reward: { money: 3, experience: 4, fame: 4, points: 4 },
    baseDifficulty: 3,
    bracket: TWO_STAGE,
  },
  {
    id: 't-development',
    tier: 'development-league',
    name: '发展联赛',
    description: '介于次级和职业之间，赢了能直接被一线队签下。',
    stages: ['youth', 'second'],
    fameRequired: 12,
    signupWeeks: [14, 38],
    reward: { money: 4, experience: 5, fame: 6, points: 6 },
    baseDifficulty: 3,
    bracket: FOUR_STAGE,
  },

  // --- Pro circuit ---
  {
    id: 't-tier2',
    tier: 'tier2',
    name: 'Tier 2 邀请赛',
    description: '小型职业邀请赛，混着新晋职业队。',
    stages: ['second', 'pro'],
    fameRequired: 18,
    pointsRequired: 5,
    signupWeeks: [10, 26, 42],
    reward: { money: 5, experience: 5, fame: 8, points: 8, stressDelta: 1 },
    baseDifficulty: 4,
    bracket: FOUR_STAGE,
  },
  {
    id: 't-tier1',
    tier: 'tier1',
    name: 'Tier 1 国际邀请赛',
    description: '一线职业队互锤的赛季级邀请赛。',
    stages: ['pro', 'star'],
    fameRequired: 30,
    pointsRequired: 15,
    signupWeeks: [14, 38],
    reward: { money: 8, experience: 6, fame: 14, points: 14, stressDelta: 2 },
    baseDifficulty: 4,
    bracket: FOUR_STAGE,
  },
  {
    id: 't-s-class',
    tier: 's-class',
    name: 'S 级赛事',
    description: '顶级邀请赛，赢一次能让你被记住一年。',
    stages: ['pro', 'star'],
    fameRequired: 45,
    pointsRequired: 25,
    signupWeeks: [12, 36],
    reward: { money: 10, experience: 6, fame: 20, points: 22, stressDelta: 3 },
    baseDifficulty: 5,
    bracket: SIX_STAGE,
  },
  {
    id: 't-major',
    tier: 'major',
    name: 'Major 大赛',
    description: '一年两届的桂冠赛，赢了就是写入历史。',
    stages: ['pro', 'star', 'veteran'],
    fameRequired: 35,
    pointsRequired: 30,
    // Signup at end of week 22 (≈ June run-up) and week 46 (≈ December).
    // Match fires next week → week 23 / 47.
    signupWeeks: [22, 46],
    reward: { money: 15, experience: 8, fame: 30, points: 30, stressDelta: 4 },
    baseDifficulty: 5,
    bracket: SIX_STAGE,
  },
];

export function getTournament(id: string): Tournament | undefined {
  return TOURNAMENTS.find((t) => t.id === id);
}

// Synthesize an EventDef for a specific stage of a tournament. Reward and
// difficulty scale per the bracket entry.
export function synthesizeMatchEvent(
  t: Tournament,
  stageIndex: number,
): EventDef {
  const stage = t.bracket[stageIndex] ?? t.bracket[0]!;
  const isFinal = stageIndex === t.bracket.length - 1;
  const r = t.reward;
  const diff = t.baseDifficulty + stage.difficultyBonus;

  // Win on a non-final stage advances; win on the final stage is championship.
  const winNarrative = isFinal
    ? `决赛终局，你们抬起《${t.name}》冠军奖杯。`
    : `${stage.name} 通关，进入下一阶段。`;
  const lossShare = stage.rewardShareOnEarlyExit;
  const advanceNote = isFinal ? '' : `（下一阶段：${t.bracket[stageIndex + 1]!.name}）`;

  // Eliminated rewards on success-but-actually-knocked-out can't be expressed here;
  // we just hand the partial only on failure. Full reward only on final win.
  const winReward = isFinal
    ? {
        money: r.money,
        experience: r.experience,
        agility: 1,
      }
    : {
        // Non-final win: small interim experience/money trickle.
        money: Math.max(0, Math.floor(r.money / 4)),
        experience: Math.max(1, Math.floor(r.experience / 4)),
      };
  const winFame = isFinal ? r.fame : Math.floor(r.fame / 5);
  const winPoints = isFinal ? r.points : Math.floor(r.points / 4);

  const lossReward = {
    money: Math.max(0, Math.floor(r.money * lossShare)),
    experience: Math.max(1, Math.floor(r.experience * lossShare)),
    mentality: -1,
  };
  const lossFame = Math.floor(r.fame * lossShare);
  const lossPoints = Math.floor(r.points * lossShare);
  const lossStress = (r.stressDelta ?? 1) + 2;

  return {
    id: `tournament-${t.id}--${stageIndex}`,
    type: 'match',
    title: `${t.name} · ${stage.name}`,
    narrative: `《${t.name}》进入 ${stage.name}。${t.description}怎么打？`,
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: diff,
    weight: 1,
    choices: [
      {
        id: 'play-aggressive',
        label: '硬刚枪：用个人能力定胜负',
        description: '高方差打法。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 10 + diff,
          traitBonuses: { mechanical: 2, clutch: 2, aimer: 2 },
          traitPenalties: { fragile: 1 },
        },
        success: {
          narrative: winNarrative + advanceNote,
          statChanges: winReward,
          fameDelta: winFame,
          stressDelta: r.stressDelta ?? 0,
          tagAdds: isFinal ? ['tournament-winner', 'highlight-clip'] : [],
        },
        failure: {
          narrative: `开局压力没扛住，${stage.name} 止步。`,
          statChanges: lossReward,
          fameDelta: lossFame,
          stressDelta: lossStress,
        },
      },
      {
        id: 'play-team',
        label: '体系打法：让指挥主导',
        description: '稳。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 9 + diff,
          traitBonuses: { igl: 2, tactical: 2, support: 2, steady: 2 },
        },
        success: {
          narrative: winNarrative + advanceNote,
          statChanges: winReward,
          fameDelta: winFame,
          stressDelta: r.stressDelta ?? 0,
          tagAdds: isFinal ? ['tournament-winner'] : [],
        },
        failure: {
          narrative: `体系被读，${stage.name} 出局。`,
          statChanges: lossReward,
          fameDelta: lossFame,
          stressDelta: lossStress,
        },
      },
      {
        id: 'play-safe',
        label: '保守：求稳别浪',
        description: '降低翻车概率，但奖励也少。',
        check: {
          primary: 'experience',
          dc: 8 + diff,
          traitBonuses: { steady: 3 },
        },
        success: {
          narrative: isFinal
            ? `稳扎稳打的体系把奖杯拖回来了。`
            : `${stage.name} 稳住晋级，没冒险。`,
          statChanges: {
            money: Math.max(0, Math.floor((winReward.money ?? 0) * 0.7)),
            experience: Math.max(1, Math.floor((winReward.experience ?? 0) * 0.7)),
          },
          fameDelta: Math.floor(winFame * 0.7),
          stressDelta: 0,
          tagAdds: isFinal ? ['tournament-winner'] : [],
        },
        failure: {
          narrative: `保守过头，${stage.name} 第一轮就被淘汰。`,
          statChanges: { ...lossReward, money: 0 },
          fameDelta: -1,
          stressDelta: lossStress,
        },
      },
    ],
  };
}

// Tournaments whose signup window is OPEN this week for the player's stage,
// taking the fame and points gates into account.
export function tournamentsOpenForSignup(
  stage: Stage,
  fame: number,
  points: number,
  week: number,
): Tournament[] {
  return TOURNAMENTS.filter((t) => {
    if (!t.stages.includes(stage)) return false;
    if (t.fameRequired !== undefined && fame < t.fameRequired) return false;
    if (t.pointsRequired !== undefined && points < t.pointsRequired) return false;
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
