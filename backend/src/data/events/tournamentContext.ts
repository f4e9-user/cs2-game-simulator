import type { EventDef, TournamentContextPhase } from '../../types.js';

export interface TournamentContextPostMatchCondition {
  minTeamScore?: number;
  maxTeamScore?: number;
  minEnemyScore?: number;
  maxEnemyScore?: number;
  minRoundDiff?: number;
  maxRoundDiff?: number;
  minPlayerRating?: number;
  maxPlayerRating?: number;
  minKdDiff?: number;
  maxKdDiff?: number;
}

export type TournamentContextEventGroup =
  | 'elimination'
  | 'close-loss'
  | 'blowout-loss'
  | 'player-carried'
  | 'player-underperformed'
  | 'team-conflict'
  | 'team-rally'
  | 'public-pressure'
  | 'generic-review';

export interface TournamentContextEventDef extends EventDef {
  type: 'tournament-context';
  contextPhase: TournamentContextPhase[];
  requireTeam?: boolean;
  requireNoTeam?: boolean;
  requireMatchResult?: 'win' | 'loss';
  requireFinalStage?: boolean;
  requireChampion?: boolean;
  minStress?: number;
  minFatigue?: number;
  maxTeamTrust?: number;
  travelRequired?: 'away' | 'city' | 'cross-region';
  minTeamScore?: number;
  maxTeamScore?: number;
  minEnemyScore?: number;
  maxEnemyScore?: number;
  minRoundDiff?: number;
  maxRoundDiff?: number;
  minPlayerRating?: number;
  maxPlayerRating?: number;
  minKdDiff?: number;
  maxKdDiff?: number;
  minRecentTournamentLosses?: number;
  postMatchAny?: TournamentContextPostMatchCondition[];
  group?: TournamentContextEventGroup;
  isSevereNegative?: boolean;
  isGrowthEvent?: boolean;
}

