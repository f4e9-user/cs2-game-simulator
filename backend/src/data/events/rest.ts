import type { EventDef } from '../../types.js';

// Rest events fire only when the player has restRounds > 0 (forced by injury
// or physical collapse). Engine decrements restRounds each time a rest event
// is consumed — see gameEngine.applyChoice.
export const REST_EVENTS: EventDef[] = [
  // ── 路人 / 青训：没有俱乐部队医，靠自己或家人处理 ────────────────
  {
    id: 'rest-physio-rookie',
    type: 'rest',
    title: '手腕撑不住了',
    narrative:
      '你翻了翻手腕，肌腱又酸又胀。网上查了说是 RSI，意思是必须停下来，不然可能留下永久损伤。',
    stages: ['rookie', 'youth'],
    difficulty: 1,
    weight: 1,
    forbidTags: ['has-team'],
    narrativeMeta: {
      eventId: 'rest-physio-rookie',
      emotionTone: '被迫暂停的焦躁与无力',
      traitReactions: {
        scapegoat: {
          emphasis: ['觉得休息是在拖累团队进度', '康复期间也在想训练'],
          avoid: ['不要写成享受休息', '不要写成理所当然'],
        },
        hothead: {
          emphasis: ['对伤病或休息安排感到愤怒', '想提前结束休养'],
          avoid: ['不要写成攻击医疗人员', '不要写成破坏康复计划'],
        },
        grinder: {
          emphasis: ['休息时也想着训练计划', '身体在休息脑子在跑图'],
          avoid: ['不要写成完全放松'],
        },
      },
    },
    choices: [
      {
        id: 'full-rest',
        label: '老实在家躺满一周，冰敷加按摩',
        description: '完全修养，恢复体质和心态。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { steady: 2 },
          traitPenalties: { grinder: 2, obsessed: 2 },
        },
        success: {
          narrative: '一周后你感觉手腕轻盈，脑子也清爽了不少。',
          stateDelta: {
            feel: 1,
            fatigue: -12,
            stress: -15,
          },
        },
        failure: {
          narrative: '你半夜偷偷摸过键盘，恢复打了折扣。',
          stateDelta: {
            feel: 0.5,
            fatigue: -4,
            stress: -5,
          },
        },
      },
      {
        id: 'light-drill',
        label: '只做轻量练习，不碰正式局',
        description: '折中：稍微恢复，但保留手感。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 1, tactical: 1 },
        },
        success: {
          narrative: '克制地练了几组反应训练，身体也跟着缓过来了。',
          stateDelta: {
            feel: 0.6,
            fatigue: -8,
            stress: -5,
          },
        },
        failure: {
          narrative: '不小心练狠了，疼了两天，康复效果一般。',
          stateDelta: {
            fatigue: -4,
            stress: 0,
          },
        },
      },
      {
        id: 'sneak-stream',
        label: '偷偷开播两小时',
        description: '赚一点钱，休养被打断。',
        check: {
          primary: 'money',
          dc: 6,
          traitBonuses: { streamer: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '观众不多，但礼物够你下周点几顿外卖。',
          stateDelta: {
            fatigue: -4,
            stress: 5,
          },
          resourceDelta: {
            money: 20,
          },
        },
        failure: {
          narrative: '撑不住，开播一个半小时就下播。什么都没收获。',
          stateDelta: {
            feel: -0.5,
            stress: 10,
          },
        },
      },
    ],
  },

  // ── 二线及以上：俱乐部有队医资源 ─────────────────────────────────
  {
    id: 'rest-private-clinic',
    type: 'rest',
    title: '私人诊所的休养建议',
    narrative:
      '你自己约了运动康复诊所。医生看完检查结果，把训练计划推回给你：「这周先别碰高强度对抗，不然恢复期只会更长。」',
    stages: ['second', 'pro'],
    difficulty: 1,
    weight: 1,
    forbidTags: ['has-team'],
    choices: [
      {
        id: 'full-rest',
        label: '按医嘱完整休息',
        description: '完全休养，恢复体质和心态。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { steady: 2 },
          traitPenalties: { grinder: 2, obsessed: 2 },
        },
        success: {
          narrative: '你把提醒设好，真的停了一周。疼痛退下去之后，手感也没你想象中掉得那么厉害。',
          stateDelta: {
            feel: 1,
            fatigue: -12,
            stress: -15,
          },
        },
        failure: {
          narrative: '你忍不住做了几组轻练，疼痛没有恶化，但恢复也没那么彻底。',
          stateDelta: {
            feel: 0.5,
            fatigue: -4,
            stress: -5,
          },
        },
      },
      {
        id: 'light-drill',
        label: '只做低强度恢复训练',
        description: '折中：稍微恢复，但保留状态。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 1, tactical: 1 },
        },
        success: {
          narrative: '你把训练降到医生允许的强度，身体缓了过来，脑子也没完全离开比赛。',
          stateDelta: {
            feel: 0.6,
            fatigue: -8,
            stress: -5,
          },
        },
        failure: {
          narrative: '你还是多练了一点，康复效果被打了折扣。',
          stateDelta: {
            fatigue: -4,
            stress: 0,
          },
        },
      },
      {
        id: 'sneak-stream',
        label: '偷偷开播两小时',
        description: '赚一点钱，休养被打断。',
        check: {
          primary: 'money',
          dc: 6,
          traitBonuses: { streamer: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '观众不多，但礼物够你下周点几顿外卖。',
          stateDelta: {
            fatigue: -4,
            stress: 5,
          },
          resourceDelta: {
            money: 20,
          },
        },
        failure: {
          narrative: '你撑不住，开播一个半小时就下播。什么都没收获。',
          stateDelta: {
            feel: -0.5,
            stress: 10,
          },
        },
      },
    ],
  },
  {
    id: 'rest-physio',
    type: 'rest',
    title: '被队医按在床上',
    narrative:
      '俱乐部队医看了 MRI 单子，把键盘从你手里抽走：「你这周就躺着。」',
    stages: ['youth', 'second', 'pro'],
    difficulty: 1,
    weight: 1,
    requireTags: ['has-team'],
    choices: [
      {
        id: 'full-rest',
        label: '老老实实躺满一周',
        description: '完全休养，恢复体质和心态。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { steady: 2 },
          traitPenalties: { grinder: 2, obsessed: 2 },
        },
        success: {
          narrative: '一周后你感觉手腕轻盈，脑子也清爽了不少。',
          stateDelta: {
            feel: 1,
            fatigue: -12,
            stress: -15,
          },
        },
        failure: {
          narrative: '你半夜偷偷摸过键盘，恢复打了折扣。',
          stateDelta: {
            feel: 0.5,
            fatigue: -4,
            stress: -5,
          },
        },
      },
      {
        id: 'light-drill',
        label: '只做轻量反应训练',
        description: '折中：稍微恢复，但保留状态。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 1, tactical: 1 },
        },
        success: {
          narrative: '轻量枪感训练加上康复，你既没退步也养好了身板。',
          stateDelta: {
            feel: 0.6,
            fatigue: -8,
            stress: -5,
          },
        },
        failure: {
          narrative: '你不慎练狠了，康复效果一般。',
          stateDelta: {
            fatigue: -4,
            stress: 0,
          },
        },
      },
      {
        id: 'sneak-stream',
        label: '偷偷开播两小时',
        description: '赚一点钱，休养被打断。',
        check: {
          primary: 'money',
          dc: 6,
          traitBonuses: { streamer: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '观众不多，但礼物够你下周点几顿外卖。',
          stateDelta: {
            fatigue: -4,
            stress: 5,
          },
          resourceDelta: {
            money: 20,
          },
        },
        failure: {
          narrative: '你撑不住，开播一个半小时就下播。什么都没收获。',
          stateDelta: {
            feel: -0.5,
            stress: 10,
          },
        },
      },
    ],
  },
  {
    id: 'rest-family-visit',
    type: 'rest',
    title: '回家一趟',
    narrative:
      '强制休养期间，家人让你回去住几天。桌上有你高中时候的照片。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.7,
    choices: [
      {
        id: 'full-break',
        label: '什么也不想，睡到自然醒',
        description: '纯粹恢复。',
        check: {
          primary: 'mentality',
          dc: 4,
          traitBonuses: { steady: 1 },
          traitPenalties: { grinder: 1, obsessed: 1 },
        },
        success: {
          narrative: '你睡了三天好觉。回程路上你甚至开始期待下一场。',
          stateDelta: {
            feel: 1,
            fatigue: -8,
            stress: -20,
          },
        },
        failure: {
          narrative: '你睡得不安稳，总梦到自己站起来一枪就是 miss。',
          stateDelta: {
            fatigue: -4,
            stress: -5,
          },
        },
      },
      {
        id: 'heart-to-heart',
        label: '和爸妈长谈一次',
        description: '情感修复，可能有意外收获。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { steady: 2, selfless: 1 },
          traitPenalties: { shy: 2, ego: 1 },
        },
        success: {
          narrative: '你们第一次完整地聊这件事，最后妈妈帮你熬了一锅汤。',
          stateDelta: {
            feel: 1.5,
            fatigue: -8,
            stress: -20,
          },
          resourceDelta: {
            money: 10,
          },
          tags: {
            add: ['family-support'],
          },
        },
        failure: {
          narrative: '话题绕来绕去，最后又绕回熟悉的争执。',
          stateDelta: {
            feel: -0.5,
            fatigue: -4,
            stress: -5,
          },
        },
      },
      {
        id: 'quiet-review',
        label: '一个人在房间里写训练计划',
        description: '边养边想，战术收获。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { tactical: 2, steady: 1 },
        },
        success: {
          narrative: '你把下阶段的训练量、复盘节奏都写成表格，贴在书桌上。',
          stateDelta: {
            feel: 0.4,
            fatigue: -4,
            stress: -10,
          },
        },
        failure: {
          narrative: '写到一半你又开始焦虑输赢，计划没写完。',
          stateDelta: {
            fatigue: -4,
            stress: 0,
          },
        },
      },
    ],
  },
];
