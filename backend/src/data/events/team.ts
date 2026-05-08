import type { EventDef } from '../../types.js';

export const TEAM_EVENTS: EventDef[] = [
  {
    id: 'team-role-clash',
    type: 'team',
    title: '主 AWP 位之争',
    narrative:
      '新赛季队内调整：你和队友都想拿主 AWP 位。教练让你们自己先沟通一下。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 2,
    choices: [
      {
        id: 'stake-role',
        label: '硬争：秀一局给他看',
        description: '靠比赛表现说话。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 12,
          traitBonuses: { awper: 3, mechanical: 2 },
          traitPenalties: { support: 2 },
        },
        success: {
          narrative: '你在训练赛里拿下 32 杀，队长点头。',
          statChanges: { agility: 2, experience: 2, mentality: 1 },
          tagAdds: ['main-awper'],
        },
        failure: {
          narrative: '你表现一般，反倒让对方更有底气。',
          statChanges: { mentality: -2 },
          tagAdds: ['locker-tension'],
        },
      },
      {
        id: 'share-role',
        label: '提议：按图分配',
        description: '各自拿自己擅长的地图。',
        check: {
          primary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 3, support: 2, steady: 2 },
        },
        success: {
          narrative: '你列了每个人擅长的图，队长觉得合理。队内气氛放松不少。',
          statChanges: { intelligence: 2, mentality: 1, experience: 1 },
        },
        failure: {
          narrative: '方案看起来合理，但执行起来总是扯皮。',
          statChanges: { mentality: -1 },
        },
      },
      {
        id: 'yield-role',
        label: '退一步：我打步枪位',
        description: '保全队内关系。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { support: 3, steady: 2 },
          traitPenalties: { mechanical: 1 },
        },
        success: {
          narrative: '对方很感激，队内关系紧密了一层。',
          statChanges: { mentality: 2, experience: 1 },
          tagAdds: ['team-trust'],
        },
        failure: {
          narrative: '你心里其实不服，表面平静。',
          statChanges: { mentality: -1 },
          tagAdds: ['suppressed-anger'],
        },
      },
    ],
  },
];