export const TOURNAMENT_CONTEXT_EVENTS: TournamentContextEventDef[] = [
  {
    id: 'tournament-context-goal-setting',
    type: 'tournament-context',
    title: '报名后的目标',
    narrative: '报名确认发进群里后，所有人都在等你表态：这次到底是冲成绩，还是当作练兵。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    contextPhase: ['signup'],
    choices: [
      {
        id: 'aim-title',
        label: '目标就是夺冠',
        description: '把压力扛到自己身上。',
        check: { primary: 'mentality', secondary: 'experience', dc: 10 },
        success: {
          narrative: '你把目标说得很清楚，队友没有再试探。',
          stateDelta: { stress: 3 },
          effects: { teamTrustDelta: 2 },
        },
        failure: {
          narrative: '话说得太满，群里短暂安静了一下。',
          stateDelta: { stress: 6, tilt: 1 },
          effects: { teamTrustDelta: -2 },
        },
      },
      {
        id: 'treat-as-practice',
        label: '按练兵打',
        description: '降低预期，优先保证状态。',
        check: { primary: 'intelligence', secondary: 'mentality', dc: 9 },
        success: {
          narrative: '你们把训练目标拆成几个重点，压力降了下来。',
          stateDelta: { stress: -4 },
        },
        failure: {
          narrative: '有人觉得你还没开打就留退路。',
          effects: { teamTrustDelta: -2 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-locker-silence',
    type: 'tournament-context',
    title: '赛前更衣室冷场',
    narrative: '比赛快到了，训练室里只剩键盘声。没人明说，但每个人都知道这场不能随便输。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    contextPhase: ['pre-match'],
    requireTeam: true,
    maxTeamTrust: 45,
    choices: [
      {
        id: 'break-silence',
        label: '打破沉默',
        description: '主动把压力摊开说。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12 },
        success: {
          narrative: '你把大家担心的点说出来，训练室终于有人接话。',
          stateDelta: { stress: -5 },
          effects: { teamTrustDelta: 4, teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '话题刚开头就冷了下去，气氛反而更僵。',
          stateDelta: { stress: 5 },
          tags: { add: ['locker-tension'] },
          effects: { teamTrustDelta: -3 },
        },
      },
      {
        id: 'focus-yourself',
        label: '只管自己热身',
        description: '不介入队内气氛。',
        check: { primary: 'agility', secondary: 'mentality', dc: 10 },
        success: {
          narrative: '你把注意力收回准星，手感慢慢热起来。',
          stateDelta: { feel: 1, stress: 2 },
        },
        failure: {
          narrative: '越想专注，越能听见身边的沉默。',
          stateDelta: { tilt: 1, stress: 4 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-baseline-prep',
    type: 'tournament-context',
    title: '赛前准备',
    narrative: '距离比赛还有几天，你需要决定最后这段时间怎么准备。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    contextPhase: ['pre-match'],
    choices: [
      {
        id: 'demo-review',
        label: '分析对手录像',
        description: '研究对手的战术习惯，寻找可利用的规律。',
        check: { primary: 'intelligence', dc: 8, traitBonuses: { tactical: 2, igl: 1 } },
        success: {
          narrative: '你发现对手在某个点位有固定的战术偏好，这会是关键。',
          effects: {
            buffAdd: {
              id: 'pre-match-intel',
              label: '赛前情报',
              actionTag: 'match',
              growthKey: 'experience',
              growthMultiplier: 1.15,
              remainingUses: 2,
              consumeOn: 'growth',
            },
          },
        },
        failure: {
          narrative: '录像看了两个小时，没找到什么特别的规律。',
          stateDelta: { fatigue: 10 },
        },
      },
      {
        id: 'physical-prep',
        label: '体能保持训练',
        description: '轻量体能练习，保持状态不退步。',
        check: { primary: 'mentality', dc: 5, traitBonuses: { grinder: 1 } },
        success: {
          narrative: '轻量训练到位，身体状态维持得不错。',
          stateDelta: { fatigue: -10, feel: 1 },
        },
        failure: {
          narrative: '练习感觉很干，状态也没起色。',
          stateDelta: { fatigue: 5 },
        },
      },
      {
        id: 'mental-reset',
        label: '心态调整',
        description: '放松放松，不要在比赛前把自己绷死。',
        check: { primary: 'mentality', dc: 4, traitBonuses: { steady: 2 } },
        success: {
          narrative: '脑子里的杂念少了一些，感觉可以专注上场了。',
          stateDelta: { stress: -10, fatigue: -5 },
        },
        failure: {
          narrative: '越想放松越焦虑，最后也没怎么休息到。',
          stateDelta: { stress: 5 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-travel-hotel-noise',
    type: 'tournament-context',
    title: '异地酒店太吵',
    narrative:
      '赛程把你安排进临时酒店。隔壁队伍半夜还在复盘，走廊里拖箱子的声音断断续续，睡眠质量明显不如常驻地。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    contextPhase: ['pre-match'],
    travelRequired: 'away',
    choices: [
      {
        id: 'pay-quiet-room',
        label: '加钱换安静房间',
        description: '花一笔小钱，尽量保证比赛恢复。',
        check: {
          primary: 'money',
          dc: 5,
        },
        success: {
          narrative: '你换到走廊尽头，终于把耳机摘下来也能睡一会。',
          resourceDelta: {
            money: -4,
          },
          stateDelta: {
            fatigue: -6,
            stress: -2,
          },
        },
        failure: {
          narrative: '预算不够，只能继续忍着。你睡得断断续续。',
          stateDelta: {
            fatigue: 8,
            stress: 3,
          },
        },
      },
      {
        id: 'endure-noise',
        label: '戴耳塞硬睡',
        description: '不花钱，但恢复不稳定。',
        check: {
          primary: 'constitution',
          dc: 8,
          traitBonuses: { grinder: 1, hardship: 1 },
          traitPenalties: { fragile: 1 },
        },
        success: {
          narrative: '你睡得不算好，但至少没有被彻底打乱。',
          stateDelta: {
            fatigue: 2,
          },
        },
        failure: {
          narrative: '早上醒来时你还记得凌晨有人在门口笑。',
          stateDelta: {
            fatigue: 10,
            stress: 4,
          },
        },
      },
    ],
  },
  {
    id: 'tournament-context-travel-temp-training-room',
    type: 'tournament-context',
    title: '临时训练室条件差',
    narrative:
      '赛事方给的训练室能用，但桌椅高度、网络和隔音都不顺手。你突然意识到常驻训练环境不是白来的。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    contextPhase: ['pre-match'],
    travelRequired: 'city',
    choices: [
      {
        id: 'adapt-setup',
        label: '重新调整设置',
        description: '花时间适应现场环境。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 8,
          traitBonuses: { tactical: 1, steady: 1 },
        },
        success: {
          narrative: '你把椅子、鼠标线和显示器位置一点点调好，手感总算稳定下来。',
          stateDelta: {
            feel: 0.8,
            fatigue: 2,
          },
        },
        failure: {
          narrative: '越调越别扭，最后连原来的肌肉记忆都被打乱。',
          stateDelta: {
            feel: -0.8,
            fatigue: 6,
          },
        },
      },
      {
        id: 'rent-better-room',
        label: '临时租更好训练室',
        description: '用钱换稳定训练环境。',
        check: {
          primary: 'money',
          dc: 8,
        },
        success: {
          narrative: '额外租的训练房安静很多，至少最后一晚没有浪费。',
          resourceDelta: {
            money: -6,
          },
          stateDelta: {
            stress: -4,
            fatigue: -3,
          },
        },
        failure: {
          narrative: '场地费和押金比想象中更贵，你只能回到原来的房间。',
          stateDelta: {
            stress: 5,
          },
        },
      },
    ],
  },
  {
    id: 'tournament-context-travel-jet-lag',
    type: 'tournament-context',
    title: '时差没调过来',
    narrative:
      '跨区参赛让作息变得很怪。训练时间到了，你身体还停在另一个时区，连热身都慢半拍。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['pre-match'],
    travelRequired: 'cross-region',
    choices: [
      {
        id: 'sleep-schedule',
        label: '强行调整作息',
        description: '牺牲一点训练量，先把身体时钟拉回来。',
        check: {
          primary: 'constitution',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { steady: 1, grinder: 1 },
          traitPenalties: { fragile: 1 },
        },
        success: {
          narrative: '你把训练压短，睡眠补回来一些，比赛日不至于彻底发懵。',
          stateDelta: {
            fatigue: -6,
            stress: -2,
          },
        },
        failure: {
          narrative: '想睡睡不着，想练又没精神，状态被夹在中间。',
          stateDelta: {
            fatigue: 8,
            stress: 5,
          },
        },
      },
      {
        id: 'power-through',
        label: '硬顶训练',
        description: '保住训练节奏，但身体负担会更重。',
        check: {
          primary: 'mentality',
          dc: 11,
          traitBonuses: { grinder: 2, ego: 1 },
          traitPenalties: { fragile: 1 },
        },
        success: {
          narrative: '你硬是把训练打完了，手感还在，但身体明显被透支。',
          stateDelta: {
            feel: 0.5,
            fatigue: 8,
          },
        },
        failure: {
          narrative: '硬顶没顶住，枪法和心态一起开始飘。',
          stateDelta: {
            feel: -1,
            fatigue: 12,
            stress: 6,
          },
        },
      },
    ],
  },
  {
    id: 'tournament-context-extra-practice-dispute',
    type: 'tournament-context',
    title: '加练分歧',
    narrative: '赛前最后一晚，有人想继续练默认，有人已经开始揉手腕。时间不多，你得表个态。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['pre-match'],
    minFatigue: 55,
    choices: [
      {
        id: 'keep-practicing',
        label: '继续加练',
        description: '保手感，但承担疲劳风险。',
        check: { primary: 'constitution', secondary: 'agility', dc: 12 },
        success: {
          narrative: '训练量压住了，几套默认也顺了起来。',
          stateDelta: { feel: 1, fatigue: 6 },
        },
        failure: {
          narrative: '后半段明显变形，越练越像在消耗明天。',
          stateDelta: { fatigue: 12, stress: 4 },
        },
      },
      {
        id: 'force-rest',
        label: '提前收工',
        description: '优先恢复身体状态。',
        check: { primary: 'mentality', secondary: 'constitution', dc: 10 },
        success: {
          narrative: '你们关掉服务器，至少把明天的精力保住了。',
          stateDelta: { fatigue: -8, stress: -2 },
        },
        failure: {
          narrative: '收工是收工了，但没人觉得准备已经足够。',
          stateDelta: { fatigue: -4, stress: 3, feel: -1 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-pre-match-interview',
    type: 'tournament-context',
    title: '赛前采访口径',
    narrative: '赛前短访突然排到你这里。镜头不长，但每句话都会被剪出去。',
    stages: ['second', 'pro'],
    difficulty: 3,
    contextPhase: ['pre-match'],
    choices: [
      {
        id: 'confident',
        label: '正面放话',
        description: '提高关注度，也增加压力。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12 },
        success: {
          narrative: '你说得有底气，评论区开始期待这场。',
          resourceDelta: { fame: 2 },
          stateDelta: { stress: 3 },
        },
        failure: {
          narrative: '话说得太满，赛前压力先压了回来。',
          resourceDelta: { fame: 1 },
          stateDelta: { stress: 7 },
        },
      },
      {
        id: 'low-profile',
        label: '低调回应',
        description: '降低舆论压力。',
        check: { primary: 'intelligence', secondary: 'mentality', dc: 9 },
        success: {
          narrative: '你把话题带回准备本身，没有给外界太多发挥空间。',
          stateDelta: { stress: -3 },
        },
        failure: {
          narrative: '回应太空，采访没有惹事，也没有帮你们卸压。',
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-demo-review',
    type: 'tournament-context',
    title: '赛后录像复盘',
    narrative: '输掉比赛后，录像时间线被拉回几个反复出问题的回合。你可以把失败拆开，也可以先让脑子停一停。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    group: 'generic-review',
    isGrowthEvent: true,
    choices: [
      {
        id: 'review-key-rounds',
        label: '复盘关键回合',
        description: '把失败转成可执行的细节。',
        check: { primary: 'intelligence', secondary: 'experience', dc: 10, traitBonuses: { tactical: 2, igl: 1, steady: 1 } },
        success: {
          narrative: '你找到几个重复出现的错误，至少知道下一次该从哪里修。',
          coreGrowth: { experience: 0.12 },
          stateDelta: { fatigue: 3 },
        },
        failure: {
          narrative: '录像越看越散，几个回合反而在脑子里打结。',
          stateDelta: { fatigue: 6, stress: 3 },
        },
      },
      {
        id: 'skip-to-reset',
        label: '先恢复状态',
        description: '放过这晚，不硬拆失败。',
        check: { primary: 'mentality', dc: 8, traitBonuses: { steady: 2 } },
        success: {
          narrative: '你关掉录像，至少把情绪从比赛里抽了出来。',
          stateDelta: { stress: -4, fatigue: -3 },
        },
        failure: {
          narrative: '你离开了复盘室，但失败的几个画面还在反复跳出来。',
          stateDelta: { stress: 2 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-close-rounds',
    type: 'tournament-context',
    title: '差一点的关键分',
    narrative: '比分差距不大，真正让人难受的是那几个本来能收下的关键分。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    maxRoundDiff: 3,
    group: 'close-loss',
    isGrowthEvent: true,
    choices: [
      {
        id: 'isolate-utility-timing',
        label: '拆道具时机',
        description: '从 timing 和配合里找差距。',
        check: { primary: 'intelligence', secondary: 'experience', dc: 11, traitBonuses: { tactical: 2, igl: 1 } },
        success: {
          narrative: '你们把几个道具 timing 对上了，问题比情绪更清楚。',
          effects: {
            buffAdd: {
              id: 'post-loss-tactical-note',
              label: '赛后战术笔记',
              actionTag: 'match',
              growthKey: 'experience',
              growthMultiplier: 1.1,
              remainingUses: 1,
              consumeOn: 'growth',
            },
          },
        },
        failure: {
          narrative: '越拆越觉得每个细节都差一点，压力没有降下来。',
          stateDelta: { stress: 4 },
        },
      },
      {
        id: 'focus-aim-duels',
        label: '回到对枪细节',
        description: '把注意力收回自己能控制的部分。',
        check: { primary: 'agility', secondary: 'mentality', dc: 10 },
        success: {
          narrative: '你从几个对枪选择里找回一点手感。',
          stateDelta: { feel: 0.5, stress: 1 },
        },
        failure: {
          narrative: '几个没赢下来的枪位越看越刺眼。',
          stateDelta: { tilt: 1, stress: 3 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-clutch-regret',
    type: 'tournament-context',
    title: '关键残局没收住',
    narrative: '最后几个残局像卡在屏幕上。你知道比赛不是输在一个回合，但那个回合很难从脑子里出去。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    maxRoundDiff: 3,
    group: 'close-loss',
    isGrowthEvent: true,
    choices: [
      {
        id: 'replay-clutch-decisions',
        label: '回放残局决策',
        description: '承受压力，复盘当时选择。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12, traitBonuses: { clutch: 2, steady: 1 } },
        success: {
          narrative: '你承认那不是唯一答案，但知道下次可以更早做决定。',
          coreGrowth: { experience: 0.1 },
          stateDelta: { stress: 2 },
        },
        failure: {
          narrative: '回放没有带来答案，只让遗憾更具体。',
          stateDelta: { stress: 5, tilt: 1 },
        },
      },
      {
        id: 'accept-and-reset',
        label: '接受然后重置',
        description: '不把一个残局带到下一场。',
        check: { primary: 'mentality', dc: 9, traitBonuses: { steady: 2 } },
        success: {
          narrative: '你把这场留在这场，没有继续惩罚自己。',
          stateDelta: { tilt: -1, stress: -3 },
        },
        failure: {
          narrative: '你嘴上说过去了，手还是忍不住打开回放。',
          stateDelta: { stress: 2 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-system-exposed',
    type: 'tournament-context',
    title: '体系被打穿',
    narrative: '这场不是一两个回合的问题。对手像提前知道你们会怎么转点、怎么补防、怎么处理默认。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 4,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    postMatchAny: [{ minRoundDiff: 7 }, { maxTeamScore: 6 }],
    group: 'blowout-loss',
    isSevereNegative: true,
    isGrowthEvent: true,
    choices: [
      {
        id: 'map-the-failure-pattern',
        label: '梳理被针对的模式',
        description: '把惨败拆成可修的体系问题。',
        check: { primary: 'intelligence', secondary: 'experience', dc: 13, traitBonuses: { tactical: 2, igl: 1 } },
        success: {
          narrative: '你们确认了几个被反复利用的习惯，至少知道不是单纯手感问题。',
          coreGrowth: { experience: 0.15 },
          stateDelta: { fatigue: 4 },
        },
        failure: {
          narrative: '问题太多，每一条都像是在否定整套打法。',
          stateDelta: { fatigue: 8, stress: 4 },
        },
      },
      {
        id: 'call-out-prep-gap',
        label: '承认准备差距',
        description: '把锅从个人失误拉回准备质量。',
        check: { primary: 'mentality', secondary: 'intelligence', dc: 12 },
        success: {
          narrative: '队伍接受了这是一场准备差距，复盘没有继续乱飞。',
          effects: { teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '有人听成了互相推责，更衣室更安静了。',
          effects: { teamTrustDelta: -3 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-coach-review',
    type: 'tournament-context',
    title: '教练组点名复盘',
    narrative: '教练没有急着骂人，只是把几个名字和几个回合写在白板上。每个人都知道这会很难听。',
    stages: ['second', 'pro'],
    difficulty: 4,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    requireTeam: true,
    minStress: 40,
    group: 'blowout-loss',
    isGrowthEvent: true,
    choices: [
      {
        id: 'own-role-mistake',
        label: '承认角色失误',
        description: '先处理自己职责内的问题。',
        check: { primary: 'mentality', secondary: 'experience', dc: 13, traitBonuses: { selfless: 1, steady: 1 } },
        success: {
          narrative: '你把自己的职责说清楚，复盘没有继续绕圈。',
          coreGrowth: { experience: 0.12 },
          effects: { teamTrustDelta: 2 },
        },
        failure: {
          narrative: '你想承担，但越说越像没准备好。',
          stateDelta: { stress: 5 },
        },
      },
      {
        id: 'turn-to-system',
        label: '讨论体系问题',
        description: '把点名复盘拉回整体结构。',
        check: { primary: 'intelligence', secondary: 'mentality', dc: 12, traitBonuses: { tactical: 2, igl: 1 } },
        success: {
          narrative: '教练认可你指出的结构问题，复盘开始有方向。',
          effects: { teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '这听起来像是在绕开自己的失误。',
          effects: { teamTrustDelta: -2 },
        },
      },
      {
        id: 'push-back',
        label: '反驳教练判断',
        description: '有机会争回话语权，也可能引爆矛盾。',
        check: { primary: 'mentality', secondary: 'experience', dc: 15, traitBonuses: { ego: 2 } },
        success: {
          narrative: '你用事实顶住了质疑，房间里没人再把问题简化到你一个人身上。',
          stateDelta: { feel: 0.5 },
        },
        failure: {
          narrative: '反驳没有站住，气氛直接降到冰点。',
          stateDelta: { stress: 6 },
          effects: { teamTrustDelta: -4 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-carry-not-enough',
    type: 'tournament-context',
    title: 'Carry 不动的夜晚',
    narrative: '数据面板上你的名字不难看，但比赛还是输了。这种失败很难找一个舒服的解释。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 3,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    postMatchAny: [{ minPlayerRating: 1.15 }, { minKdDiff: 5 }],
    group: 'player-carried',
    isGrowthEvent: true,
    choices: [
      {
        id: 'keep-demanding-more',
        label: '要求自己做更多',
        description: '把无力感转成下一场的要求。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12, traitBonuses: { grinder: 1, clutch: 1 } },
        success: {
          narrative: '你没有把这场变成抱怨，而是记下还能多做的几个选择。',
          coreGrowth: { experience: 0.1 },
          stateDelta: { stress: 2 },
        },
        failure: {
          narrative: '你越想做更多，越觉得这场本来应该赢。',
          stateDelta: { stress: 5 },
        },
      },
      {
        id: 'protect-team-morale',
        label: '保护团队情绪',
        description: '不把失败归咎给队友。',
        check: { primary: 'mentality', dc: 10, traitBonuses: { support: 2, selfless: 1 } },
        success: {
          narrative: '你没有借数据说话，队友反而知道你扛了很多。',
          effects: { teamTrustDelta: 2 },
        },
        failure: {
          narrative: '你忍住没说，但情绪还是压在自己身上。',
          stateDelta: { stress: 4 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-silent-respect',
    type: 'tournament-context',
    title: '沉默里的认可',
    narrative: '没人庆祝，也没人说漂亮话。但关掉服务器前，有队友拍了拍你的椅背。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    requireTeam: true,
    postMatchAny: [{ minPlayerRating: 1.15 }, { minKdDiff: 5 }],
    group: 'player-carried',
    choices: [
      {
        id: 'deflect-credit',
        label: '把认可转回团队',
        description: '不让个人表现压过团队问题。',
        check: { primary: 'mentality', secondary: 'experience', dc: 10, traitBonuses: { selfless: 2, support: 1 } },
        success: {
          narrative: '你把话题带回下一场怎么一起打，队友接住了。',
          effects: { teamTrustDelta: 2, teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '你想说得轻一点，但大家还是听出了不甘心。',
          stateDelta: { stress: 2 },
        },
      },
      {
        id: 'take-the-lead-next',
        label: '主动承担下一场',
        description: '把认可换成责任。',
        check: { primary: 'mentality', secondary: 'intelligence', dc: 11, traitBonuses: { igl: 1, clutch: 1 } },
        success: {
          narrative: '你把下一场的准备方向说出来，房间里重新有了声音。',
          effects: { teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '承担得太快，反而让压力又回到你身上。',
          stateDelta: { stress: 4 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-underperformed',
    type: 'tournament-context',
    title: '自己没打出来',
    narrative: '这场你的数据和体感都不对。没人必须开口，比分和回放已经把问题摆出来了。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 3,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    postMatchAny: [{ maxPlayerRating: 0.85 }, { maxKdDiff: -5 }],
    group: 'player-underperformed',
    isSevereNegative: true,
    choices: [
      {
        id: 'own-the-bad-map',
        label: '承认这张图没打出来',
        description: '直接处理自己的低迷。',
        check: { primary: 'mentality', secondary: 'experience', dc: 11, traitBonuses: { steady: 1, selfless: 1 } },
        success: {
          narrative: '你没有找借口，复盘可以继续讨论怎么修正。',
          coreGrowth: { experience: 0.08 },
          effects: { teamTrustDelta: 1 },
        },
        failure: {
          narrative: '承认问题不难，难的是说完之后还得面对下一场。',
          stateDelta: { stress: 5 },
        },
      },
      {
        id: 'hide-in-the-demo',
        label: '把问题藏进整体复盘',
        description: '短期少受压力，但可能伤害信任。',
        check: { primary: 'intelligence', secondary: 'mentality', dc: 12 },
        success: {
          narrative: '复盘没有聚焦到你身上，但你知道问题还在。',
          stateDelta: { stress: -2 },
        },
        failure: {
          narrative: '队友听出了你在绕，气氛反而更僵。',
          effects: { teamTrustDelta: -3 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-locker-blame',
    type: 'tournament-context',
    title: '更衣室开始分锅',
    narrative: '复盘还没真正开始，几个人已经在回看关键回合。每一次暂停都像在等一个人先认错。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    contextPhase: ['post-match'],
    requireTeam: true,
    requireMatchResult: 'loss',
    maxTeamTrust: 60,
    group: 'team-conflict',
    isSevereNegative: true,
    choices: [
      {
        id: 'take-responsibility',
        label: '自己先担责任',
        description: '保护队友关系，但增加个人压力。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12 },
        success: {
          narrative: '你先把自己的失误摆出来，复盘终于能继续往下走。',
          stateDelta: { stress: 4 },
          effects: { teamTrustDelta: 3, teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '你想把责任扛下来，但话说出口更像是在替别人盖章。',
          stateDelta: { stress: 8, tilt: 1 },
          effects: { teamTrustDelta: -3 },
        },
      },
      {
        id: 'name-the-problem',
        label: '直接指出问题',
        description: '把冲突压回具体回合。',
        check: { primary: 'intelligence', secondary: 'mentality', dc: 12, traitBonuses: { tactical: 1, igl: 1 } },
        success: {
          narrative: '你把争论按回具体回合，复盘没有演变成吵架。',
          effects: { teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '细节越讲越像点名，更衣室气氛又沉下去。',
          tags: { add: ['locker-tension'] },
          effects: { teamTrustDelta: -3 },
        },
      },
      {
        id: 'shut-it-down',
        label: '制止争吵',
        description: '先保住更衣室，不让情绪扩大。',
        check: { primary: 'mentality', dc: 11, traitBonuses: { steady: 2, support: 1 } },
        success: {
          narrative: '你把话题压住，至少今晚没人继续互相伤害。',
          stateDelta: { stress: -2 },
          tags: { remove: ['locker-tension'] },
        },
        failure: {
          narrative: '你让大家别吵，但沉默比争吵更冷。',
          stateDelta: { stress: 4 },
          effects: { teamTrustDelta: -2 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-team-rally',
    type: 'tournament-context',
    title: '输球后的互相鼓励',
    narrative: '输比赛以后房间里很安静，但这次不是没人想说话，而是大家都在等一个不那么伤人的开头。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    requireTeam: true,
    group: 'team-rally',
    choices: [
      {
        id: 'rally-room',
        label: '鼓励队友',
        description: '把失败变成下一场一起打的理由。',
        check: { primary: 'mentality', secondary: 'experience', dc: 10, traitBonuses: { support: 2, selfless: 1, steady: 1 } },
        success: {
          narrative: '你没有否认失败，但也没有让房间停在失败里。',
          stateDelta: { stress: -3 },
          effects: { teamTrustDelta: 3 },
        },
        failure: {
          narrative: '话说得太快，听起来像在跳过真正的问题。',
          stateDelta: { stress: 2 },
        },
      },
      {
        id: 'quiet-reset',
        label: '安静恢复',
        description: '先让大家从这场里出来。',
        check: { primary: 'constitution', secondary: 'mentality', dc: 8 },
        success: {
          narrative: '你们没有多说，但至少没人把疲惫继续加重。',
          stateDelta: { fatigue: -5, stress: -2 },
        },
        failure: {
          narrative: '沉默没有带来恢复，只是把话留到了以后。',
          stateDelta: { fatigue: -2 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-elimination-walkout',
    type: 'tournament-context',
    title: '离场通道',
    narrative: '淘汰之后，离场通道比想象中长。场馆的声音还在身后，但你们已经没有下一张图了。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 4,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    requireFinalStage: true,
    group: 'elimination',
    choices: [
      {
        id: 'walk-out-together',
        label: '和队友一起离场',
        description: '至少别让失败把队伍拆散。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12, traitBonuses: { support: 1, selfless: 1 } },
        success: {
          narrative: '没人说太多，但队伍没有散着走出去。',
          effects: { teamTrustDelta: 2 },
        },
        failure: {
          narrative: '你想把大家拢在一起，但每个人都只想快点离开。',
          stateDelta: { stress: 4 },
        },
      },
      {
        id: 'stay-and-watch',
        label: '留下看后续比赛',
        description: '把出局后的时间换成经验。',
        check: { primary: 'experience', secondary: 'mentality', dc: 11, traitBonuses: { grinder: 1, tactical: 1 } },
        success: {
          narrative: '你留下来看别人的比赛，知道自己还差在哪里。',
          coreGrowth: { experience: 0.12 },
          stateDelta: { fatigue: 2 },
        },
        failure: {
          narrative: '你看不进去，只觉得场馆里每个声音都在提醒出局。',
          stateDelta: { fatigue: 4, stress: 3 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-loss-public-pressure',
    type: 'tournament-context',
    title: '赛后外界质疑',
    narrative: '赛后剪辑和评论开始发酵。解说、粉丝和路人都在复盘这场失利，而你的名字被反复提到。',
    stages: ['second', 'pro'],
    difficulty: 3,
    contextPhase: ['post-match'],
    requireMatchResult: 'loss',
    minStress: 45,
    minRecentTournamentLosses: 2,
    group: 'public-pressure',
    isSevereNegative: true,
    choices: [
      {
        id: 'give-measured-response',
        label: '克制回应',
        description: '降低舆论压力，但不把失败包装成曝光。',
        check: { primary: 'mentality', secondary: 'intelligence', dc: 12, traitBonuses: { media: 2, steady: 1 } },
        success: {
          narrative: '你回应得很稳，话题没有继续扩大。',
          stateDelta: { stress: -3 },
          resourceDelta: { fame: 0 },
        },
        failure: {
          narrative: '回应被截成几段传播，质疑没有消失。',
          stateDelta: { stress: 5 },
          resourceDelta: { fame: -2 },
        },
      },
      {
        id: 'stay-offline',
        label: '远离社媒',
        description: '保护状态，但接受热度自然流失。',
        check: { primary: 'mentality', dc: 9, traitBonuses: { steady: 2 }, traitPenalties: { media: 1 } },
        success: {
          narrative: '你没有继续喂流量，情绪慢慢降下来。',
          stateDelta: { stress: -5, fatigue: -3 },
          resourceDelta: { fame: -1 },
        },
        failure: {
          narrative: '你说不看，但还是刷到了几个最刺眼的片段。',
          stateDelta: { stress: 3 },
          resourceDelta: { fame: -3 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-close-win-silence',
    type: 'tournament-context',
    title: '险胜后的沉默',
    narrative: '比赛赢了，但比分太近。没人庆祝得太大声，因为大家都知道这场差点翻车。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['post-match'],
    requireMatchResult: 'win',
    choices: [
      {
        id: 'reset-fast',
        label: '立刻复盘',
        description: '把险胜转化成经验。',
        check: { primary: 'intelligence', secondary: 'experience', dc: 11 },
        success: {
          narrative: '你们把几个危险回合快速拆开，赢得不算浪费。',
          coreGrowth: { experience: 0.12 },
          stateDelta: { stress: 2 },
        },
        failure: {
          narrative: '复盘太急，刚赢下来的气也被压没了。',
          stateDelta: { stress: 5 },
        },
      },
      {
        id: 'take-the-win',
        label: '先接受胜利',
        description: '稳定心态。',
        check: { primary: 'mentality', dc: 9 },
        success: {
          narrative: '你让大家先把这场赢下来这件事记住，气氛松了一点。',
          stateDelta: { stress: -3, feel: 1 },
        },
        failure: {
          narrative: '想放松，但脑子里还是那几个差点输掉的残局。',
          stateDelta: { stress: 2 },
        },
      },
    ],
  },
  {
    id: 'tournament-context-champion-resource-split',
    type: 'tournament-context',
    title: '夺冠后的资源分配',
    narrative: '冠军奖金和后续资源摆在桌上。赢下比赛只是第一步，怎么分配会影响下一段路。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    contextPhase: ['post-match'],
    requireChampion: true,
    choices: [
      {
        id: 'share-credit',
        label: '强调团队贡献',
        description: '提高队伍关系。',
        check: { primary: 'mentality', secondary: 'experience', dc: 10 },
        success: {
          narrative: '你把功劳分给每个人，庆祝没有变成暗流。',
          effects: { teamTrustDelta: 4, teamChemistryDelta: 2 },
        },
        failure: {
          narrative: '你想照顾所有人，但有些话听起来像场面话。',
          effects: { teamTrustDelta: -1 },
        },
      },
      {
        id: 'build-personal-brand',
        label: '抓住个人曝光',
        description: '提高名气，但可能引发队内不满。',
        check: { primary: 'mentality', secondary: 'agility', dc: 12 },
        success: {
          narrative: '你把采访和曝光吃了下来，个人声量明显上升。',
          resourceDelta: { fame: 4 },
        },
        failure: {
          narrative: '镜头都在你身上，有人开始觉得这不像一支队赢的。',
          resourceDelta: { fame: 2 },
          effects: { teamTrustDelta: -3 },
        },
      },
    ],
  },
];
