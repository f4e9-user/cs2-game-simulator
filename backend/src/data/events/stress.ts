import type { EventDef } from '../../types.js';

// These events are filtered IN by pickEvent() only when player.stress is high
// (see engine/events.ts). They model the side-effects of a maxed-out player.
export const STRESS_EVENTS: EventDef[] = [
  {
    id: 'stress-insomnia',
    type: 'life',
    title: '又一次失眠',
    narrative:
      '凌晨三点你还盯着天花板，脑子里全是上一场最后那把残局。',
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 1,
    weight: 0.5,
    requireTags: ['stressed'],
    choices: [
      {
        id: 'meditation',
        label: '听冥想 App 强行睡',
        description: '尝试放空。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { steady: 2 },
        },
        success: {
          narrative: '你睡到中午，醒来感觉脑子终于装回了壳。',
          statChanges: { mentality: 2 },
          stressDelta: -4,
        },
        failure: {
          narrative: '冥想反而让你更清醒。第二天黑眼圈到颧骨。',
          statChanges: { mentality: -1 },
          stressDelta: 1,
        },
      },
      {
        id: 'sleeping-pill',
        label: '吃半片助眠药',
        description: '生效快，副作用大。',
        check: {
          primary: 'money',
          dc: 6,
        },
        success: {
          narrative: '你睡了 8 小时，第二天人是飘的，但脑子总算停了。',
          statChanges: { money: -1, mentality: 1 },
          stressDelta: -3,
        },
        failure: {
          narrative: '药吃了反应不对，醒来比没睡还累。',
          statChanges: { money: -1, mentality: -2, constitution: -1 },
          stressDelta: 2,
        },
      },
      {
        id: 'overnight-grind',
        label: '索性开机训练',
        description: '把焦虑用枪击解决。',
        check: {
          primary: 'agility',
          dc: 11,
          traitBonuses: { obsessed: 3, grinder: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '通宵后你打出最佳手感，但代价是接下来一周状态飘忽。',
          statChanges: { agility: 1, experience: 1, constitution: -2 },
          stressDelta: 3,
        },
        failure: {
          narrative: '通宵越练越烦，最后键盘都被你砸了一下。',
          statChanges: { mentality: -2, money: -2 },
          stressDelta: 4,
        },
      },
    ],
  },
  {
    id: 'stress-snap',
    type: 'team',
    title: '复盘会上没忍住',
    narrative:
      '复盘会进行到一半，教练第三次问你那把架点为什么不交。你的火气一下窜上来。',
    stages: ['second', 'pro', 'star'],
    difficulty: 2,
    weight: 0.6,
    requireTags: ['stressed'],
    choices: [
      {
        id: 'apologize-fast',
        label: '咬住舌头，下来私下道歉',
        description: '把场面控制住。',
        check: {
          primary: 'mentality',
          dc: 10,
          traitBonuses: { steady: 3, support: 2 },
          traitPenalties: { volatile: 3, ego: 2 },
        },
        success: {
          narrative: '你深呼吸三次，会议平稳过去。下来你单独和教练沟通了原因。',
          statChanges: { mentality: 2, intelligence: 1 },
          stressDelta: -2,
          tagAdds: ['team-trust'],
        },
        failure: {
          narrative: '你忍住了，但复盘后躲在房间一根烟一根烟。',
          statChanges: { mentality: -1, constitution: -1 },
          stressDelta: 1,
        },
      },
      {
        id: 'talk-back',
        label: '直接顶回去：「那把就该让我」',
        description: '撕开来说。',
        check: {
          primary: 'mentality',
          dc: 13,
          traitBonuses: { volatile: 3 },
          traitPenalties: { steady: 2, support: 2 },
        },
        success: {
          narrative: '出乎意料，教练沉默了一下，承认你说得有理。',
          statChanges: { mentality: 1, experience: 1 },
          stressDelta: 0,
        },
        failure: {
          narrative: '会议直接吵起来，队内氛围降到冰点。',
          statChanges: { mentality: -3 },
          fameDelta: -1,
          stressDelta: 5,
          tagAdds: ['locker-tension'],
        },
      },
      {
        id: 'walk-out',
        label: '摔门走人',
        description: '彻底决裂。',
        check: {
          primary: 'mentality',
          dc: 15,
          traitBonuses: { ego: 3, volatile: 2 },
          traitPenalties: { steady: 3, support: 3 },
        },
        success: {
          narrative: '你走出去后冷静了，半小时后回来道歉。气氛尴尬但保住了。',
          statChanges: { mentality: -1 },
          stressDelta: 1,
        },
        failure: {
          narrative: '你直接收拾东西走人。第二天经纪人电话不停。',
          statChanges: { mentality: -3, money: -2 },
          fameDelta: -3,
          stressDelta: 6,
          tagAdds: ['locker-tension'],
        },
      },
    ],
  },
];
