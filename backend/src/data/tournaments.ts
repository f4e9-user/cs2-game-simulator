import type { ChoiceDef, EventDef, Stage, StatDelta } from '../types.js';

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
    reward: { money: 10, experience: 2, fame: 1, points: 1 },
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
    reward: { money: 20, experience: 2, fame: 2, points: 2 },
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
    reward: { money: 20, experience: 3, fame: 2, points: 2 },
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
    reward: { money: 30, experience: 4, fame: 4, points: 4 },
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
    reward: { money: 40, experience: 5, fame: 6, points: 6 },
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
    reward: { money: 50, experience: 5, fame: 8, points: 8, stressDelta: 1 },
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
    reward: { money: 80, experience: 6, fame: 14, points: 14, stressDelta: 2 },
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
    reward: { money: 100, experience: 6, fame: 20, points: 22, stressDelta: 3 },
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
    reward: { money: 150, experience: 8, fame: 30, points: 30, stressDelta: 4 },
    baseDifficulty: 5,
    bracket: SIX_STAGE,
  },
];

export function getTournament(id: string): Tournament | undefined {
  return TOURNAMENTS.find((t) => t.id === id);
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
  if (tier === 'netcafe' || tier === 'city' || tier === 'platform') return 'rookie';
  if (tier === 'secondary-league' || tier === 'development-league') return 'circuit';
  if (tier === 'tier2' || tier === 'tier1') return 'pro';
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
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
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
