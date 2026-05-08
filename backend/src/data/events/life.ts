import type { EventDef } from '../../types.js';

export const LIFE_EVENTS: EventDef[] = [
  {
    id: 'life-family-call',
    type: 'life',
    title: '凌晨三点的家里来电',
    narrative:
      '训练到凌晨三点，手机震动：家人问你「还在打游戏吗？到底什么时候回家？」',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'honest-talk',
        label: '认真聊一下，解释规划',
        description: '修复关系，但耗费心神。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { steady: 2, tactical: 1 },
        },
        success: {
          narrative: '你把自己的训练计划和目标一条条解释清楚，对方沉默后说了声「注意身体」。',
          statChanges: { mentality: 2, intelligence: 1 },
        },
        failure: {
          narrative: '话题很快滑向争吵，你挂电话后一整晚没睡好。',
          statChanges: { mentality: -2 },
        },
      },
      {
        id: 'avoid-call',
        label: '挂掉，明天再说',
        description: '当下省事，后患无穷。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { ego: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '你先稳住当下的情绪，第二天早上才回电话。',
          statChanges: { mentality: 1, experience: -1 },
          tagAdds: ['family-strain'],
        },
        failure: {
          narrative: '手机被你静音后你根本没睡着，脑子里全是那句话。',
          statChanges: { mentality: -2 },
          tagAdds: ['family-strain'],
        },
      },
      {
        id: 'send-money',
        label: '直接转一笔钱给家里',
        description: '用物质表达态度。',
        check: {
          primary: 'money',
          dc: 8,
          traitBonuses: { streamer: 1 },
          traitPenalties: { shy: 1 },
        },
        success: {
          narrative: '钱到账的那一刻家里的态度明显软化，但你账户里只剩几个数字。',
          statChanges: { money: -30, mentality: 2 },
        },
        failure: {
          narrative: '你没那么多钱，硬转让自己更焦虑。',
          statChanges: { money: -20, mentality: -2 },
        },
      },
    ],
  },
  {
    id: 'life-wrist-pain',
    type: 'life',
    title: '手腕隐隐作痛',
    narrative:
      '连续训练三周后，你的手腕开始疼。你该怎么办？',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    choices: [
      {
        id: 'see-doctor',
        label: '看医生、下一周休息',
        description: '短期损失，长期收益。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 2 },
        },
        success: {
          narrative: '医生让你下周停训。休养后你感觉连点击鼠标都轻松了。',
          statChanges: { agility: 1, mentality: 1, money: -10, experience: -1 },
        },
        failure: {
          narrative: '你听医生嘱咐但忍不住还是偷偷练了，效果打折。',
          statChanges: { mentality: -1 },
        },
      },
      {
        id: 'push-through',
        label: '忍一忍，再硬练两周',
        description: '赌年轻。',
        check: {
          primary: 'mentality',
          secondary: 'agility',
          dc: 13,
          traitBonuses: { grinder: 2, clutch: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '你挺了过来，状态反而被练到极致。',
          statChanges: { agility: 2, experience: 2, mentality: -1 },
        },
        failure: {
          narrative: '你的手腕彻底撑不住，需要停训一个月。',
          statChanges: { agility: -3, mentality: -2, money: -20 },
          tagAdds: ['injured'],
        },
      },
      {
        id: 'buy-gear',
        label: '买人体工学外设 + 康复师',
        description: '花钱消灾。',
        check: {
          primary: 'money',
          dc: 10,
          traitBonuses: { streamer: 1 },
          traitPenalties: { lazy: 1 },
        },
        success: {
          narrative: '设备换了、康复师到位，你的状态迅速回升。',
          statChanges: { agility: 1, mentality: 1, money: -30 },
        },
        failure: {
          narrative: '你买了贵设备，但没坚持康复训练，效果不理想。',
          statChanges: { money: -30, mentality: -1 },
        },
      },
    ],
  },
];
