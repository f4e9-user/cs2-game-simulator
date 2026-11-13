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
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.5,
    requireTags: ['stressed'],
    narrativeMeta: {
      eventId: 'stress-insomnia',
      emotionTone: '高压下的自我怀疑或对外爆发',
      traitReactions: {
        scapegoat: {
          emphasis: ['把所有压力揽到自己身上', '失眠时反复 replay 自己的失误'],
          avoid: ['不要写成向外发泄', '不要写成轻松化解'],
        },
        hothead: {
          emphasis: ['愤怒爆发', '想找个人吵架'],
          avoid: ['不要写成无缘无故的发火', '不要写成攻击队友'],
        },
        'tactical-mind': {
          emphasis: ['试图用分析拆解压力源，但越分析越清醒'],
          avoid: ['不要写成完全理性不受影响'],
        },
      },
    },
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
          stateDelta: {
            feel: 1,
            stress: -20,
          },
        },
        failure: {
          narrative: '冥想反而让你更清醒。第二天黑眼圈到颧骨。',
          stateDelta: {
            feel: -0.5,
            stress: 5,
          },
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
          stateDelta: {
            feel: 0.5,
            stress: -15,
          },
          resourceDelta: {
            money: -10,
          },
        },
        failure: {
          narrative: '药吃了反应不对，醒来比没睡还累。',
          stateDelta: {
            feel: -1,
            tilt: 1,
            fatigue: 8,
            stress: 10,
          },
          resourceDelta: {
            money: -10,
          },
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
          stateDelta: {
            feel: 0.6,
            fatigue: 16,
            stress: 15,
          },
        },
        failure: {
          narrative: '通宵越练越烦，最后键盘都被你砸了一下。',
          stateDelta: {
            feel: -1,
            tilt: 1,
            stress: 20,
          },
          resourceDelta: {
            money: -20,
          },
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
    stages: ['second', 'pro'],
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
          stateDelta: {
            feel: 1.4,
            stress: -10,
          },
          tags: {
            add: ['team-trust'],
          },
        },
        failure: {
          narrative: '你忍住了，但复盘后躲在房间一根烟一根烟。',
          stateDelta: {
            feel: -0.5,
            fatigue: 8,
            stress: 5,
          },
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
          stateDelta: {
            feel: 0.5,
            stress: 0,
          },
        },
        failure: {
          narrative: '会议直接吵起来，队内氛围降到冰点。',
          stateDelta: {
            feel: -1.5,
            tilt: 1,
            stress: 25,
          },
          resourceDelta: {
            fame: -1,
          },
          tags: {
            add: ['locker-tension'],
          },
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
          stateDelta: {
            feel: -0.5,
            stress: 5,
          },
        },
        failure: {
          narrative: '你直接收拾东西走人。第二天经纪人电话不停。',
          stateDelta: {
            feel: -1.5,
            tilt: 1,
            stress: 30,
          },
          resourceDelta: {
            money: -20,
            fame: -3,
          },
          tags: {
            add: ['locker-tension'],
          },
        },
      },
    ],
  },
];
