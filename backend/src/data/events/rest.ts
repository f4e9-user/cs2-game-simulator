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
          statChanges: { constitution: 3, mentality: 2 },
          stressDelta: -3,
        },
        failure: {
          narrative: '你半夜偷偷摸过键盘，恢复打了折扣。',
          statChanges: { constitution: 1, mentality: 1 },
          stressDelta: -1,
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
          statChanges: { constitution: 2, agility: 1 },
          stressDelta: -1,
        },
        failure: {
          narrative: '不小心练狠了，疼了两天，康复效果一般。',
          statChanges: { constitution: 1 },
          stressDelta: 0,
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
          statChanges: { money: 20, constitution: 1 },
          stressDelta: 1,
        },
        failure: {
          narrative: '撑不住，开播一个半小时就下播。什么都没收获。',
          statChanges: { constitution: 0, mentality: -1 },
          stressDelta: 2,
        },
      },
    ],
  },

  // ── 二线及以上：俱乐部有队医资源 ─────────────────────────────────
  {
    id: 'rest-physio',
    type: 'rest',
    title: '被队医按在床上',
    narrative:
      '俱乐部队医看了 MRI 单子，把键盘从你手里抽走：「你这周就躺着。」',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 1,
    weight: 1,
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
          statChanges: { constitution: 3, mentality: 2 },
          stressDelta: -3,
        },
        failure: {
          narrative: '你半夜偷偷摸过键盘，恢复打了折扣。',
          statChanges: { constitution: 1, mentality: 1 },
          stressDelta: -1,
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
          statChanges: { constitution: 2, agility: 1 },
          stressDelta: -1,
        },
        failure: {
          narrative: '你不慎练狠了，康复效果一般。',
          statChanges: { constitution: 1 },
          stressDelta: 0,
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
          statChanges: { money: 20, constitution: 1 },
          stressDelta: 1,
        },
        failure: {
          narrative: '你撑不住，开播一个半小时就下播。什么都没收获。',
          statChanges: { constitution: 0, mentality: -1 },
          stressDelta: 2,
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
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
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
          statChanges: { constitution: 2, mentality: 2 },
          stressDelta: -4,
        },
        failure: {
          narrative: '你睡得不安稳，总梦到自己站起来一枪就是 miss。',
          statChanges: { constitution: 1, mentality: 0 },
          stressDelta: -1,
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
          statChanges: { constitution: 2, mentality: 3, money: 10 },
          stressDelta: -4,
          tagAdds: ['family-support'],
        },
        failure: {
          narrative: '话题绕来绕去，最后又绕回熟悉的争执。',
          statChanges: { constitution: 1, mentality: -1 },
          stressDelta: -1,
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
          statChanges: { constitution: 1, intelligence: 1, experience: 1 },
          stressDelta: -2,
        },
        failure: {
          narrative: '写到一半你又开始焦虑输赢，计划没写完。',
          statChanges: { constitution: 1 },
          stressDelta: 0,
        },
      },
    ],
  },
];
