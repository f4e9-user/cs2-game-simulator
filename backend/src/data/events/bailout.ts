import type { EventDef } from '../../types.js';

const ALL_STAGES: EventDef['stages'] = ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'];

export const BAILOUT_EVENTS: EventDef[] = [
  {
    id: 'bailout-family-loan',
    type: 'bailout',
    title: '父母的电话',
    narrative:
      '妈妈打来电话，问你最近过得怎么样。你犹豫了一下，还是说了实话。电话那头沉默了很久，然后爸爸接过电话，说：“先把日子过下去，别硬撑。”',
    stages: ALL_STAGES,
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-bailout'],
    choices: [
      {
        id: 'accept-loan',
        label: '接受家里的周转',
        description: '先把这一关撑过去。',
        check: { primary: 'mentality', dc: 4 },
        success: {
          narrative: '家里给你转来一笔周转金。虽然你知道这钱要记在心里，但至少今晚不用再盯着余额发呆。',
          moneyDelta: 30,
          stressDelta: -4,
          fameDelta: -3,
        },
        failure: {
          narrative: '你嘴上说着“我自己能扛”，但最后还是收下了这笔钱。电话挂断后，你的压力反而更重了。',
          moneyDelta: 20,
          stressDelta: 2,
          fameDelta: -2,
        },
      },
    ],
  },
  {
    id: 'bailout-family-gift',
    type: 'bailout',
    title: '家里寄来的红包',
    narrative:
      '一个熟悉的快递到了，里面是家里塞给你的现金和一句手写纸条：“先顾好自己，比赛以后再说。”',
    stages: ALL_STAGES,
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-bailout'],
    choices: [
      {
        id: 'take-gift',
        label: '收下这份心意',
        description: '先解决眼前的窟窿。',
        check: { primary: 'mentality', dc: 3 },
        success: {
          narrative: '你把红包收进口袋，心里却沉了一下。钱能解燃眉之急，但欠下的是一份人情。',
          moneyDelta: 20,
          stressDelta: 3,
        },
        failure: {
          narrative: '你盯着红包看了很久，最后还是收下了。那种难受没消失，只是被你暂时压住了。',
          moneyDelta: 15,
          stressDelta: 4,
          fameDelta: -1,
        },
      },
    ],
  },
  {
    id: 'bailout-old-friend',
    type: 'bailout',
    title: '老朋友出手',
    narrative:
      '一个很久没联系的老朋友突然发消息：“我听说你最近有点难。钱不多，先拿着，别跟我客气。”',
    stages: ALL_STAGES,
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-bailout'],
    choices: [
      {
        id: 'borrow-friend',
        label: '记下这份情',
        description: '先渡过难关。',
        check: { primary: 'experience', dc: 5 },
        success: {
          narrative: '你收下了这笔钱，也记下了这次帮忙。老朋友的手伸过来时，你确实没那么孤单了。',
          moneyDelta: 40,
          stressDelta: -2,
          fameDelta: -5,
        },
        failure: {
          narrative: '你本来还想逞强，但对方根本不给你拒绝的机会。钱到了，面子也被按了回去。',
          moneyDelta: 35,
          stressDelta: 1,
          fameDelta: -4,
        },
      },
    ],
  },
];
