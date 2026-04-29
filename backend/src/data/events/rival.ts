import type { EventDef } from '../../types.js';

// Rival events use {rival0}..{rivalN} placeholders that are substituted with
// player.rivals[i].name at emission time (see engine/events.ts).
export const RIVAL_EVENTS: EventDef[] = [
  {
    id: 'rival-troll-army',
    type: 'media',
    title: '{rival0} 雇了水军',
    narrative:
      '社交媒体首页突然涌出大量贴文，质疑你最近一次比赛的发挥。圈内人指给你看：水军IP指向 {rival0} 战队的运营公司。',
    stages: ['youth', 'second', 'pro', 'star'],
    difficulty: 2,
    weight: 0.4,
    choices: [
      {
        id: 'public-clapback',
        label: '亲自下场公开回怼',
        description: '正面硬刚。',
        check: {
          primary: 'mentality',
          dc: 12,
          traitBonuses: { volatile: 1, ego: 1, streamer: 2 },
          traitPenalties: { steady: 1 },
        },
        success: {
          narrative:
            '你一条长推把 {rival0} 的水军证据全列出来。粉丝站你这边，舆论反转。',
          statChanges: { mentality: 1 },
          fameDelta: 3,
          stressDelta: 1,
        },
        failure: {
          narrative:
            '你情绪上头说错话，被 {rival0} 的官号反将一军，话题持续发酵。',
          statChanges: { mentality: -2 },
          fameDelta: -3,
          stressDelta: 4,
          tagAdds: ['media-backlash'],
        },
      },
      {
        id: 'manager-handle',
        label: '让经纪人 + 法务处理',
        description: '走流程。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { steady: 2, tactical: 2 },
        },
        success: {
          narrative:
            '法务发函、经纪人公关，48 小时内 {rival0} 那边低调撤了水军。',
          statChanges: { intelligence: 1, money: -1 },
          fameDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '走流程效率太低，话题已经没法压住。',
          statChanges: { mentality: -1 },
          fameDelta: -2,
          stressDelta: 2,
        },
      },
      {
        id: 'silent-grind',
        label: '不回应，用比赛打脸',
        description: '冷处理。',
        check: {
          primary: 'mentality',
          dc: 11,
          traitBonuses: { steady: 3, support: 1 },
        },
        success: {
          narrative:
            '你不发一言，下一场训练赛打出全场最高 ADR。{rival0} 的话题自动凉了。',
          statChanges: { mentality: 2, agility: 1 },
          fameDelta: 2,
          stressDelta: 0,
        },
        failure: {
          narrative: '冷处理让话题继续滚雪球，几个媒体甚至开始信了。',
          statChanges: { mentality: -2 },
          fameDelta: -2,
          stressDelta: 3,
        },
      },
    ],
  },
  {
    id: 'rival-network-attack',
    type: 'team',
    title: '{rival1} 疑似搞了网络',
    narrative:
      '训练赛进行到第三图，全队 ping 突然飙升。运维查到攻击源 IP 段挂在 {rival1} 一个赞助商旗下。',
    stages: ['youth', 'second', 'pro', 'star'],
    difficulty: 3,
    weight: 0.3,
    choices: [
      {
        id: 'switch-server',
        label: '马上换备用机房继续打',
        description: '硬上。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 12,
          traitBonuses: { tactical: 2, igl: 2, steady: 2 },
        },
        success: {
          narrative:
            '运维 5 分钟切到香港机房，你们顶着延迟把训练赛打完，{rival1} 的小动作没起作用。',
          statChanges: { experience: 2, intelligence: 1 },
          fameDelta: 2,
          stressDelta: 1,
        },
        failure: {
          narrative: '切线之后队员状态全飘，被 {rival1} 顺势赢下了那把。',
          statChanges: { mentality: -1 },
          fameDelta: -1,
          stressDelta: 3,
        },
      },
      {
        id: 'go-public',
        label: '把日志发到社交媒体',
        description: '公开喊话。',
        check: {
          primary: 'mentality',
          dc: 10,
          traitBonuses: { streamer: 2, media: 2 },
        },
        success: {
          narrative:
            '你贴出原始日志，{rival1} 第二天就被赞助商解约。圈子里没人再敢这么玩。',
          statChanges: { mentality: 1 },
          fameDelta: 4,
          stressDelta: 2,
          tagAdds: ['fan-favorite'],
        },
        failure: {
          narrative:
            '日志被部分网友质疑造假，反而引来 {rival1} 粉丝的反扑。',
          statChanges: { mentality: -2 },
          fameDelta: -2,
          stressDelta: 4,
        },
      },
      {
        id: 'quiet-report',
        label: '私下报给联盟监管',
        description: '走规则。',
        check: {
          primary: 'intelligence',
          dc: 9,
          traitBonuses: { tactical: 2, steady: 2 },
        },
        success: {
          narrative: '联盟两周后通报 {rival1} 罚款，你们没出现在新闻里。',
          statChanges: { intelligence: 1, experience: 1 },
          fameDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '调查无果，{rival1} 全身而退，事情不了了之。',
          statChanges: { mentality: -1 },
          stressDelta: 1,
        },
      },
    ],
  },
  {
    id: 'rival-pubg-trash-talk',
    type: 'media',
    title: '路人局遇到 {rival0} 替补的小号',
    narrative:
      '排位匹配到 {rival0} 战队的替补玩家。对面在公屏丢了一句"听说你想转职业？算了吧"。',
    stages: ['rookie', 'youth'],
    difficulty: 1,
    weight: 0.5,
    choices: [
      {
        id: 'silent-frag',
        label: '不回，开局直接秀',
        description: '让分数说话。',
        check: {
          primary: 'agility',
          dc: 11,
          traitBonuses: { mechanical: 2, aimer: 2, steady: 1 },
        },
        success: {
          narrative: '你 1v3 翻盘那把被对方观战录下来，回去发到了 {rival0} 内部群。',
          statChanges: { agility: 1, experience: 1 },
          fameDelta: 1,
          stressDelta: 1,
        },
        failure: {
          narrative: '你想秀但被对方稳稳压制，公屏继续被嘲讽。',
          statChanges: { mentality: -1 },
          fameDelta: -1,
          stressDelta: 3,
        },
      },
      {
        id: 'public-roast',
        label: '公屏对刚',
        description: '嘴上不能输。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { volatile: 2, streamer: 1 },
          traitPenalties: { steady: 2, shy: 2 },
        },
        success: {
          narrative: '你回得又毒又快，对面退游戏前发了一句"小子有点东西"。',
          statChanges: { mentality: 1 },
          fameDelta: 1,
          stressDelta: 0,
        },
        failure: {
          narrative: '你越说越乱，被截图发到 {rival0} 后援群当笑话。',
          statChanges: { mentality: -2 },
          fameDelta: -2,
          stressDelta: 4,
        },
      },
      {
        id: 'mute-ignore',
        label: '直接屏蔽，专心打',
        description: '当对面不存在。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, support: 1 },
        },
        success: {
          narrative: '你屏蔽后 ADR 直接拉满。{rival0} 替补打完退游戏。',
          statChanges: { mentality: 1, agility: 1 },
          stressDelta: -1,
        },
        failure: {
          narrative: '屏蔽了但还是分心了，那把输得难看。',
          statChanges: { mentality: -1 },
          stressDelta: 2,
        },
      },
    ],
  },
];
