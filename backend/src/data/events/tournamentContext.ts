import type { EventDef, TournamentContextPhase } from '../../types.js';

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
}

export const TOURNAMENT_CONTEXT_EVENTS: TournamentContextEventDef[] = [
  {
    id: 'tournament-context-goal-setting',
    type: 'tournament-context',
    title: '报名后的目标',
    narrative: '报名确认发进群里后，所有人都在等你表态：这次到底是冲成绩，还是当作练兵。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    contextPhase: ['signup', 'pre-match'],
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
    id: 'tournament-context-post-loss-blame',
    type: 'tournament-context',
    title: '赛后分锅',
    narrative: '输掉比赛后，复盘还没开始，几个人已经在回看关键回合。每一次暂停都像在等一个人先认错。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    contextPhase: ['post-match'],
    requireTeam: true,
    requireMatchResult: 'loss',
    choices: [
      {
        id: 'take-responsibility',
        label: '先揽责任',
        description: '保护队友关系，但增加个人压力。',
        check: { primary: 'mentality', secondary: 'experience', dc: 12 },
        success: {
          narrative: '你先把自己的失误摆出来，复盘终于能继续往下走。',
          stateDelta: { stress: 4 },
          effects: { teamTrustDelta: 4, teamChemistryDelta: 1 },
        },
        failure: {
          narrative: '你想把责任扛下来，但话说出口更像是在替别人盖章。',
          stateDelta: { stress: 8, tilt: 1 },
          effects: { teamTrustDelta: -3 },
        },
      },
      {
        id: 'review-details',
        label: '只谈细节',
        description: '避免情绪化争论。',
        check: { primary: 'intelligence', secondary: 'experience', dc: 11 },
        success: {
          narrative: '你把争论按回具体回合，复盘没有演变成吵架。',
          effects: { teamTrustDelta: 2 },
        },
        failure: {
          narrative: '细节越讲越像点名，更衣室气氛又沉下去。',
          tags: { add: ['locker-tension'] },
          effects: { teamTrustDelta: -4 },
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
