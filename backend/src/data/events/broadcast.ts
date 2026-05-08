import type { EventDef } from '../../types.js';

// Broadcast events fire when the Major resolves (weeks 23/47) but the player
// didn't participate. They use the synthetic tag 'major-broadcast' which is
// injected by engine/events.ts based on player state.
export const BROADCAST_EVENTS: EventDef[] = [
  {
    id: 'broadcast-major-result',
    type: 'media',
    title: '本届 Major 落幕：{rival0} 捧杯',
    narrative:
      '你刷推特时看到本届 Major 决赛结果——{rival0} 让二追三横扫 {rival1} 拿下冠军。圈子热闹了一周。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 1.5,
    requireTags: ['major-broadcast'],
    choices: [
      {
        id: 'congrats',
        label: '发条祝贺动态',
        description: '正能量。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { steady: 1, selfless: 1 },
        },
        success: {
          narrative: '{rival0} 官号回了你一个握手 emoji，粉丝觉得你大气。',
          statChanges: {},
          fameDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '动态没人看，反而有酸民截图说你在蹭流量。',
          statChanges: { mentality: -1 },
          fameDelta: -1,
          stressDelta: 2,
        },
      },
      {
        id: 'study-vod',
        label: '反复看决赛 demo 学习',
        description: '务实派。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { tactical: 2, steady: 1 },
        },
        success: {
          narrative: '你抠到了 {rival0} IGL 的两个 setup 思路，下周训练赛你直接抄了一个。',
          statChanges: { intelligence: 1, experience: 1 },
          stressDelta: -1,
        },
        failure: {
          narrative: '看了三个小时，记住的没几条，时间没了。',
          statChanges: {},
          stressDelta: 1,
        },
      },
      {
        id: 'sour-grapes',
        label: '关掉手机，假装没看见',
        description: '逃避一下。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { ego: 2, volatile: 1 },
        },
        success: {
          narrative: '你睡了一觉，醒来心态平了。下次轮到自己。',
          statChanges: { mentality: 1 },
          stressDelta: -1,
        },
        failure: {
          narrative: '越逃避越不爽，半夜还在脑补"我上我也行"。',
          statChanges: { mentality: -1 },
          stressDelta: 3,
        },
      },
    ],
  },
];
