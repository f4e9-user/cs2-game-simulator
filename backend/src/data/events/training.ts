import type { EventDef } from '../../types.js';

export const TRAINING_EVENTS: EventDef[] = [
  {
    id: 'training-aim-map',
    type: 'training',
    title: '清晨的 aim_botz',
    narrative:
      '闹钟响起，你打开游戏进入 aim_botz。屏幕上的靶子一个接一个。你该怎么练？',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'grind-deagle',
        label: '只练沙鹰爆头，两小时不停',
        description: '高强度、重复，枪法提升明显，但会累。',
        check: {
          primary: 'agility',
          dc: 10,
          traitBonuses: { grinder: 3, mechanical: 2 },
          traitPenalties: { streamer: 1 },
        },
        success: {
          narrative: '两小时后你准星几乎没晃，点开录像自己都忍不住笑。',
          statChanges: { agility: 2, experience: 1, mentality: -1 },
        },
        failure: {
          narrative: '练到一半手开始抖，越练越糟，索性关机。',
          statChanges: { agility: 0, mentality: -2 },
        },
      },
      {
        id: 'mix-routine',
        label: '按套路：rifle/awp/投掷物轮换',
        description: '稳扎稳打，收益均衡。',
        check: {
          primary: 'intelligence',
          secondary: 'agility',
          dc: 9,
          traitBonuses: { tactical: 2, steady: 2 },
        },
        success: {
          narrative: '你照着职业选手的日常清单走了一遍，身体记住了很多东西。',
          statChanges: { agility: 1, intelligence: 1, experience: 1 },
        },
        failure: {
          narrative: '计划太长，你心不在焉地把几个动作做完，没什么印象。',
          statChanges: { experience: 1 },
        },
      },
      {
        id: 'skip-stream',
        label: '直接开播陪观众打路人',
        description: '赚点钱，练不到什么技术。',
        check: {
          primary: 'money',
          dc: 8,
          traitBonuses: { streamer: 3, media: 2 },
          traitPenalties: { grinder: 2 },
        },
        success: {
          narrative: '今天观众不少，礼物飘得欢。手感这周没动——但你暂时不想想这件事。',
          statChanges: { money: 2, mentality: 1, experience: -1 },
          tagAdds: ['missed-practice'],
        },
        failure: {
          narrative: '没人来，键盘声回荡在空房间。你在公屏上被熟人喷了两句。',
          statChanges: { money: 0, mentality: -2 },
          tagAdds: ['missed-practice'],
        },
      },
    ],
  },
  {
    id: 'training-demo-review',
    type: 'training',
    title: '复盘昨晚的比赛 demo',
    narrative:
      '教练把昨晚输掉的 demo 甩到群里：「每人抽一张图，写出三个错误决策。」',
    stages: ['youth', 'second', 'pro'],
    difficulty: 2,
    choices: [
      {
        id: 'deep-review',
        label: '逐回合认真看，自己做笔记',
        description: '耗时间，但对战术理解帮助极大。',
        check: {
          primary: 'intelligence',
          dc: 11,
          traitBonuses: { tactical: 3, igl: 2, steady: 1 },
        },
        success: {
          narrative: '你发现对面 B 包点的烟雾时机有固定间隔，笔记被教练表扬。',
          statChanges: { intelligence: 2, experience: 2 },
        },
        failure: {
          narrative: '一集没看完你就困了，笔记本上只有几行。',
          statChanges: { intelligence: 0, mentality: -1 },
        },
      },
      {
        id: 'ask-teammates',
        label: '和队友语音一起复盘',
        description: '效率高，但容易互相甩锅。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { support: 2, steady: 1 },
        },
        success: {
          narrative: '气氛不错，几个问题很快就理清楚，队内默契回来了一些。',
          statChanges: { intelligence: 1, experience: 1, mentality: 1 },
        },
        failure: {
          narrative: '几句话后开始互相指责，最后不欢而散。',
          statChanges: { mentality: -2 },
          tagAdds: ['locker-tension'],
        },
      },
      {
        id: 'skip-review',
        label: '找借口推掉，先休息',
        description: '心态恢复，但会被教练记一笔。',
        check: {
          primary: 'mentality',
          dc: 6,
        },
        success: {
          narrative: '你睡了个好觉，但工作群里教练的 @ 很显眼。',
          statChanges: { mentality: 2, experience: -1 },
          tagAdds: ['missed-practice'],
        },
        failure: {
          narrative: '你想睡但睡不着，脑子里全是刚才的小话。',
          statChanges: { mentality: -1 },
          tagAdds: ['missed-practice'],
        },
      },
    ],
  },
];
