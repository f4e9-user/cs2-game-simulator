import type { EventDef } from '../../types.js';

export const MEDIA_EVENTS: EventDef[] = [
  {
    id: 'media-post-game-interview',
    type: 'media',
    title: '赛后采访',
    narrative:
      '你摘下耳机，采访的话筒已经伸过来：「这把最后那波是怎么想的？」',
    stages: ['second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'credit-team',
        label: '把功劳给队友',
        description: '政治正确但真诚。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { support: 2, steady: 2 },
        },
        success: {
          narrative: '你提到了 IGL 的指挥和替补兄弟的默契。赞助商私信了俱乐部。',
          statChanges: { mentality: 1, money: 20 },
          tagAdds: ['team-trust'],
        },
        failure: {
          narrative: '你说得过于客套，反而被粉丝解读成虚伪。',
          statChanges: { mentality: -1 },
        },
      },
      {
        id: 'hype-personal',
        label: '炫一下：我状态来了',
        description: '镜头感十足。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { streamer: 3, media: 2 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '你在镜头前自信满满，直播间大量新粉丝涌入你的频道。',
          statChanges: { money: 30, mentality: 1 },
          tagAdds: ['fan-favorite'],
        },
        failure: {
          narrative: '你越说越自负，社交媒体随后开始刷屏嘲讽。',
          statChanges: { mentality: -3 },
          tagAdds: ['media-backlash'],
        },
      },
      {
        id: 'short-answer',
        label: '我不太擅长说话',
        description: '低调。',
        check: {
          primary: 'intelligence',
          dc: 6,
          traitBonuses: { shy: 1 },
          traitPenalties: { streamer: 1 },
        },
        success: {
          narrative: '你礼貌带过，粉丝觉得你谦逊务实。',
          statChanges: { mentality: 1 },
        },
        failure: {
          narrative: '记者追问下你越答越别扭，视频被剪成尴尬合集。',
          statChanges: { mentality: -2 },
          tagAdds: ['media-backlash'],
        },
      },
    ],
  },
];
