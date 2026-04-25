import type { EventDef } from '../../types.js';

export const TRYOUT_EVENTS: EventDef[] = [
  {
    id: 'tryout-invite',
    type: 'tryout',
    title: '二线队的试训邀约',
    narrative:
      '一支二线队发来试训邀请，三天吃住自付，第四天打训练赛定去留。',
    stages: ['rookie', 'youth'],
    difficulty: 2,
    choices: [
      {
        id: 'accept-tryout',
        label: '立刻收拾行李去',
        description: '孤注一掷。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 12,
          traitBonuses: { mechanical: 2, grinder: 2, clutch: 2 },
        },
        success: {
          narrative: '三天的训练赛，你打出近一个月最好的表现，签下意向书。',
          statChanges: { experience: 3, mentality: 2, money: -2 },
          stageDelta: 1,
          tagAdds: ['signed-second-team'],
        },
        failure: {
          narrative: '旅途劳顿，你表现一般，教练让你回去继续练。',
          statChanges: { experience: 1, mentality: -2, money: -2 },
        },
      },
      {
        id: 'negotiate-tryout',
        label: '回邮件争取路费和合约条款',
        description: '冷静谈判。',
        check: {
          primary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 2, streamer: 1, media: 1 },
        },
        success: {
          narrative: '对方同意报销路费并加一条保障条款，你以更稳的状态赴约。',
          statChanges: { intelligence: 1, money: 2, experience: 2 },
          stageDelta: 1,
          tagAdds: ['signed-second-team'],
        },
        failure: {
          narrative: '对方觉得你要求太多，直接收回邀请。',
          statChanges: { mentality: -2 },
        },
      },
      {
        id: 'decline-tryout',
        label: '拒绝，先把路人分刷到前 100',
        description: '继续在舒适区。',
        check: {
          primary: 'experience',
          dc: 7,
          traitBonuses: { solo: 2 },
        },
        success: {
          narrative: '你专心打路人，三天后天梯前 100，但机会窗口关上了。',
          statChanges: { experience: 2, agility: 1, mentality: -1 },
        },
        failure: {
          narrative: '你天梯也没打上去，机会又没抓住。',
          statChanges: { mentality: -2 },
        },
      },
    ],
  },
];
