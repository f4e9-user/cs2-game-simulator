import type { EventDef } from '../../types.js';

export const CHAIN_EVENTS: EventDef[] = [
  // ── locker-tension → confrontation ──────────────────────────────
  {
    id: 'chain-locker-tension-surface',
    type: 'team',
    title: '更衣室里的爆发点',
    narrative:
      '训练结束后队内气氛降到冰点。队长发来消息要求今晚开个"内部会"，积压的矛盾已经藏不住了。',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 1.0,
    requireTags: ['locker-tension'],
    choices: [
      {
        id: 'confront-direct',
        label: '当着全队说清楚',
        description: '把话摊开讲，可能很难听但能真正解决。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { steady: 2, selfless: 2, support: 2 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '气话说完之后反而是沉默，然后是笑。矛盾解开了一大半。',
          statChanges: { mentality: 1, experience: 1 },
          tagRemoves: ['locker-tension'],
          tagAdds: ['team-trust'],
          stressDelta: -1,
        },
        failure: {
          narrative: '话没说到点子上，气氛更糟了。有人拂袖而去。',
          statChanges: { mentality: -1 },
          tagRemoves: ['locker-tension'],
          tagAdds: ['suppressed-anger'],
          stressDelta: 2,
        },
      },
      {
        id: 'defuse-outing',
        label: '提议明天去打一场放松局',
        description: '用非正式的方式缓和气氛。',
        check: {
          primary: 'intelligence',
          dc: 7,
          traitBonuses: { support: 3, tactical: 1 },
        },
        success: {
          narrative: '一场欢乐的休闲局之后，大家好像忘了昨天在闹什么。',
          statChanges: {},
          tagRemoves: ['locker-tension'],
          feelDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '没人接这个台子。你的提议被沉默拒绝了，气还是没散。',
          statChanges: { mentality: -1 },
          tagRemoves: ['locker-tension'],
          tagAdds: ['suppressed-anger'],
          stressDelta: 1,
        },
      },
      {
        id: 'let-simmer',
        label: '先观望，等风头过了再说',
        description: '息事宁人，但问题还在。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { steady: 2, shy: 1 },
          traitPenalties: { volatile: 2, ego: 1 },
        },
        success: {
          narrative: '几天后大家都在忙训练，矛盾暂时被搁置了。',
          statChanges: {},
          tagRemoves: ['locker-tension'],
          stressDelta: 0,
        },
        failure: {
          narrative: '矛盾没有消失，只是积得更深了。你开始担心下一次爆发。',
          statChanges: { mentality: -2 },
          tagRemoves: ['locker-tension'],
          tagAdds: ['suppressed-anger'],
          stressDelta: 2,
        },
      },
    ],
  },

  // ── suppressed-anger → eruption ─────────────────────────────────
  {
    id: 'chain-suppressed-anger-eruption',
    type: 'team',
    title: '憋了太久的那口气',
    narrative:
      '赛后复盘时一个细节触发了你。话没憋住，声音大得让整个休息室安静下来。',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 1.0,
    requireTags: ['suppressed-anger'],
    choices: [
      {
        id: 'full-explosion',
        label: '直接爆发，把话全说出来',
        description: '压了太久了，管他三七二十一。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { ego: 1 },
          traitPenalties: { steady: 2, selfless: 2 },
        },
        success: {
          narrative: '爆发之后反而有种解脱感。队友愣了片刻，然后各自检讨。问题摆到台面上了。',
          statChanges: { mentality: 1 },
          tagRemoves: ['suppressed-anger'],
          stressDelta: -2,
          feelDelta: 1,
        },
        failure: {
          narrative: '话说得太难听。你事后后悔了，但伤害已经造成。',
          statChanges: { mentality: -2, experience: -1 },
          tagRemoves: ['suppressed-anger'],
          stressDelta: 3,
          fameDelta: -1,
        },
      },
      {
        id: 'channel-training',
        label: '闭嘴，把火气带进训练里',
        description: '用实力证明而不是嘴炮。',
        check: {
          primary: 'mentality',
          secondary: 'agility',
          dc: 7,
          traitBonuses: { steady: 3, grinder: 2 },
        },
        success: {
          narrative: '你沉默着打了三小时训练，数据漂亮得让所有人闭嘴。气消了一半。',
          statChanges: { agility: 1, experience: 1 },
          tagRemoves: ['suppressed-anger'],
          stressDelta: -1,
        },
        failure: {
          narrative: '你想用表现说话，但那天状态很差。压着的火气变成了焦虑。',
          statChanges: { mentality: -1 },
          tagRemoves: ['suppressed-anger'],
          stressDelta: 2,
          tiltDelta: 1,
        },
      },
      {
        id: 'talk-to-coach',
        label: '找教练谈，让他来主持',
        description: '把问题上交，更成熟的处理方式。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { selfless: 2, support: 2 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '教练单独找了每个人聊。隔天气氛好了很多，你也不那么孤立了。',
          statChanges: { mentality: 1, experience: 1 },
          tagRemoves: ['suppressed-anger'],
          tagAdds: ['team-trust'],
          stressDelta: -2,
        },
        failure: {
          narrative: '教练说"我会处理"，但什么也没发生。你觉得自己被无视了。',
          statChanges: { mentality: -1 },
          tagRemoves: ['suppressed-anger'],
          stressDelta: 1,
        },
      },
    ],
  },

  // ── dirty-money → investigation ─────────────────────────────────
  {
    id: 'chain-dirty-money-pressure',
    type: 'life',
    title: '账单查进来了',
    narrative:
      '俱乐部合规部门发来内部邮件，说例行财务审计发现一笔来源不明的转账，要求你在 48 小时内说明。',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 4,
    weight: 1.0,
    requireTags: ['dirty-money'],
    choices: [
      {
        id: 'lay-low',
        label: '编造一个说法，先过关再说',
        description: '提供一个合理解释，赌对方不会深查。',
        check: {
          primary: 'intelligence',
          dc: 11,
          traitBonuses: { tactical: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '解释勉强通过了审计。你长呼一口气，但这件事没有结束。',
          statChanges: { mentality: -1 },
          tagRemoves: ['dirty-money'],
          stressDelta: 2,
        },
        failure: {
          narrative: '说辞前后矛盾，审计升级为外部调查。你的名字出现在报告首页。',
          statChanges: { money: -5, mentality: -5 },
          tagRemoves: ['dirty-money'],
          tagAdds: ['banned'],
          endRun: true,
          endReason: 'banned_for_match_fixing',
          stressDelta: 10,
          fameDelta: -15,
        },
      },
      {
        id: 'confess-partial',
        label: '主动坦白，配合内部调查',
        description: '把能说的都说出来，争取从宽处理。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { selfless: 3, steady: 2 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '内部处理完结：接受赞助禁令 + 自愿退还 30K。没有公开处分。你睡得踏实一些了。',
          statChanges: { mentality: 1, money: -3 },
          tagRemoves: ['dirty-money'],
          stressDelta: -1,
        },
        failure: {
          narrative: '坦白了但公司认为不够，决定上报联盟。禁赛通知随后到来。',
          statChanges: { money: -5, mentality: -4 },
          tagRemoves: ['dirty-money'],
          tagAdds: ['banned'],
          endRun: true,
          endReason: 'banned_for_match_fixing',
          stressDelta: 8,
          fameDelta: -10,
        },
      },
      {
        id: 'find-scapegoat',
        label: '把责任推到介绍人身上',
        description: '把那个"中间人"拉出来顶包。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { tactical: 2 },
          traitPenalties: { selfless: 3, support: 2 },
        },
        success: {
          narrative: '对方没有反驳的资本。你全身而退，但失去了一个人。',
          statChanges: { mentality: -2 },
          tagRemoves: ['dirty-money'],
          stressDelta: 1,
          fameDelta: -1,
        },
        failure: {
          narrative: '对方把完整的聊天记录发给了调查组。局面一下子全崩了。',
          statChanges: { money: -5, mentality: -5 },
          tagRemoves: ['dirty-money'],
          tagAdds: ['banned'],
          endRun: true,
          endReason: 'banned_for_match_fixing',
          stressDelta: 10,
          fameDelta: -15,
        },
      },
    ],
  },

  // ── highlight-clip → viral ───────────────────────────────────────
  {
    id: 'chain-clip-viral',
    type: 'media',
    title: '那个剪辑火了',
    narrative:
      '上次比赛的一个连杀片段被剪成 30 秒短视频，昨晚播放量破了百万。媒体开始联系你。',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 1.0,
    requireTags: ['highlight-clip'],
    choices: [
      {
        id: 'engage-community',
        label: '亲自发帖感谢，和粉丝互动',
        description: '趁热度搭关系，积累人气。',
        check: {
          primary: 'intelligence',
          dc: 6,
          traitBonuses: { support: 2, selfless: 1 },
        },
        success: {
          narrative: '那条帖子的互动量也爆了。你的用户名在圈里开始被人认出来。',
          statChanges: { mentality: 1 },
          tagRemoves: ['highlight-clip'],
          tagAdds: ['fan-favorite'],
          fameDelta: 4,
          stressDelta: -1,
        },
        failure: {
          narrative: '帖子措辞被挑剔了。小部分人找茬，热度散得很快。',
          statChanges: {},
          tagRemoves: ['highlight-clip'],
          fameDelta: 1,
        },
      },
      {
        id: 'stay-focused',
        label: '不管它，保持训练节奏',
        description: '流量是虚的，实力才是真的。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { steady: 3 },
        },
        success: {
          narrative: '你没被热度带偏，这周训练数据是近一个月最好的。',
          statChanges: { experience: 1 },
          tagRemoves: ['highlight-clip'],
          feelDelta: 1,
        },
        failure: {
          narrative: '明明想无视，还是忍不住刷评论到凌晨。第二天迟到了训练。',
          statChanges: { mentality: -1 },
          tagRemoves: ['highlight-clip'],
          fatigueDelta: 10,
          stressDelta: 1,
        },
      },
      {
        id: 'leverage-sponsorship',
        label: '联系经纪人，趁热谈赞助',
        description: '把流量换成收入。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 8,
          traitBonuses: { tactical: 2, ego: 1 },
        },
        success: {
          narrative: '一个外设品牌签了三个月短约。有点钱，有点名。',
          statChanges: { money: 3 },
          tagRemoves: ['highlight-clip'],
          tagAdds: ['fan-favorite'],
          fameDelta: 2,
        },
        failure: {
          narrative: '谈判桌上条款没谈拢，热度过了就没人找了。',
          statChanges: {},
          tagRemoves: ['highlight-clip'],
          fameDelta: 1,
        },
      },
    ],
  },

  // ── fan-favorite → sponsorship deal ─────────────────────────────
  {
    id: 'chain-fan-favorite-deal',
    type: 'media',
    title: '大赞助商找上门',
    narrative:
      '一个知名外设品牌的市场总监发来合作邀请，合同金额远比你想象的高。经纪人说要你亲自拍板。',
    stages: ['pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 1.0,
    requireTags: ['fan-favorite'],
    choices: [
      {
        id: 'accept-full',
        label: '签全约：代言 + 直播露出 + 线下活动',
        description: '钱多，但时间压力大。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { ego: 1 },
          traitPenalties: { steady: 1 },
        },
        success: {
          narrative: '合同签了，60K 到账。你的脸开始出现在外设网站首页。日程也跟着密了。',
          statChanges: { money: 6 },
          tagRemoves: ['fan-favorite'],
          fameDelta: 4,
          stressDelta: 2,
        },
        failure: {
          narrative: '活动太多压垮了训练计划。战队管理层打来电话表达不满。',
          statChanges: { money: 4, mentality: -2 },
          tagRemoves: ['fan-favorite'],
          fameDelta: 2,
          stressDelta: 4,
        },
      },
      {
        id: 'negotiate-limited',
        label: '只接线上代言，不做线下',
        description: '控制曝光量，保住训练时间。',
        check: {
          primary: 'intelligence',
          dc: 7,
          traitBonuses: { tactical: 2, steady: 2 },
        },
        success: {
          narrative: '品牌方接受了条件。30K，少一些，但自由度保住了。',
          statChanges: { money: 3, experience: 1 },
          tagRemoves: ['fan-favorite'],
          fameDelta: 2,
        },
        failure: {
          narrative: '谈判没成，品牌方找了别人。机会就这样过了。',
          statChanges: {},
          tagRemoves: ['fan-favorite'],
          stressDelta: 1,
        },
      },
      {
        id: 'decline',
        label: '谢绝，专注打职业',
        description: '名气不是目标，成绩才是。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { steady: 3, grinder: 2 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '你回绝了。圈内有人觉得你务实，训练专注度明显提高。',
          statChanges: { mentality: 1, experience: 1 },
          tagRemoves: ['fan-favorite'],
          feelDelta: 1,
        },
        failure: {
          narrative: '拒绝了之后又后悔了。反复横跳让经纪人直接甩手不干了。',
          statChanges: { mentality: -1 },
          tagRemoves: ['fan-favorite'],
          stressDelta: 1,
        },
      },
    ],
  },

  // ── grand-final-loss → shadow ────────────────────────────────────
  {
    id: 'chain-grand-final-shadow',
    type: 'life',
    title: '那场决赛的阴影',
    narrative:
      '教练在周会上再次播放了决赛末局的录像。那场失误被截图在论坛热传。你知道这件事还没结束。',
    stages: ['pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 1.0,
    requireTags: ['grand-final-loss'],
    choices: [
      {
        id: 'review-improve',
        label: '主动拉教练复盘，把每个细节都搞清楚',
        description: '把伤口变成成长机会。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { grinder: 3, tactical: 2 },
        },
        success: {
          narrative: '录像看了六遍。你找到了三个可以改进的位置习惯。下次不会再犯。',
          statChanges: { experience: 2, intelligence: 1 },
          tagRemoves: ['grand-final-loss'],
          stressDelta: -2,
          feelDelta: 1,
        },
        failure: {
          narrative: '反复看反而加深了那一刻的画面。你对这局录像产生了抵触。',
          statChanges: { mentality: -1 },
          tagRemoves: ['grand-final-loss'],
          stressDelta: 2,
          tiltDelta: 1,
        },
      },
      {
        id: 'move-forward',
        label: '不看录像了，向前看',
        description: '有些事放下就好。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { steady: 3 },
          traitPenalties: { grinder: 1 },
        },
        success: {
          narrative: '你强迫自己把那局关掉。两周后，你发现自己确实没再想它。',
          statChanges: { mentality: 1 },
          tagRemoves: ['grand-final-loss'],
          stressDelta: -1,
        },
        failure: {
          narrative: '告诉自己向前看，但梦里还是那个 16:14。',
          statChanges: { mentality: -1 },
          tagRemoves: ['grand-final-loss'],
          stressDelta: 1,
          tiltDelta: 1,
        },
      },
      {
        id: 'sports-psych',
        label: '约心理顾问谈了两次',
        description: '用专业的方式处理失败的重量。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { selfless: 2, support: 2 },
        },
        success: {
          narrative: '顾问帮你重构了对"输"的定义。你睡前不再反复回放那场比赛了。',
          statChanges: { mentality: 2 },
          tagRemoves: ['grand-final-loss'],
          stressDelta: -3,
          feelDelta: 1,
        },
        failure: {
          narrative: '说了两次感觉没什么用，你退出了。问题还挂在那里。',
          statChanges: {},
          tagRemoves: ['grand-final-loss'],
          stressDelta: 0,
        },
      },
    ],
  },

  // ── missed-practice → coach confrontation ───────────────────────
  {
    id: 'chain-missed-practice-coach',
    type: 'team',
    title: '教练叫你去谈',
    narrative:
      '教练发消息让你饭后留一下。你知道是为了上周那次无故缺席训练的事。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 1.0,
    requireTags: ['missed-practice'],
    choices: [
      {
        id: 'apologize-sincerely',
        label: '直接道歉，不找理由',
        description: '承认错误是最快解决的方式。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { selfless: 2, steady: 2 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '教练接受了道歉。他说他更在意你知道为什么不对，而不是你说了什么。',
          statChanges: { mentality: 1 },
          tagRemoves: ['missed-practice'],
          stressDelta: -1,
        },
        failure: {
          narrative: '道歉的时候没忍住加了一句解释，教练皱眉打断了你。气氛很糟。',
          statChanges: { mentality: -1 },
          tagRemoves: ['missed-practice'],
          stressDelta: 1,
        },
      },
      {
        id: 'make-excuse',
        label: '编一个说得过去的理由',
        description: '不想承认错误，但也不想彻底撕破脸。',
        check: {
          primary: 'intelligence',
          dc: 9,
          traitPenalties: { steady: 1, selfless: 1 },
        },
        success: {
          narrative: '谎说了，教练信了。事情过去了，但你知道这不是你的最好状态。',
          statChanges: { mentality: -1 },
          tagRemoves: ['missed-practice'],
          stressDelta: 1,
        },
        failure: {
          narrative: '教练当场指出了漏洞，然后直接通知你下周停赛一场。',
          statChanges: { mentality: -2, experience: -1 },
          tagRemoves: ['missed-practice'],
          stressDelta: 3,
        },
      },
      {
        id: 'ignore-summons',
        label: '已读不回，不去了',
        description: '躲一次是一次。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { ego: 1, lazy: 1 },
          traitPenalties: { selfless: 1, support: 1 },
        },
        success: {
          narrative: '教练没有再追。但名单上你的上场时间少了一场。',
          statChanges: {},
          tagRemoves: ['missed-practice'],
          stressDelta: 0,
          fameDelta: -1,
        },
        failure: {
          narrative: '俱乐部直接发来了书面警告，并转发给了联盟。',
          statChanges: { mentality: -2 },
          tagRemoves: ['missed-practice'],
          stressDelta: 3,
          fameDelta: -2,
        },
      },
    ],
  },

  // ── main-awper → specialized training ───────────────────────────
  {
    id: 'chain-awper-training',
    type: 'training',
    title: '主狙的专项训练',
    narrative:
      '教练说你有成为主狙的潜力，安排了一个专项训练日：定点狙位练习 + 角度记忆 + 快狙节奏训练。',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 0.18,
    requireTags: ['main-awper'],
    forbidTags: ['awper-training-cd'],
    choices: [
      {
        id: 'focus-aim',
        label: '主攻瞄准：一次性打五百发狙',
        description: '肌肉记忆是狙击手的根基。',
        check: {
          primary: 'agility',
          dc: 8,
          traitBonuses: { grinder: 3, steady: 1 },
        },
        success: {
          narrative: '最后一个小时你开始感觉到那种"锁定"的感觉。手感上来了。',
          statChanges: { agility: 2 },
          tagCooldowns: { 'awper-training-cd': 9 },
          feelDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '打了五百发之后眼睛开始酸，准头反而越来越散。',
          statChanges: { agility: 1 },
          tagCooldowns: { 'awper-training-cd': 7 },
          fatigueDelta: 15,
          tiltDelta: 1,
        },
      },
      {
        id: 'focus-positioning',
        label: '主攻站位：反复研究高价值角度',
        description: '位置读图是狙击手真正的核心。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 8,
          traitBonuses: { tactical: 3, grinder: 1 },
        },
        success: {
          narrative: '你记住了十二个对方常见的过图时机，下次打这张图会更稳。',
          statChanges: { intelligence: 1, experience: 2 },
          tagCooldowns: { 'awper-training-cd': 9 },
          feelDelta: 1,
        },
        failure: {
          narrative: '理论记住了，但临场执行又是另一回事，这次训练没有太大收获。',
          statChanges: { experience: 1 },
          tagCooldowns: { 'awper-training-cd': 7 },
        },
      },
    ],
  },

  // ── natural-igl → IGL opportunity ───────────────────────────────
  {
    id: 'chain-igl-opportunity',
    type: 'team',
    title: '指挥席空出来了',
    narrative:
      '现任 IGL 宣布本赛季末退役。队长私下问你：「你愿意接手指挥吗？大家都觉得你有那个读图能力。」',
    stages: ['pro', 'star', 'veteran'],
    difficulty: 4,
    weight: 0.18,
    requireTags: ['natural-igl'],
    forbidTags: ['igl-opportunity-cd'],
    choices: [
      {
        id: 'accept-igl',
        label: '接：我来喊话',
        description: '承担压力，但也获得了影响全队的权力。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { tactical: 3, selfless: 2, support: 2 },
          traitPenalties: { ego: 1 },
        },
        success: {
          narrative: '第一场以 IGL 身份打的比赛，你的指挥让全队都找到了节奏。赛后大家叫你"指挥官"。',
          statChanges: { intelligence: 2, experience: 2 },
          tagRemoves: ['natural-igl'],
          tagAdds: ['team-trust'],
          fameDelta: 3,
          stressDelta: 2,
        },
        failure: {
          narrative: 'IGL 压力比你想的大得多。队伍因为你的失误输了两场，开始有人质疑这个决定。',
          statChanges: { mentality: -2, experience: 1 },
          tagRemoves: ['natural-igl'],
          stressDelta: 4,
          tiltDelta: 1,
        },
      },
      {
        id: 'suggest-other',
        label: '推荐队友担任 IGL',
        description: '读图能力不等于愿意承担指挥责任。',
        check: {
          primary: 'intelligence',
          dc: 7,
          traitBonuses: { selfless: 3, support: 2 },
        },
        success: {
          narrative: '你推荐的人接受了。你继续在辅助位置上发光，偶尔给 IGL 支招。',
          statChanges: { experience: 1 },
          tagCooldowns: { 'igl-opportunity-cd': 12 },
          tagAdds: ['team-trust'],
        },
        failure: {
          narrative: '被你推荐的人拒绝了。队伍最终空降了一个外部 IGL，你和他磨合得很痛苦。',
          statChanges: { mentality: -1 },
          tagCooldowns: { 'igl-opportunity-cd': 10 },
          stressDelta: 2,
        },
      },
      {
        id: 'decline-igl',
        label: '直接拒绝，我只打好自己的位',
        description: '保持专注，不被职责扩张分心。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { steady: 2 },
          traitPenalties: { selfless: 1 },
        },
        success: {
          narrative: '你划清了边界。队长尊重了你的决定，最终找了另一个方案。',
          statChanges: {},
          tagCooldowns: { 'igl-opportunity-cd': 10 },
        },
        failure: {
          narrative: '你拒绝了，但队伍一直没找到合适人选。下个赛季整体指挥混乱。',
          statChanges: { mentality: -1 },
          tagCooldowns: { 'igl-opportunity-cd': 8 },
          stressDelta: 2,
        },
      },
    ],
  },

  // ── media-backlash → response ────────────────────────────────────
  {
    id: 'chain-media-backlash-response',
    type: 'media',
    title: '舆论还在发酵',
    narrative:
      '已经第三天了，那篇针对你的帖子还在各大论坛流传。俱乐部公关部门今天打来电话，说你需要做点什么。',
    stages: ['pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 1.0,
    requireTags: ['media-backlash'],
    choices: [
      {
        id: 'public-apology',
        label: '发一篇公开声明道歉',
        description: '最直接的平息手段，但可能被认为是认罪。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { selfless: 2, steady: 1 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '声明措辞得当，大部分人接受了。舆论在 48 小时内平息。',
          statChanges: { mentality: 1 },
          tagRemoves: ['media-backlash'],
          fameDelta: -1,
          stressDelta: -2,
        },
        failure: {
          narrative: '声明被截图断章取义二次传播，引发新一轮争论。',
          statChanges: { mentality: -2 },
          tagRemoves: ['media-backlash'],
          fameDelta: -4,
          stressDelta: 3,
        },
      },
      {
        id: 'double-down',
        label: '正面回击，用数据反驳批评',
        description: '你觉得自己没错，不应该道歉。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 11,
          traitBonuses: { ego: 2, tactical: 2 },
          traitPenalties: { selfless: 2 },
        },
        success: {
          narrative: '反驳逻辑严密，对方没有反应。一部分圈内人改变了立场。',
          statChanges: { mentality: 1 },
          tagRemoves: ['media-backlash'],
          fameDelta: 2,
          stressDelta: -1,
        },
        failure: {
          narrative: '反击被认为是"傲慢"，引来更多负面评价。经纪人发来了警告短信。',
          statChanges: { mentality: -2 },
          tagRemoves: ['media-backlash'],
          fameDelta: -5,
          stressDelta: 4,
        },
      },
      {
        id: 'go-silent',
        label: '什么都不说，等它自然消散',
        description: '不喂流量，风头自然会过。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 3 },
        },
        success: {
          narrative: '一周后新的事件出现，你的名字淡出了热搜。沉默奏效了。',
          statChanges: {},
          tagRemoves: ['media-backlash'],
          fameDelta: -1,
          stressDelta: -1,
        },
        failure: {
          narrative: '沉默被解读为默认。帖子热度持续了更久，俱乐部扣了 20K 违约金。',
          statChanges: { money: -2, mentality: -1 },
          tagRemoves: ['media-backlash'],
          fameDelta: -3,
          stressDelta: 2,
        },
      },
    ],
  },

  // ── signed-second-team → debut ───────────────────────────────────
  {
    id: 'chain-second-team-debut',
    type: 'team',
    title: '新队的第一场正式赛',
    narrative:
      '转会手续一个月前完成，今天终于上场了。新队友和观众都在打量你，看你能不能配得上那份合同。',
    stages: ['second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 1.0,
    requireTags: ['signed-second-team'],
    choices: [
      {
        id: 'prove-yourself',
        label: '全力发挥，用表现堵住悬念',
        description: '新队第一印象，关键时刻拼一把。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { grinder: 3, ego: 1 },
        },
        success: {
          narrative: '你打出了近期最好的一场。赛后更衣室气氛很好，新队友主动加了你联系方式。',
          statChanges: { agility: 1, experience: 2 },
          tagRemoves: ['signed-second-team'],
          tagAdds: ['team-trust'],
          fameDelta: 2,
          feelDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '关键局手抖了。教练保持着职业性的沉默，但你知道今天没有发挥应有水平。',
          statChanges: { mentality: -1 },
          tagRemoves: ['signed-second-team'],
          stressDelta: 2,
          tiltDelta: 1,
        },
      },
      {
        id: 'play-safe',
        label: '稳健为主，先适应队伍节奏',
        description: '不冒险，先把自己嵌进去。',
        check: {
          primary: 'intelligence',
          dc: 7,
          traitBonuses: { steady: 3, tactical: 2 },
        },
        success: {
          narrative: '你没有亮点，但也没有失误。IGL 说"你很好融入"，这已经够了。',
          statChanges: { experience: 1 },
          tagRemoves: ['signed-second-team'],
        },
        failure: {
          narrative: '太稳了以至于失去了攻击性。新队感觉你还在适应，上场时间被压缩。',
          statChanges: { mentality: -1 },
          tagRemoves: ['signed-second-team'],
          stressDelta: 1,
        },
      },
      {
        id: 'bond-teammates',
        label: '赛前主动找每个人聊一下',
        description: '先建立信任，游戏里的配合会更顺畅。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 7,
          traitBonuses: { selfless: 3, support: 2 },
        },
        success: {
          narrative: '赛前那二十分钟很有效。打的时候你们的沟通比第一场正式打的队伍要顺很多。',
          statChanges: { mentality: 1 },
          tagRemoves: ['signed-second-team'],
          tagAdds: ['team-trust'],
          stressDelta: -1,
        },
        failure: {
          narrative: '有人比较封闭，没太想搭理你。比赛里默契也出了问题。',
          statChanges: {},
          tagRemoves: ['signed-second-team'],
          stressDelta: 1,
        },
      },
    ],
  },

  // ── family-strain → resolution ───────────────────────────────────
  {
    id: 'chain-family-strain-resolution',
    type: 'life',
    title: '家里打来了电话',
    narrative:
      '妈妈发消息说有空打个视频，言辞里藏着担心。你知道这次逃不掉了。',
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 1.0,
    requireTags: ['family-strain'],
    choices: [
      {
        id: 'call-home',
        label: '现在就打过去，聊个痛快',
        description: '把最近的状态都说出来，听她说说话。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { selfless: 2, support: 1 },
        },
        success: {
          narrative: '聊了一个多小时。你知道了家里一切都好。挂掉之后你发现压了很久的某根弦松了。',
          statChanges: { mentality: 2, constitution: 1 },
          tagRemoves: ['family-strain'],
          stressDelta: -3,
        },
        failure: {
          narrative: '聊了一会儿就陷入争吵，话题滑向了"你什么时候放弃打游戏"。你挂断了电话。',
          statChanges: { mentality: -1 },
          tagRemoves: ['family-strain'],
          stressDelta: 2,
          tiltDelta: 1,
        },
      },
      {
        id: 'schedule-visit',
        label: '说好下个月回去一趟',
        description: '给一个承诺，先让家里放心。',
        check: {
          primary: 'intelligence',
          dc: 6,
          traitBonuses: { selfless: 2 },
        },
        success: {
          narrative: '承诺了回家。妈妈听起来高兴了很多，你也有个盼头了。',
          statChanges: { mentality: 1 },
          tagRemoves: ['family-strain'],
          stressDelta: -1,
        },
        failure: {
          narrative: '说了但没做到。训练排期出了变化，回家的计划泡汤了，家里更担心了。',
          statChanges: { mentality: -1 },
          tagRemoves: ['family-strain'],
          stressDelta: 2,
        },
      },
      {
        id: 'keep-avoiding',
        label: '回"最近很忙，改天聊"，继续拖',
        description: '不是不想解决，只是时机不对。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitPenalties: { selfless: 2 },
        },
        success: {
          narrative: '家里接受了，这次过去了。但你清楚，这不是解决，只是延期。',
          statChanges: {},
          tagRemoves: ['family-strain'],
          stressDelta: 1,
        },
        failure: {
          narrative: '妈妈直接买了票要来看你。你在宿舍慌了半天。',
          statChanges: { mentality: -1 },
          tagRemoves: ['family-strain'],
          stressDelta: 3,
        },
      },
    ],
  },

  // ── forfeit-recent → consequence ──────────────────────────────────
  {
    id: 'chain-forfeit-consequence',
    type: 'team',
    title: '弃赛的代价',
    narrative:
      '弃赛的消息在圈子里传开了。队友发来消息，俱乐部也约谈了你。你必须面对这件事。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 1.2,
    requireTags: ['forfeit-recent'],
    choices: [
      {
        id: 'public-statement',
        label: '发微博道歉说明原因',
        description: '公开解释有助于平息舆论，但也可能引来更多质疑。',
        check: {
          primary: 'intelligence',
          dc: 9,
          traitBonuses: { media: 2, steady: 1 },
          traitPenalties: { ego: 2 },
        },
        success: {
          narrative: '你的声明措辞合适，评论区情绪基本平稳。粉丝中有人表示理解。',
          statChanges: {},
          tagRemoves: ['forfeit-recent'],
          fameDelta: -2,
          stressDelta: -1,
        },
        failure: {
          narrative: '声明里有一句话被断章取义，话题热度反而更大了。',
          statChanges: { mentality: -1 },
          tagRemoves: ['forfeit-recent'],
          fameDelta: -5,
          stressDelta: 2,
        },
      },
      {
        id: 'talk-to-teammates',
        label: '私下找队友解释，不公开',
        description: '内部关系比外部舆论更重要。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 8,
          traitBonuses: { selfless: 2, steady: 2 },
          traitPenalties: { ego: 1, shy: 2 },
        },
        success: {
          narrative: '队友们虽然不满，但听了你的解释后接受了。团队内部没有进一步撕裂。',
          statChanges: { mentality: 1 },
          tagRemoves: ['forfeit-recent'],
          stressDelta: -1,
        },
        failure: {
          narrative: '有人当场说了重话。气氛很差，团队信任又少了一些。',
          statChanges: { mentality: -2 },
          tagRemoves: ['forfeit-recent'],
          tagAdds: ['locker-tension'],
          stressDelta: 3,
        },
      },
      {
        id: 'ignore-fallout',
        label: '不管了，等风波自己过去',
        description: '沉默是最懒的处理方式，但有时候有效。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2 },
          traitPenalties: { media: 1 },
        },
        success: {
          narrative: '一周后新事件把注意力转移走了。弃赛的事被大家逐渐忘记。',
          statChanges: {},
          tagRemoves: ['forfeit-recent'],
          fameDelta: -3,
          stressDelta: 0,
        },
        failure: {
          narrative: '沉默被解读成傲慢，俱乐部管理层传来了正式警告。',
          statChanges: { mentality: -1 },
          tagRemoves: ['forfeit-recent'],
          fameDelta: -5,
          stressDelta: 3,
        },
      },
    ],
  },

  // ── 战队申请响应 ──────────────────────────────────────────────
  {
    id: 'chain-club-response',
    type: 'tryout',
    title: '邮箱里多了一封回信',
    narrative:
      '你打开邮箱——之前发的那封简历有回应了。标题是"关于您的入队申请"。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0,
    requireTags: ['application-response-ready'],
    choices: [
      {
        id: 'accept-interview',
        label: '点开看全文',
        description: '看看对方说了什么。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { steady: 2, tactical: 1 },
          traitPenalties: { ego: 1 },
        },
        success: {
          narrative: '他们邀请你去线下聊一次——这本质上是面试。你对镜整理了一下衣领。',
          tagRemoves: ['application-response-ready'],
          tagCooldowns: { 'interview-pending': 2 },
          fameDelta: 1,
        },
        failure: {
          narrative: '回信很客气但简短——"感谢您的申请，我们目前人员已满。"',
          tagRemoves: ['application-response-ready'],
          stressDelta: 1,
        },
      },
    ],
  },

  // ── 面试事件 ──────────────────────────────────────────────────
  {
    id: 'chain-club-interview',
    type: 'tryout',
    title: '俱乐部面试',
    narrative:
      '你坐在俱乐部的会客室里。对面是教练和经理，桌上一张没有填完的合同。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 0,
    requireTags: ['interview-ready'],
    choices: [
      {
        id: 'impress-coach',
        label: '重点聊自己对比赛的理解',
        description: '展示战术素养和个人能力。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 10,
          traitBonuses: { tactical: 3, igl: 2 },
          traitPenalties: { ego: 1, shy: 1 },
        },
        success: {
          narrative: '教练对你关于 meta 的理解印象深刻，转头对经理点了点头。',
          tagRemoves: ['interview-pending', 'interview-ready'],
          stressDelta: -1,
          fameDelta: 1,
        },
        failure: {
          narrative: '你说了半天对方没什么反应，面试匆匆结束了。',
          tagRemoves: ['interview-pending', 'interview-ready'],
          stressDelta: 2,
        },
      },
      {
        id: 'show-experience',
        label: '用过去的比赛成绩说话',
        description: '成绩是最硬的敲门砖。',
        check: {
          primary: 'experience',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { steady: 2, selfless: 1 },
          traitPenalties: { shy: 1 },
        },
        success: {
          narrative: '经理翻了一下你的比赛记录，合上文件夹说"我们很感兴趣"。',
          tagRemoves: ['interview-pending', 'interview-ready'],
          stressDelta: -1,
          fameDelta: 1,
        },
        failure: {
          narrative: '对方觉得你还差点火候，说下次有机会再来。',
          tagRemoves: ['interview-pending', 'interview-ready'],
          stressDelta: 2,
        },
      },
    ],
  },

  // ── 被拒收尾 ──────────────────────────────────────────────────
  {
    id: 'chain-club-rejected',
    type: 'life',
    title: '又一次被拒了',
    narrative:
      '这次申请最终没能通过。你看着邮箱里那封格式化回信，沉默了一会儿。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 0,
    weight: 0,
    requireTags: ['club-rejected-notify'],
    choices: [
      {
        id: 'shake-it-off',
        label: '继续训练',
        description: '没什么好说的，实力是最好的回复。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, grinder: 2 },
          traitPenalties: { fragile: 1 },
        },
        success: {
          narrative: '你关上电脑，打开训练图。拒绝信可以删，手感不能丢。',
          tagRemoves: ['club-rejected-notify'],
          dailyGrowth: 'mentality',
          stressDelta: -1,
        },
        failure: {
          narrative: '你坐在椅子上发了好一会儿呆。这封回信比预想的更难受。',
          tagRemoves: ['club-rejected-notify'],
          stressDelta: 2,
          tiltDelta: 1,
        },
      },
    ],
  },

  // ── 新入队欢迎 ────────────────────────────────────────────────
  {
    id: 'chain-team-joined',
    type: 'team',
    title: '新队的第一天',
    narrative:
      '你推开训练室的门，几张陌生的面孔转过来看你。IGL 招了招手："你就是那个新人？过来坐，今天先从沟通习惯开始。"',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 1,
    weight: 0,
    requireTags: ['just-joined-team'],
    choices: [
      {
        id: 'introduce-self',
        label: '大方自我介绍',
        description: '第一印象很重要。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { support: 2, selfless: 1, media: 1 },
          traitPenalties: { shy: 2, ego: 1 },
        },
        success: {
          narrative: '你简单介绍了自己的打法风格和擅长位置。IGL 点了点头，把你加进了战术讨论组。',
          tagRemoves: ['just-joined-team'],
          feelDelta: 1,
          tagAdds: ['team-trust'],
        },
        failure: {
          narrative: '你一紧张没说太多。教练拍了拍你的肩膀说"刚开始，不急。"',
          tagRemoves: ['just-joined-team'],
          feelDelta: -0.5,
        },
      },
      {
        id: 'show-skill',
        label: '直接开一局，用实力说话',
        description: '不说废话，用枪杆子证明自己。',
        check: {
          primary: 'agility',
          dc: 8,
          traitBonuses: { solo: 2, mechanical: 2 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '一局下来你拿了 25 杀。会议室里有人吹了个口哨，这次是佩服的那种。',
          tagRemoves: ['just-joined-team'],
          feelDelta: 1.5,
          tagAdds: ['highlight-clip'],
        },
        failure: {
          narrative: '你太想表现反而手抖了几波。有好几个该拿下的击杀都错过了。',
          tagRemoves: ['just-joined-team'],
          feelDelta: -1,
          stressDelta: 1,
        },
      },
    ],
  },

  // ── 合约续约 ──────────────────────────────────────────────────
  {
    id: 'chain-contract-renewal',
    type: 'team',
    title: '又到谈合同的时候了',
    narrative:
      '经纪人发来消息：你的合同周期到了。俱乐部那边已经准备好了一份新合同，需要你点头。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0,
    requireTags: ['contract-up'],
    forbidTags: ['contract-cd'],
    choices: [
      {
        id: 'renew-stay',
        label: '签字续约：维持现状',
        description: '安心打球，不折腾。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, selfless: 1 },
          traitPenalties: { ego: 1 },
        },
        success: {
          narrative: '你在合同上签了字，一切照旧。经纪人笑着说"明智的选择"。',
          stressDelta: -1,
          tagCooldowns: { 'contract-cd': 48 },
        },
        failure: {
          narrative: '你犹豫了很久，感觉条款里有坑。但最后还是在压力下签了。',
          stressDelta: 1,
          tagCooldowns: { 'contract-cd': 48 },
        },
      },
      {
        id: 'negotiate-raise',
        label: '要求加薪',
        description: '你在队里的表现配得上更多。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 2, ego: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '经纪人为你争取到了更高的周薪。俱乐部虽然不情愿，但知道你的价值。',
          moneyDelta: 2,
          feelDelta: 1,
          stressDelta: -1,
          tagCooldowns: { 'contract-cd': 48 },
        },
        failure: {
          narrative: '谈判桌上气氛不太对。俱乐部拒绝了你的要求，说"维持原样"已经是最好的方案。',
          feelDelta: -0.5,
          stressDelta: 2,
          tagCooldowns: { 'contract-cd': 48 },
        },
      },
      {
        id: 'leave-team',
        label: '不续了：成为自由人',
        description: '合同到期，各走各的路。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { solo: 2, ego: 1 },
          traitPenalties: { support: 2, selfless: 1 },
        },
        success: {
          narrative: '你站起来握了握经理的手。合同结束，下一站你自己选。',
          stressDelta: -1,
          fameDelta: -1,
        },
        failure: {
          narrative: '你说了不续，但回头看到队友们还在那练枪，心里不是滋味。',
          feelDelta: -0.5,
          stressDelta: 2,
          fameDelta: -1,
        },
      },
    ],
  },

  // ── 队内冲突 ──────────────────────────────────────────────────
  {
    id: 'chain-team-conflict',
    type: 'team',
    title: '更衣室里的低气压',
    narrative:
      '最近的气氛有点奇怪。训练赛里沟通越来越少，有人开始互相甩锅。你知道这样下去不行。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0,
    requireTags: ['stressed', 'has-team'],
    forbidTags: ['team-conflict-cd'],
    choices: [
      {
        id: 'talk-it-out',
        label: '把大家拉到一起聊',
        description: '直面问题永远是最好的办法。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { support: 3, selfless: 2, steady: 1 },
          traitPenalties: { ego: 2, shy: 1 },
        },
        success: {
          narrative: '你们坐下来把话说开了。其实都是训练节奏的问题，没人真对彼此有意见。',
          dailyGrowth: 'mentality',
          stressDelta: -2,
          tagAdds: ['team-trust'],
          tagCooldowns: { 'team-conflict-cd': 16 },
        },
        failure: {
          narrative: '越说越僵，有人摔门走了。气氛比开会前还差。',
          feelDelta: -0.5,
          stressDelta: 3,
          tiltDelta: 1,
          tagCooldowns: { 'team-conflict-cd': 12 },
        },
      },
      {
        id: 'grin-and-bear',
        label: '什么也不说，自己消化',
        description: '习惯了。打就行了。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, solo: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '你没说什么，但之后几场训练赛打得格外认真。用行动带动了节奏。',
          feelDelta: 1,
          stressDelta: 0,
          tagCooldowns: { 'team-conflict-cd': 12 },
        },
        failure: {
          narrative: '忍久了总会炸。一次小失误之后你终于没忍住发了火，虽然很快就后悔了。',
          feelDelta: -0.5,
          stressDelta: 2,
          tiltDelta: 1,
          tagCooldowns: { 'team-conflict-cd': 10 },
        },
      },
    ],
  },

  // ── 被踢出战队 ────────────────────────────────────────────────
  {
    id: 'chain-team-fired',
    type: 'team',
    title: '经理约你在会议室见',
    narrative:
      '经理的名字出现在日程表上。不是训练复盘，不是战术调整——你大概猜到是什么了。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 0,
    requireTags: ['losing-streak'],
    choices: [
      {
        id: 'accept-gracefully',
        label: '握手告别',
        description: '体面是最后的尊严。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { steady: 2, selfless: 1 },
          traitPenalties: { ego: 2, volatile: 1 },
        },
        success: {
          narrative: '你站起来握了手。虽然合同终止了，但经理说"你的训练态度没问题，就是运气差了点。"',
          stressDelta: -1,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你说不出话来。经理递过来的解约书你看了好几遍也没签。',
          feelDelta: -1.0,
          stressDelta: 4,
          tiltDelta: 1,
        },
      },
      {
        id: 'defend-record',
        label: '据理力争',
        description: '你的数据没问题，是体系不适合你。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 11,
          traitBonuses: { tactical: 2, ego: 1 },
          traitPenalties: { selfless: 1 },
        },
        success: {
          narrative: '你把自己的数据和战术贡献一一列出来。经理沉默了半分钟——然后说再给你一个赛季。',
          stressDelta: -2,
          fameDelta: 1,
        },
        failure: {
          narrative: '数据对方都有，你的辩解只是延长了尴尬。合同还是被终止了。',
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 5,
        },
      },
    ],
  },

  // ── 更高档俱乐部挖角 ──────────────────────────────────────────
  {
    id: 'chain-team-promote-offer',
    type: 'tryout',
    title: '有一封未署名的邮件',
    narrative:
      '邮件里没有太多内容——"我们有兴趣。"落款是那支你一直在看榜单的、比你当前俱乐部高一档的战队。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 0,
    requireTags: ['promote-eligible'],
    forbidTags: ['promote-offer-cd'],
    choices: [
      {
        id: 'explore-offer',
        label: '约个私聊，看看条件',
        description: '你值得更好的。',
        check: {
          primary: 'experience',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { ego: 1, solo: 1 },
          traitPenalties: { support: 2, selfless: 1 },
        },
        success: {
          narrative: '对方给出的条件比你现在的合同好一截。经纪人已经开始起草意向书了。',
          fameDelta: 2,
          stressDelta: -1,
          tagCooldowns: { 'promote-offer-cd': 32 },
        },
        failure: {
          narrative: '对方只是打听了一圈。你的价格比他们预期的要高了一点，这次没成。',
          feelDelta: -0.5,
          stressDelta: 1,
          tagCooldowns: { 'promote-offer-cd': 16 },
        },
      },
      {
        id: 'decline-loyal',
        label: '婉拒，忠于现在的队',
        description: '在这还有事情没做完。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { support: 2, selfless: 2, steady: 1 },
          traitPenalties: { ego: 1 },
        },
        success: {
          narrative: '你回了邮件表达了感谢。现任经理不知道这件事，但你知道你选择了什么。',
          dailyGrowth: 'mentality',
          tagCooldowns: { 'promote-offer-cd': 24 },
        },
        failure: {
          narrative: '拒绝了又后悔。夜深的时候你会想"如果当时去了会怎样"。',
          feelDelta: -0.5,
          stressDelta: 1,
          tagCooldowns: { 'promote-offer-cd': 20 },
        },
      },
    ],
  },

  // ── 对手星探 ────────────────────────────────────────────────
  {
    id: 'chain-rival-scout',
    type: 'media',
    title: '星探在观众席上',
    narrative:
      '今天比赛结束后有人拍到了几张照片——一个戴着帽子的男人在观众席上全程记着笔记。圈子里消息传得很快：那是某个顶级俱乐部的星探。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0,
    requireTags: ['rival-scout-active'],
    forbidTags: ['rival-scout-cd'],
    choices: [
      {
        id: 'play-to-impress',
        label: '接下来几场好好打',
        description: '被看上了，就要证明自己。',
        check: {
          primary: 'mentality',
          secondary: 'agility',
          dc: 8,
          traitBonuses: { ego: 1, clutch: 2, steady: 1 },
          traitPenalties: { fragile: 2 },
        },
        success: {
          narrative: '你知道有人在看，手反而更稳了。这种压力对你来说是燃料。',
          feelDelta: 1,
          fameDelta: 2,
          stressDelta: -1,
          tagCooldowns: { 'rival-scout-cd': 24 },
        },
        failure: {
          narrative: '越想证明自己越紧张。你知道星探在看，也看得出你那场发挥得不太正常。',
          feelDelta: -1,
          stressDelta: 2,
          tiltDelta: 1,
          tagCooldowns: { 'rival-scout-cd': 16 },
        },
      },
    ],
  },

  // ── 对手挖角 ────────────────────────────────────────────────
  {
    id: 'chain-rival-poach',
    type: 'tryout',
    title: '来自对面的橄榄枝',
    narrative:
      '一个陌生的 Discord 号发来消息：「我们队最近在重组，你的人选一直排在候选名单上。有空单独聊吗？」从资料来看，这是你认识的那个对手——积分榜上一直在你上面的那支。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 3,
    weight: 0,
    requireTags: ['rival-poach-possible'],
    forbidTags: ['rival-poach-cd'],
    choices: [
      {
        id: 'hear-offer',
        label: '听听他们的条件',
        description: '无论去不去，了解一下行情。',
        check: {
          primary: 'mentality',
          secondary: 'experience',
          dc: 9,
          traitBonuses: { ego: 1, solo: 1 },
          traitPenalties: { support: 2, selfless: 1 },
        },
        success: {
          narrative: '对方开出了比你目前高不少的待遇。经纪人觉得应该认真考虑。',
          fameDelta: 1,
          stressDelta: -1,
          tagCooldowns: { 'rival-poach-cd': 20 },
        },
        failure: {
          narrative: '聊到一半你意识到对方只是想套你们的战术信息。你礼貌地退出了通话。',
          feelDelta: -0.5,
          stressDelta: 2,
          tagCooldowns: { 'rival-poach-cd': 16 },
        },
      },
      {
        id: 'decline-poach',
        label: '不是时候，婉拒',
        description: '你对现在的队还有承诺。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { support: 2, selfless: 2, steady: 1 },
          traitPenalties: { ego: 1 },
        },
        success: {
          narrative: '你简短地回了消息表示谢意。不做随风草这件事本身就很有意义。',
          dailyGrowth: 'mentality',
          tagCooldowns: { 'rival-poach-cd': 18 },
        },
        failure: {
          narrative: '你拒绝了，但事后一直在想对方到底能开出什么价。训练也走神了。',
          feelDelta: -0.5,
          stressDelta: 1,
          tagCooldowns: { 'rival-poach-cd': 14 },
        },
      },
    ],
  },

  // ── 赛前口水战 ──────────────────────────────────────────────
  {
    id: 'chain-rival-match-trash',
    type: 'media',
    title: '赛前火药味',
    narrative:
      '下一场比赛的对手不太友善。他们的官号开始在社交媒体上发模棱两可的帖子——明显是冲着你来的。圈子里所有人都闻到了火药味。',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0,
    requireTags: ['rival-match-soon'],
    forbidTags: ['rival-trash-cd'],
    choices: [
      {
        id: 'clap-back',
        label: '回怼：让他们看看什么叫态度',
        description: '不能在这种时候示弱。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { volatile: 2, streamer: 2, ego: 1 },
          traitPenalties: { steady: 1, support: 1 },
        },
        success: {
          narrative: '你回了一条推文，又辣又准。评论区炸了，粉丝给你刷了一波支持。',
          fameDelta: 2,
          feelDelta: 1,
          tagCooldowns: { 'rival-trash-cd': 12 },
        },
        failure: {
          narrative: '话说过了，被截图放大。节奏越带越大，比赛前夜你还在看评论区。',
          fameDelta: -1,
          tiltDelta: 1,
          stressDelta: 3,
          tagCooldowns: { 'rival-trash-cd': 10 },
        },
      },
      {
        id: 'ignore-noise',
        label: '一句话都不回，专心备战',
        description: '赛后用分数回击才是最好的回击。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 3, grinder: 1 },
          traitPenalties: { volatile: 2 },
        },
        success: {
          narrative: '你关了所有社交软件，耳机一戴就是一天。等你出来时那条推文已经没人记得了。',
          dailyGrowth: 'mentality',
          stressDelta: -1,
          tagCooldowns: { 'rival-trash-cd': 12 },
        },
        failure: {
          narrative: '你告诉自己别看，但手指还是滑过去了。越看越烦，热身赛也打不进去。',
          feelDelta: -0.5,
          stressDelta: 2,
          tiltDelta: 1,
          tagCooldowns: { 'rival-trash-cd': 8 },
        },
      },
    ],
  },

  // ── 队友被挖 ────────────────────────────────────────────────
  {
    id: 'chain-rival-teammate-leave',
    type: 'team',
    title: '队友收拾东西走了',
    narrative:
      '你走进训练室发现一个位置空了。IGL 咳嗽了一声说：「他去其他队了。对面给了一个他拒绝不了的条件。」',
    stages: ['youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 2,
    weight: 0,
    requireTags: ['has-team'],
    forbidTags: ['teammate-leave-cd'],
    choices: [
      {
        id: 'wish-well',
        label: '发个消息祝他顺利',
        description: '职业圈很小，人情留一线。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { support: 2, selfless: 2 },
          traitPenalties: { ego: 1 },
        },
        success: {
          narrative: '他很快回了消息："谢了兄弟，下次见面就是对手了。"你笑了。',
          feelDelta: 0.5,
          stressDelta: -1,
          tagCooldowns: { 'teammate-leave-cd': 48 },
        },
        failure: {
          narrative: '你打了一行字又删掉。不知道该说什么。训练时那个空位格外刺眼。',
          feelDelta: -0.5,
          stressDelta: 1,
          tagCooldowns: { 'teammate-leave-cd': 40 },
        },
      },
      {
        id: 'step-up',
        label: '替补上阵，我来补这个坑',
        description: '少了人，责任就落到你肩上。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { solo: 2, clutch: 2, grinder: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '你主动承担了队友的空位和节奏。这周的训练你打出了近期最好的状态。',
          feelDelta: 1,
          fameDelta: 1,
          dailyGrowth: 'mentality',
          tagCooldowns: { 'teammate-leave-cd': 48 },
        },
        failure: {
          narrative: '你想撑着，但少了那个人的体系支撑，你自己也不太稳。',
          feelDelta: -0.5,
          tiltDelta: 1,
          stressDelta: 2,
          tagCooldowns: { 'teammate-leave-cd': 36 },
        },
      },
    ],
  },
];
