import type { EventDef } from '../../types.js';

export const MEDIA_EVENTS: EventDef[] = [
  {
    id: 'media-abandoned-family',
    type: 'media',
    title: '陈年旧事被翻出来了',
    narrative:
      '不知道从哪个角落开始，有人把当年你家人病危时你的选择挖了出来。帖子开始发酵，「职业选手抛弃重病家人」的话题冲上热搜，评论区已经炸了。赞助商那边发来邮件要求说明。',
    stages: ['pro'],
    difficulty: 1,
    weight: 0.4,
    requireTags: ['abandoned-family'],
    forbidTags: ['media-abandoned-handled'],
    choices: [
      {
        id: 'stay-silent',
        label: '选择沉默，等风头过去',
        description: '不回应，赌舆论自己降温。',
        check: {
          primary: 'mentality',
          secondary: 'experience',
          dc: 13,
          traitBonuses: { steady: 2, solo: 1 },
          traitPenalties: { flashy: 2, media: 1 },
        },
        success: {
          narrative: '你没有发任何声明。三天后，一个更大的热点把这件事盖了下去。名气有所损失，但没有进一步扩散。赞助商那边算是糊弄过去了。',
          stateDelta: {
            stress: 25,
          },
          resourceDelta: {
            fame: -10,
          },
          tags: {
            add: ['media-abandoned-handled'],
          },
        },
        failure: {
          narrative: '沉默被解读成默认。话题热度不降反升，开始有记者联系你的前队友。赞助商已经暂停了部分合作，俱乐部管理层约你谈话了。',
          stateDelta: {
            stress: 60,
            feel: -1.0,
          },
          resourceDelta: {
            fame: -28,
          },
          tags: {
            add: ['bad-rep', 'media-abandoned-handled'],
          },
        },
      },
      {
        id: 'public-apology',
        label: '公开道歉，正面回应',
        description: '承认错误，接受舆论的审判——但可能换来和解的机会。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { support: 2, selfless: 2, steady: 1 },
          traitPenalties: { ego: 3, solo: 2 },
        },
        success: {
          narrative: '你发了一段文字，没有辩解，只是如实说了当年的处境。评论区有人选择接受，但有更多人说「说出来又怎样」。名气受损，但话题比沉默收得更快一些。',
          stateDelta: {
            stress: -15,
            feel: -0.5,
          },
          resourceDelta: {
            fame: -15,
          },
          tags: {
            add: ['media-abandoned-handled'],
          },
        },
        failure: {
          narrative: '道歉被解读成公关稿，「太晚了」「装什么呢」的声音铺天盖地。你真诚的部分没有人看到，看到的只有狼狈。赞助商减少了合作频次。',
          stateDelta: {
            stress: 50,
            feel: -1.5,
          },
          resourceDelta: {
            fame: -30,
          },
          tags: {
            add: ['bad-rep', 'media-abandoned-handled'],
          },
        },
      },
    ],
  },

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
          stateDelta: {
            feel: 0.5,
          },
          resourceDelta: {
            money: 20,
          },
          tags: {
            add: ['team-trust'],
          },
        },
        failure: {
          narrative: '你说得过于客套，反而被粉丝解读成虚伪。',
          stateDelta: {
            feel: -0.5,
          },
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
          stateDelta: {
            feel: 0.5,
          },
          resourceDelta: {
            money: 30,
          },
          tags: {
            add: ['fan-favorite'],
          },
        },
        failure: {
          narrative: '你越说越自负，社交媒体随后开始刷屏嘲讽。',
          stateDelta: {
            feel: -1.5,
            tilt: 1,
          },
          tags: {
            add: ['media-backlash'],
          },
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
          stateDelta: {
            feel: 0.5,
          },
        },
        failure: {
          narrative: '记者追问下你越答越别扭，视频被剪成尴尬合集。',
          stateDelta: {
            feel: -1,
            tilt: 1,
          },
          tags: {
            add: ['media-backlash'],
          },
        },
      },
    ],
  },
];
