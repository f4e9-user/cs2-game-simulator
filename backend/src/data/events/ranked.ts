import type { EventDef } from '../../types.js';

export const RANKED_EVENTS: EventDef[] = [
  {
    id: 'ranked-toxic-team',
    type: 'ranked',
    title: '路人局，队友互喷',
    narrative:
      '上分局 1:5 落后，队里两个人开始在语音里吵，你开始后背发凉。',
    stages: ['rookie', 'youth', 'second'],
    difficulty: 2,
    choices: [
      {
        id: 'mute-and-carry',
        label: '全部屏蔽，我一个人秀',
        description: '靠个人能力翻盘，风险大。',
        check: {
          primary: 'agility',
          dc: 13,
          traitBonuses: { solo: 3, mechanical: 2 },
        },
        success: {
          narrative: '你连续三把大的，把队伍硬拉回 1v1 残局并取胜。',
          statChanges: { agility: 2, experience: 2, mentality: 1 },
        },
        failure: {
          narrative: '你想 carry 但被架点点死，语音里又多了一个喷你的人。',
          statChanges: { agility: 0, mentality: -2 },
        },
      },
      {
        id: 'call-shots',
        label: '自己上麦指挥',
        description: '让一切有序起来。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 11,
          traitBonuses: { igl: 3, tactical: 2, steady: 1 },
        },
        success: {
          narrative: '你冷静分工、给信息，队友慢慢冷静下来，比赛被你拉平。',
          statChanges: { intelligence: 2, mentality: 2, experience: 1 },
          tagAdds: ['natural-igl'],
        },
        failure: {
          narrative: '没人听你，你越说越尴尬。',
          statChanges: { mentality: -2 },
        },
      },
      {
        id: 'quit-ranked',
        label: '直接退游戏，冷静一下',
        description: '降一点天梯分换一个好心态。',
        check: {
          primary: 'mentality',
          dc: 6,
        },
        success: {
          narrative: '你关掉电脑，下楼买了杯冰美式。',
          statChanges: { mentality: 3, experience: -1 },
        },
        failure: {
          narrative: '你退了游戏，但仍在脑子里反复 replay 那波架点。',
          statChanges: { mentality: 0 },
        },
      },
    ],
  },
  {
    id: 'ranked-highlight-clip',
    type: 'ranked',
    title: '一记看似不可能的 1v3',
    narrative: 'A 点剩你一个，对面三人冲点，你只剩一把 USP 和 15 发子弹。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 3,
    choices: [
      {
        id: 'hold-awp-angle',
        label: '架窄道、用余光听脚步',
        description: '考验反应。',
        check: {
          primary: 'agility',
          dc: 14,
          traitBonuses: { awper: 2, mechanical: 2, clutch: 3 },
        },
        success: {
          narrative: '三人先后被你一枪爆头，集锦自动保存。',
          statChanges: { agility: 2, experience: 2, mentality: 2, money: 1 },
          tagAdds: ['highlight-clip'],
        },
        failure: {
          narrative: '你架错了角度，被对面一波平 A 抹掉。',
          statChanges: { mentality: -1 },
        },
      },
      {
        id: 'clutch-play',
        label: '躲盲点等报点，打心理',
        description: '考验心态和读局。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 13,
          traitBonuses: { clutch: 3, tactical: 2, steady: 2 },
        },
        success: {
          narrative: '你屏住呼吸等对面报了点，三个人一个接一个走进你的准星。',
          statChanges: { mentality: 2, intelligence: 2, experience: 2 },
          tagAdds: ['highlight-clip'],
        },
        failure: {
          narrative: '你等到的是一个闪光弹。',
          statChanges: { mentality: -2 },
        },
      },
      {
        id: 'play-for-info',
        label: '故意暴露一下收集信息',
        description: '就算死了也把信息留给队友。',
        check: {
          primary: 'intelligence',
          dc: 9,
          traitBonuses: { support: 3, tactical: 2 },
        },
        success: {
          narrative: '你在死之前报出了三个人的位置，下一局队友零封回来。',
          statChanges: { experience: 2, intelligence: 1 },
        },
        failure: {
          narrative: '你刚露头就被击杀，麦克风里甚至来不及说话。',
          statChanges: { experience: 0, mentality: -1 },
        },
      },
    ],
  },
];
