import type { EventDef } from '../../types.js';

// Detection probability per stage. Higher stages = higher scrutiny.
// Used by choice.check.detection on the "push big" option.
const DETECT_BIG = {
  rookie: 0.05,
  youth: 0.08,
  second: 0.15,
  pro: 0.25,
  star: 0.40,
  veteran: 0.35,
};

// Small-bet variant: one-third the detection risk, smaller reward.
const DETECT_SMALL = {
  rookie: 0.02,
  youth: 0.03,
  second: 0.05,
  pro: 0.09,
  star: 0.14,
  veteran: 0.12,
};

const BANNED = {
  narrative:
    '调查邮件在凌晨发到俱乐部。你的名字上了禁赛名单，所有账号冻结，生涯戛然而止。',
  statChanges: { money: -5, mentality: -5 },
  endRun: true,
  endReason: 'banned_for_match_fixing',
  tagAdds: ['banned'],
};

export const BETTING_EVENTS: EventDef[] = [
  {
    id: 'betting-old-friend',
    type: 'betting',
    title: '老朋友的私信',
    narrative:
      '一个老朋友在 Discord 上发来消息：「你们队明天那把，随便打打就行。赔率很漂亮。」',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0.4,
    choices: [
      {
        id: 'bet-big',
        label: '押大：自己下重注',
        description: '让这一把打得"看起来正常"，下完注等结算。',
        check: {
          primary: 'mentality',
          dc: 0,
          detection: { chanceByStage: DETECT_BIG },
        },
        success: {
          narrative: '没人查到你头上。账户多了一串数字，你装作什么都没发生。',
          statChanges: { money: 6, mentality: -1 },
          tagAdds: ['dirty-money'],
        },
        failure: BANNED,
      },
      {
        id: 'bet-small',
        label: '押小：用别人账号小注试一下',
        description: '风险低，回报也低。',
        check: {
          primary: 'intelligence',
          dc: 0,
          detection: { chanceByStage: DETECT_SMALL },
        },
        success: {
          narrative: '账面上多了点钱，安全下庄。',
          statChanges: { money: 2, mentality: -1 },
          tagAdds: ['dirty-money'],
        },
        failure: BANNED,
      },
      {
        id: 'bet-refuse',
        label: '直接拒绝并截图给经纪人',
        description: '切干净。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, selfless: 2 },
          traitPenalties: { gambler: 2, risky: 1 },
        },
        success: {
          narrative: '你把截图发给经纪人。他回了个 "good"。你今晚睡得很好。',
          statChanges: { mentality: 2, experience: 1 },
          tagAdds: ['clean-record'],
        },
        failure: {
          narrative: '你拒绝了，但没敢上报。这件事成了心里的一根刺。',
          statChanges: { mentality: -1 },
        },
      },
    ],
  },
  {
    id: 'betting-scrim-broker',
    type: 'betting',
    title: '训练赛的"中间人"',
    narrative:
      '训练赛的对方教练单独加了你，聊着聊着问："下一把你们第二图让一下，有人愿意付你现金。"',
    stages: ['second', 'pro', 'star'],
    difficulty: 3,
    weight: 0.3,
    choices: [
      {
        id: 'bet-big',
        label: '答应：让整张图',
        description: '训练赛没人盯，风险看起来不大，但钱不少。',
        check: {
          primary: 'mentality',
          dc: 0,
          detection: { chanceByStage: DETECT_BIG },
        },
        success: {
          narrative: '对方赢了图，你收到一个加密钱包地址。没人追问。',
          statChanges: { money: 5, mentality: -2 },
          tagAdds: ['dirty-money'],
        },
        failure: BANNED,
      },
      {
        id: 'bet-small',
        label: '含糊应付，让两把关键局',
        description: '留点操作空间，不完全躺平。',
        check: {
          primary: 'intelligence',
          dc: 0,
          detection: { chanceByStage: DETECT_SMALL },
        },
        success: {
          narrative: '你只在两把关键局放水。钱到账，大部分队友没察觉。',
          statChanges: { money: 3, mentality: -2 },
          tagAdds: ['dirty-money'],
        },
        failure: BANNED,
      },
      {
        id: 'bet-refuse',
        label: '告诉队长',
        description: '让俱乐部处理。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 2, support: 2 },
          traitPenalties: { gambler: 3 },
        },
        success: {
          narrative: '队长当场打电话给俱乐部。对面教练第二天就被通报。',
          statChanges: { mentality: 1, experience: 2 },
          tagAdds: ['clean-record', 'team-trust'],
        },
        failure: {
          narrative: '你犹豫了一下没说出口，散会后整晚在复盘这个决定。',
          statChanges: { mentality: -2 },
        },
      },
    ],
  },
  {
    id: 'betting-sponsor-wink',
    type: 'betting',
    title: '赞助商的暗示',
    narrative:
      '晚宴结束前，那个大金主拍拍你肩膀：「兄弟，下一场小组赛你们肯定是黑马吧？有空我们详细聊。」他的眼神比话直接。',
    stages: ['pro', 'star', 'veteran'],
    difficulty: 4,
    weight: 0.2,
    choices: [
      {
        id: 'bet-big',
        label: '约个饭聊，看看能拿多少',
        description: '这个圈子有人这么做，也没出事。',
        check: {
          primary: 'mentality',
          dc: 0,
          detection: { chanceByStage: DETECT_BIG },
        },
        success: {
          narrative: '你拿到了一个让你几年不用愁的数字。钱没人找上门，但梦里开始出现审讯室。',
          statChanges: { money: 8, mentality: -3 },
          tagAdds: ['dirty-money'],
        },
        failure: BANNED,
      },
      {
        id: 'bet-small',
        label: '只给他点"模糊赛前信息"',
        description: '不直接放水，只是多说两句。',
        check: {
          primary: 'intelligence',
          dc: 0,
          detection: { chanceByStage: DETECT_SMALL },
        },
        success: {
          narrative: '你给了他几个含糊的判断。他收到后给了笔咨询费。',
          statChanges: { money: 3, mentality: -1 },
          tagAdds: ['dirty-money'],
        },
        failure: BANNED,
      },
      {
        id: 'bet-refuse',
        label: '礼貌切掉，之后避开饭局',
        description: '以后这类局都不去。',
        check: {
          primary: 'mentality',
          dc: 10,
          traitBonuses: { steady: 3, selfless: 2 },
          traitPenalties: { gambler: 3, risky: 2, ego: 1 },
        },
        success: {
          narrative: '你委婉地把话题岔开，之后也不再出席他召集的场子。干净。',
          statChanges: { mentality: 2 },
          tagAdds: ['clean-record'],
        },
        failure: {
          narrative: '你没去赴约，但也没说破。之后他的名字在圈子里偶尔飘过来，你躲得心累。',
          statChanges: { mentality: -2 },
        },
      },
    ],
  },
];
