import type { EventDef } from '../../types.js';

// ── 每日行动事件 ──────────────────────────────────────────────
// 玩家每周常规行动：天梯 / 训练 / 休息 / 度假
// 这是核心属性成长的主要途径（dailyGrowth 字段）。
// 叙事事件改变状态；这里的行动改变属性。

export const DAILY_EVENTS: EventDef[] = [
  // ── 普通一周 ──────────────────────────────────────────────
  {
    id: 'routine-standard',
    type: 'routine',
    title: '这周怎么安排？',
    narrative:
      '赛程空了一段，没有硬性任务。你望着日历，想着这几天该怎么过。',
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 0,
    weight: 4,
    choices: [
      {
        id: 'ranked-grind',
        label: '天梯：刷分上分',
        description: '多打路人局，靠实战磨手感和枪法直觉。',
        check: { primary: 'agility', dc: 7, traitBonuses: { solo: 2, mechanical: 2, grinder: 1, aimer: 1 } },
        success: {
          narrative:
            '今天状态不错，手感跟着了，几把连胜，准星像有自己的想法。',
          dailyGrowth: 'agility',
          feelDelta: 1.5,
          fatigueDelta: 18,
          stressDelta: 1,
        },
        failure: {
          narrative:
            '被对面压着打，局局都很难受。越练越差，索性关机散散心。',
          feelDelta: -1,
          fatigueDelta: 22,
          stressDelta: 2,
          tiltDelta: 1,
        },
      },
      {
        id: 'structured-training',
        label: '训练：体系化练习',
        description: '看视频、做笔记、对着 workshop 地图练战术，系统提升战术意识。',
        check: { primary: 'intelligence', dc: 6, traitBonuses: { tactical: 2, igl: 2, grinder: 1, steady: 1 } },
        success: {
          narrative:
            '反复拆解了两个点位的交叉火力，豁然开朗，下次打一定不一样。',
          dailyGrowth: 'intelligence',
          feelDelta: 0.5,
          fatigueDelta: 12,
          stressDelta: 1,
        },
        failure: {
          narrative:
            '脑子转不动，看了两小时还是一团浆糊，什么都没记住。',
          feelDelta: -0.5,
          fatigueDelta: 8,
          stressDelta: 1,
          tiltDelta: 1,
        },
      },
      {
        id: 'rest-day',
        label: '休息：充个电',
        description: '睡够、散步、少碰游戏。压力和疲劳都会有所恢复。',
        check: { primary: 'mentality', dc: 5, traitBonuses: { steady: 1 }, traitPenalties: { grinder: 1, obsessed: 1 } },
        success: {
          narrative:
            '睡到自然醒，出门买了杯咖啡，感觉脑子清了不少，明天再冲。',
          stressDelta: -3,
          fatigueDelta: -40,
          feelDelta: 0.5,
        },
        failure: {
          narrative:
            '想休息，但脑子停不下来，反复回想上周那几把翻车局，越想越烦。',
          stressDelta: -1,
          fatigueDelta: -20,
          tiltDelta: 1,
        },
      },
      {
        id: 'vacation',
        label: '度假：彻底断网',
        description: '远离电脑和游戏，彻底放空。压力大幅下降，但手感会生疏。',
        check: { primary: 'mentality', dc: 1 },
        success: {
          narrative:
            '三天没碰电脑，你去了海边，看了两部电影。回来后整个人轻松了很多。',
          stressDelta: -5,
          fatigueDelta: -25,
          feelDelta: -1,
          tiltDelta: -1,
        },
        failure: {
          narrative: '强迫自己放松，却没什么效果，脑子里全是比赛画面。',
          stressDelta: -2,
          fatigueDelta: -15,
        },
      },
    ],
  },

  // ── 赛季密集期 ─────────────────────────────────────────────
  {
    id: 'routine-peak-season',
    type: 'routine',
    title: '赛季冲刺期',
    narrative:
      '赛历密集，周围的队伍都在加班加点准备。你感受到了一种集体焦虑，也要做决定了。',
    stages: ['youth', 'second', 'pro', 'star'],
    difficulty: 1,
    weight: 2,
    choices: [
      {
        id: 'ranked-grind',
        label: '天梯：趁热打铁',
        description: '竞技状态在线，多刷分积累实战感。',
        check: { primary: 'agility', dc: 8, traitBonuses: { solo: 2, mechanical: 2 } },
        success: {
          narrative: '高强度对局让你的反应速度逼出了极限，感觉自己在进步。',
          dailyGrowth: 'agility',
          feelDelta: 2,
          fatigueDelta: 25,
          stressDelta: 2,
        },
        failure: {
          narrative:
            '输了很多局，疲劳和挫败感叠在一起，感觉比较糟糕。',
          feelDelta: -1.5,
          fatigueDelta: 30,
          stressDelta: 3,
          tiltDelta: 1,
        },
      },
      {
        id: 'structured-training',
        label: '训练：准备下一场比赛',
        description: '专项研究对手录像，提升对局针对性。',
        check: { primary: 'intelligence', dc: 8, traitBonuses: { tactical: 3, igl: 2 } },
        success: {
          narrative:
            '把对手几个常用战术拆得七七八八，脑子里已经有反制思路了。',
          dailyGrowth: 'intelligence',
          feelDelta: 1,
          fatigueDelta: 15,
          stressDelta: 1,
          buffAdd: {
            id: 'pre-match-analysis',
            label: '赛前分析加成',
            actionTag: 'match',
            multiplier: 1.2,
            remainingUses: 2,
          },
        },
        failure: {
          narrative: '看了几个对手片段但完全看不出规律，感觉对面太随机了。',
          feelDelta: -0.5,
          fatigueDelta: 10,
          stressDelta: 1,
        },
      },
      {
        id: 'rest-day',
        label: '休息：保存状态',
        description: '密集赛程中的战略性休息，防止过度消耗。',
        check: { primary: 'mentality', dc: 6, traitBonuses: { steady: 1 }, traitPenalties: { grinder: 1, obsessed: 1 } },
        success: {
          narrative: '你抵住了"大家都在练，我也要练"的焦虑，好好睡了一觉。',
          stressDelta: -3,
          fatigueDelta: -35,
          feelDelta: 1,
        },
        failure: {
          narrative: '想休息但罪恶感太强，在床上刷了两小时战术视频，效果不大。',
          stressDelta: 0,
          fatigueDelta: -15,
        },
      },
      {
        id: 'vacation',
        label: '度假：退出这周',
        description: '赛季中抽身需要勇气，但彻底放松有时是最好的选择。',
        check: { primary: 'mentality', dc: 1 },
        success: {
          narrative:
            '你告假一周，队友有些惊讶，但你在外面真的恢复了。',
          stressDelta: -6,
          fatigueDelta: -30,
          feelDelta: -1.5,
          tiltDelta: -1,
        },
        failure: {
          narrative: '心里惦记着比赛，度假成了煎熬。',
          stressDelta: -1,
          fatigueDelta: -10,
        },
      },
    ],
  },

  // ── 轻训期 ─────────────────────────────────────────────────
  {
    id: 'routine-light-week',
    type: 'routine',
    title: '轻训周',
    narrative:
      '教练宣布这周放松，没有强制训练任务。大家各自安排，氛围轻松。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 0,
    weight: 2,
    choices: [
      {
        id: 'ranked-grind',
        label: '天梯：自己加练',
        description: '别人在休息，你趁机多刷几把。',
        check: { primary: 'agility', dc: 6, traitBonuses: { grinder: 3, solo: 1 } },
        success: {
          narrative: '没有压力的天梯状态出奇的好，一口气六连胜，手感烫手。',
          dailyGrowth: 'agility',
          feelDelta: 2,
          fatigueDelta: 15,
          stressDelta: 1,
        },
        failure: {
          narrative: '轻松氛围下你反而打得漫不经心，输了也无所谓，但什么也没练到。',
          feelDelta: -0.5,
          fatigueDelta: 10,
          stressDelta: 1,
        },
      },
      {
        id: 'structured-training',
        label: '训练：自主研究',
        description: '没有教练的安排，你自己挑感兴趣的战术深入研究。',
        check: { primary: 'intelligence', dc: 5, traitBonuses: { tactical: 2, igl: 3 } },
        success: {
          narrative: '研究了一种冷门进点路线，测试下来效果比预期好，有点兴奋。',
          dailyGrowth: 'intelligence',
          feelDelta: 1,
          fatigueDelta: 8,
          stressDelta: 0,
          buffAdd: {
            id: 'self-study',
            label: '自主研究加成',
            actionTag: 'training',
            multiplier: 1.15,
            remainingUses: 2,
          },
        },
        failure: {
          narrative: '没有方向瞎研究，东看西看，最后什么也没沉淀下来。',
          feelDelta: 0,
          fatigueDelta: 5,
          stressDelta: 0,
        },
      },
      {
        id: 'rest-day',
        label: '休息：跟着大家放松',
        description: '教练说了休息，就好好休息。',
        check: { primary: 'mentality', dc: 3, traitBonuses: { steady: 1 }, traitPenalties: { grinder: 1, obsessed: 1 } },
        success: {
          narrative: '难得不内疚地休息，睡足、吃好，感觉整个人清爽多了。',
          stressDelta: -4,
          fatigueDelta: -50,
          feelDelta: 1,
          tiltDelta: -1,
        },
        failure: {
          narrative: '睡了很久却感觉更累，可能是睡太多了，脑子混沌。',
          stressDelta: -2,
          fatigueDelta: -30,
        },
      },
      {
        id: 'vacation',
        label: '度假：彻底出去玩',
        description: '轻训周是出去玩的最佳时机。',
        check: { primary: 'mentality', dc: 1 },
        success: {
          narrative: '和朋友去打了卡丁车，吃了烧烤，完全忘了比赛这件事，很开心。',
          stressDelta: -7,
          fatigueDelta: -40,
          feelDelta: -0.5,
          tiltDelta: -2,
        },
        failure: {
          narrative: '出去了，但总觉得差点什么，玩得不尽兴。',
          stressDelta: -3,
          fatigueDelta: -20,
        },
      },
    ],
  },
];
