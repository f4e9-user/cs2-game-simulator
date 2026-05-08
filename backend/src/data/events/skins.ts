import type { EventDef } from '../../types.js';

// ── 通用 stage 适配 ──────────────────────────────────────────────
// ALL：叙事不涉及队友/战队/赞助商，任何阶段都可出现
// TEAM：叙事涉及队友/队内关系 → 需要 second+（有队）
// PRO：叙事涉及赞助商/观众 → 需要 pro+（有商业价值）
const ALL: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'] = [
  'rookie', 'youth', 'second', 'pro', 'star', 'veteran',
];
const TEAM: ['second', 'pro', 'star', 'veteran'] = [
  'second', 'pro', 'star', 'veteran',
];
const PRO: ['pro', 'star', 'veteran'] = [
  'pro', 'star', 'veteran',
];

// ================================================================
// 一、诈骗 / 翻车类（外部骗局，不依赖队内上下文）
// 主判定：experience（见过才知道是套路）
// 失败：dailyGrowth: experience（吃一堑长一智）
// ID 前缀：skin-scam-
// ================================================================

export const SKIN_SCAM_EVENTS: EventDef[] = [
  {
    id: 'skin-scam-tryout',
    type: 'life',
    title: '假的试训邀请',
    narrative:
      '有人私信你自称是某俱乐部星探，说看了你的路人局录像想让你来试训，让你带高价值皮肤进服务器展示「给教练看」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'verify-first',
        label: '先查一下对方底细',
        description: '搜战队名字、官网、联系渠道。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { streetwise: 3, steady: 1, tactical: 1 },
          traitPenalties: { ego: 2, solo: 1, impulsive: 1 },
        },
        success: {
          narrative: '你搜了一下对方给的战队名，发现根本没有这个组织。顺手举报了。',
          dailyGrowth: 'experience',
          fameDelta: 1,
        },
        failure: {
          narrative: '你兴冲冲进了服务器，对方让你「把皮肤丢出来让教练看看」，然后你就被踢了。皮肤没了。',
          moneyDelta: -40,
          feelDelta: -0.5,
          stressDelta: 3,
          tagAdds: ['scammed'],
          dailyGrowth: 'experience',
        },
      },
      {
        id: 'ask-around',
        label: '问圈内人认不认识这个队',
        description: '找人打听一下。',
        check: {
          primary: 'experience',
          dc: 7,
          traitBonuses: { support: 2, streetwise: 2 },
          traitPenalties: { solo: 2, shy: 1 },
        },
        success: {
          narrative: '朋友一听队名就笑了：「那个是假的，好几个人都收到过。」',
          dailyGrowth: 'experience',
        },
        failure: {
          narrative: '没人听说过这个队，但你也没多想，觉得是自己见识少。',
          stressDelta: 1,
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-scam-friend-impersonate',
    type: 'life',
    title: '好友被盗号了？',
    narrative:
      'Steam 上一个很久没联系的好友突然改了名换了头像，全套换成职业选手风格，上来就找你借刀。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'check-profile',
        label: '看一下对方资料再决定',
        description: '小心驶得万年船。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 7,
          traitBonuses: { streetwise: 3, steady: 1 },
          traitPenalties: { ego: 2, support: 1 },
        },
        success: {
          narrative: '你发现对方的好友天数只有 3 天，而且账号等级对不上。真好友不会这样。',
          dailyGrowth: 'experience',
        },
        failure: {
          narrative: '你说「都是兄弟，拿去吧」。然后好友就被删了，刀也没了。',
          moneyDelta: -50,
          feelDelta: -0.5,
          stressDelta: 2,
          tagAdds: ['scammed'],
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-scam-fake-match-link',
    type: 'life',
    title: '就差你一个了',
    narrative:
      '有人发你一链接：「5=1 就差你，赶紧进！」说是比赛房间就差一个人。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'check-link',
        label: '先看看链接域名',
        description: '链接看一眼就能辨真假。',
        check: {
          primary: 'experience',
          dc: 6,
          traitBonuses: { streetwise: 2, steady: 1 },
          traitPenalties: { impulsive: 2, solo: 1 },
        },
        success: {
          narrative: '链接域名是 xx- tournament.xyz ，不是比赛平台的官方域名。直接关掉。',
        },
        failure: {
          narrative: '你点了链接，输了 Steam 登录信息。然后号就被登了，库存开始往外转。',
          moneyDelta: -30,
          feelDelta: -0.5,
          stressDelta: 2,
          tagAdds: ['phished'],
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-scam-vote-link',
    type: 'life',
    title: '帮忙投个票？',
    narrative:
      '有人发来一条链接：「兄弟们帮投个票，我们战队入围了！」点进去要 Steam 登录。',
    stages: ALL,
    difficulty: 0,
    weight: 0.3,
    choices: [
      {
        id: 'spot-phish',
        label: '不点，直接举报',
        description: '一眼钓鱼。',
        check: {
          primary: 'experience',
          dc: 5,
          traitBonuses: { streetwise: 2 },
        },
        success: {
          narrative: '投票链接要 Steam 登录就是钓鱼——你顺手举报了一手。',
          feelDelta: 0.5,
          stressDelta: -1,
        },
        failure: {
          narrative: '你点了链接输了密码……然后库存被清空的那一刻你才反应过来。',
          moneyDelta: -20,
          feelDelta: -0.5,
          stressDelta: 1,
          tagAdds: ['phished'],
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-scam-discord-giveaway',
    type: 'life',
    title: 'Discord 抽奖送刀',
    narrative:
      'Discord 群里有人搞「抽奖送蝴蝶刀」，你被 @ 了。中奖要交 200 块「手续费」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'check-bot',
        label: '检查 bot 注册时间',
        description: '新 bot 抽奖大概率是假的。',
        check: {
          primary: 'experience',
          secondary: 'mentality',
          dc: 8,
          traitBonuses: { streetwise: 2, steady: 2 },
          traitPenalties: { gambler: 2, risky: 1, impulsive: 1 },
        },
        success: {
          narrative: '你一查，bot 是三天前注册的，抽奖记录全是自己人。退出群聊。',
          feelDelta: 0.5,
        },
        failure: {
          narrative: '你转了 200「手续费」，然后 bot 把你踢出了群。',
          moneyDelta: -30,
          stressDelta: 2,
          tagAdds: ['scammed'],
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-scam-fake-steam-support',
    type: 'life',
    title: 'Steam 客服找上门',
    narrative:
      '一个自称 Steam 客服的人通过 Steam 聊天加你，说你账号有异常登录，需要点击链接进行「申诉处理」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'know-support',
        label: '真客服不会在聊天里找你',
        description: '常识判断。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { streetwise: 3, steady: 1 },
          traitPenalties: { shy: 1, solo: 1 },
        },
        success: {
          narrative: 'Steam 官方渠道只有邮件和工单系统，不会通过聊天联系你。举报拉黑。',
          dailyGrowth: 'experience',
          feelDelta: 0.5,
        },
        failure: {
          narrative: '你点开链接输入了账号密码和 API key……然后眼睁睁看着库存一件一件被转走。',
          moneyDelta: -40,
          feelDelta: -0.5,
          stressDelta: 3,
          tagAdds: ['phished'],
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-scam-trade-freeze',
    type: 'life',
    title: '交易卡单了',
    narrative:
      '你在交易平台上和人换皮肤，对方发来报价后说「我这里卡了没显示确认，你先点吧」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'hold-firm',
        label: '不确认，让对方先处理',
        description: '坚持等对方确认。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { steady: 2 },
          traitPenalties: { impulsive: 2, support: 1 },
        },
        success: {
          narrative: '你坚持不点确认，对方磨了几分钟之后放弃了。你的皮肤保住了。',
          feelDelta: 0.5,
          stressDelta: -1,
        },
        failure: {
          narrative: '你点了确认，然后对方秒删好友。你的皮肤没了，对面啥也没给。',
          moneyDelta: -20,
          feelDelta: -0.5,
          stressDelta: 2,
          dailyGrowth: 'experience',
        },
      },
    ],
  },
];

// ================================================================
// 二、赌狗 / 上头类（gambler 特质 → 事件权重 ×2）
// 主判定多样化，纯概率+检定混合
// ID 前缀：skin-gamble-
// ================================================================

export const SKIN_GAMBLE_EVENTS: EventDef[] = [
  {
    id: 'skin-gamble-win-streak-cases',
    type: 'life',
    title: '手气正旺',
    narrative:
      '今天天梯状态好得离谱，连胜了好几把。屏幕角落的开箱广告弹了出来——你感觉今天运气不会差。',
    stages: ALL,
    difficulty: 0,
    weight: 0.5,
    choices: [
      {
        id: 'resist-urge',
        label: '关掉广告，保持专注',
        description: '不被一时冲动牵着走。',
        check: {
          primary: 'mentality',
          dc: 11,
          traitBonuses: { steady: 2 },
          traitPenalties: { gambler: 3, impulsive: 2, risky: 1 },
        },
        success: {
          narrative: '你深吸一口气，关掉了页面。今晚的连胜就是最好的结果。',
          dailyGrowth: 'mentality',
          feelDelta: -0.5,
        },
        failure: {
          narrative: '你心想「手感这么好，开两箱不过分吧」。二十箱蓝天白云。心情一下子掉回去了。',
          moneyDelta: -20,
          feelDelta: -0.5,
          stressDelta: 3,
          tagAdds: ['gambling-spiral'],
        },
      },
    ],
  },
  {
    id: 'skin-gamble-fomo-cases',
    type: 'life',
    title: '别人都开出来了',
    narrative:
      '群里有人在晒新开出来的刀，一把比一把贵。你看着自己的库存，手有点痒。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'do-the-math',
        label: '算算期望值冷静一下',
        description: '打开箱子的期望值永远是负的。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 2, tactical: 1, streetwise: 1 },
          traitPenalties: { gambler: 3, flashy: 2, impulsive: 1 },
        },
        success: {
          narrative: '你算了一笔账——开箱期望值是 -60%。关掉页面，省下来的钱够买一个不错的皮肤了。',
          dailyGrowth: 'experience',
          stressDelta: -1,
        },
        failure: {
          narrative: '「就开五箱，不上头。」然后开了五箱垃圾，又补了五箱，还是垃圾。',
          moneyDelta: -30,
          feelDelta: -0.5,
          stressDelta: 3,
          tagAdds: ['gambling-spiral'],
        },
      },
    ],
  },
  {
    id: 'skin-gamble-tilt-cases',
    type: 'life',
    title: '输麻了，开箱回血',
    narrative:
      '今天比赛输得很难看。你坐在电脑前不想说话，手指不自觉地打开了开箱页面。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'lock-account',
        label: '锁掉余额，出去走走',
        description: '最止损的方式。',
        check: {
          primary: 'mentality',
          dc: 12,
          traitBonuses: { steady: 3 },
          traitPenalties: { gambler: 3, risky: 2, obsessed: 1, impulsive: 1 },
        },
        success: {
          narrative: '你硬是把账号切了出去，出门走了二十分钟。回来的时候平静了很多。',
          dailyGrowth: 'mentality',
          stressDelta: -2,
        },
        failure: {
          narrative: '「今天运气不会一直差吧？」结果会的。输完比赛输钱，心态直接崩穿地心。',
          moneyDelta: -30,
          feelDelta: -1.0,
          stressDelta: 5,
          tiltDelta: 1,
          tagAdds: ['gambling-spiral'],
        },
      },
    ],
  },
  {
    id: 'skin-gamble-market-night',
    type: 'life',
    title: '半夜刷市场',
    narrative:
      '凌晨两点你在刷饰品市场，看到一个皮肤价格在慢慢爬——你越看越觉得「这波要起飞」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'analyze-trend',
        label: '看看历史走势再决定',
        description: '冲动是魔鬼。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 11,
          traitBonuses: { tactical: 3, steady: 1 },
          traitPenalties: { obsessed: 2, gambler: 1, impulsive: 1 },
        },
        success: {
          narrative: '你拉了三个月的历史走势图，发现目前已经是高点。关了电脑睡觉，第二天果然跌了。',
          moneyDelta: 20,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你全仓买入。第二天醒来价格跌了 20%。',
          moneyDelta: -20,
          feelDelta: -0.5,
          stressDelta: 2,
        },
      },
    ],
  },
  {
    id: 'skin-gamble-flip-for-dream-knife',
    type: 'life',
    title: '就差一把刀的钱',
    narrative:
      '你物色了很久的梦中情刀只差一点点钱了——大概倒腾几笔库存就能凑够。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'careful-flip',
        label: '精打细算慢慢倒',
        description: '耐心低买高卖。',
        check: {
          primary: 'agility',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { obsessed: 2, grinder: 1, tactical: 1 },
          traitPenalties: { impulsive: 2, steady: 1 },
        },
        success: {
          narrative: '你花了大半天低买高卖，最后不但凑够了钱还多赚了一点点。刀到手了。',
          moneyDelta: 20,
          fatigueDelta: 10,
        },
        failure: {
          narrative: '急着出货，结果低价卖了又高价买回，一来一回亏了不少。刀离你更远了。',
          moneyDelta: -30,
          feelDelta: -0.5,
          fatigueDelta: 15,
          stressDelta: 2,
        },
      },
    ],
  },
];

// ================================================================
// 三、社交 / 人性类
// 涉及队友/赞助商的需对应 stages
// ID 前缀：skin-social-
// ================================================================

export const SKIN_SOCIAL_EVENTS: EventDef[] = [
  {
    id: 'skin-social-teammate-gift',
    type: 'team',
    title: '新队友的小礼物',
    narrative:
      '队里一个新来的队友特别热情，总说你的准镜不好看，隔几天就送你一个小饰品。',
    stages: TEAM,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'accept-gratefully',
        label: '大方收下，真心感谢',
        description: '建立关系。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { support: 2, selfless: 2 },
          traitPenalties: { shy: 2, ego: 1 },
        },
        success: {
          narrative: '你真诚地道了谢，之后你们经常一起练枪。关系越来越铁。',
          moneyDelta: 10,
          dailyGrowth: 'mentality',
          feelDelta: 0.5,
          tagAdds: ['social-circle'],
        },
        failure: {
          narrative: '你总觉得拿了东西欠人情，回复很客气很疏远。之后他也不再送了，气氛有点尴尬。',
          feelDelta: -0.5,
          stressDelta: 1,
          tagAdds: ['suspicious-debt'],
        },
      },
    ],
  },
  {
    id: 'skin-social-boss-sponsor',
    type: 'life',
    title: '老板的赞助邀约',
    narrative:
      '一个自称「老板」的人联系你，说想赞助你一套顶级装备，条件是比赛中要带上他品牌的贴纸和名字前缀。',
    stages: PRO,
    difficulty: 1,
    weight: 0.3,
    choices: [
      {
        id: 'accept-sponsor',
        label: '接下赞助',
        description: '装备升级 + 收入，但需要配合宣传。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { streamer: 3, media: 2 },
          traitPenalties: { shy: 2, 'anti-media': 2, solo: 1 },
        },
        success: {
          narrative: '装备到了，比你现在用的好一个档次。宣传配合得也不错，老板又追加了半年合同。',
          moneyDelta: 30,
          fameDelta: 3,
          stressDelta: 2,
        },
        failure: {
          narrative: '宣传太生硬，弹幕都在刷「恰烂饭」。你的注意力也被分散了，训练状态受影响。',
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 3,
          fameDelta: -1,
          tagAdds: ['bad-rep'],
        },
      },
      {
        id: 'decline-sponsor',
        label: '婉拒，专注打比赛',
        description: '不想被商业分心。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { steady: 2, selfless: 1 },
        },
        success: {
          narrative: '你礼貌拒绝了。老板表示理解，说以后有机会再合作。',
          feelDelta: 0.5,
        },
        failure: {
          narrative: '你拒绝了但有点后悔——那套装备确实比你现在用的好太多了。',
          feelDelta: -0.5,
        },
      },
    ],
  },
  {
    id: 'skin-social-middleman',
    type: 'life',
    title: '朋友找你当中间人',
    narrative:
      '一个朋友说「你信誉好，帮我们俩做个中间人吧，就过一下手的事」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'help-out',
        label: '帮这个忙',
        description: '用人品担保。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 8,
          traitBonuses: { support: 3, selfless: 2, streetwise: 1 },
          traitPenalties: { ego: 2, solo: 1 },
        },
        success: {
          narrative: '交易顺利，两边都感谢你。你在圈子里又多了一个「靠谱」的标签。',
          moneyDelta: 10,
          dailyGrowth: 'mentality',
          tagAdds: ['trusted-trader'],
        },
        failure: {
          narrative: '出了纠纷，一方说你偏袒。你夹在中间两头不讨好，还亏了点钱。',
          moneyDelta: -20,
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 2,
          tagAdds: ['bad-rep'],
        },
      },
    ],
  },
  {
    id: 'skin-social-teammate-flex',
    type: 'team',
    title: '队里的炫富怪',
    narrative:
      '队里有个人天天换新刀新手套，训练间隙就在那摆动作。说实话，你看得有点眼热。',
    stages: TEAM,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'stay-focused',
        label: '不管他，专心练自己的',
        description: '跟别人比没意义。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, support: 1, grinder: 1 },
          traitPenalties: { impulsive: 2, flashy: 1 },
        },
        success: {
          narrative: '你瞟了一眼，继续练你的预瞄。这些东西跟你没关系，打好自己的就行。',
          dailyGrowth: 'mentality',
          stressDelta: -1,
        },
        failure: {
          narrative: '你越看越不是滋味，心里憋着一股气。训练也没怎么练进去。',
          feelDelta: -0.5,
          tiltDelta: 1,
          stressDelta: 2,
          tagAdds: ['locker-tension'],
        },
      },
    ],
  },
  {
    id: 'skin-social-taunt-贫民',
    type: 'media',
    title: '「穷鬼皮肤影响发挥」',
    narrative:
      '有人看到你用的原版皮肤，在公屏/评论区嘲讽了一句。所有人都看到了。',
    stages: ALL,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'shut-up-with-play',
        label: '用实力打回去',
        description: '分数是最好的回击。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { mechanical: 2, steady: 2, clutch: 1 },
          traitPenalties: { volatile: 2, fragile: 1 },
        },
        success: {
          narrative: '你没说话，打了 30 杀。赛后那人默默退出了房间。有人把战绩截图发了出来。',
          feelDelta: 1,
          fameDelta: 1,
          stressDelta: -1,
          tagAdds: ['highlight-clip'],
        },
        failure: {
          narrative: '你被这句话点炸了，操作开始变形。越想证明自己越打不出来。',
          feelDelta: -0.5,
          tiltDelta: 1,
          stressDelta: 3,
        },
      },
      {
        id: 'ignore-taunt',
        label: '无视，当没看见',
        description: '跟这种人较劲就输了。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 3, selfless: 1 },
          traitPenalties: { volatile: 2, ego: 1 },
        },
        success: {
          narrative: '你没理会，继续打自己的。几句话而已，犯不着。',
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你告诉自己不要在意，但那句话一直在脑子里转。',
          feelDelta: -0.5,
          tiltDelta: 1,
          stressDelta: 1,
        },
      },
    ],
  },
];

// ================================================================
// 四、市场 / 投机类（外部市场事件，无队内上下文）
// ID 前缀：skin-market-
// ================================================================

export const SKIN_MARKET_EVENTS: EventDef[] = [
  {
    id: 'skin-market-major-sticker',
    type: 'life',
    title: 'Major 贴纸热',
    narrative:
      '圈子里在传某个选手的 Major 贴纸要起飞——他这届打得太好了，贴纸可能要绝版。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'research-first',
        label: '查查历史数据再动手',
        description: '调研是投资的第一步。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 10,
          traitBonuses: { tactical: 2, steady: 1 },
          traitPenalties: { gambler: 1, impulsive: 1 },
        },
        success: {
          narrative: '你发现这选手的贴纸存量确实不大，在小涨之前入了十几张。Major 结束后翻了。',
          moneyDelta: 20,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你跟风买了一堆，结果那个选手小组赛就回家了，贴纸跌回原价。',
          moneyDelta: -20,
        },
      },
    ],
  },
  {
    id: 'skin-market-discontinue-rumor',
    type: 'life',
    title: '绝版传言四起',
    narrative:
      '有人在论坛爆料说某个系列要绝版了，价格已经开始跳。你不知道该不该信。',
    stages: ALL,
    difficulty: 0,
    weight: 0.3,
    choices: [
      {
        id: 'verify-source',
        label: '核实消息来源',
        description: '真假消息决定了赚还是亏。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 2, streetwise: 2 },
          traitPenalties: { gambler: 2, impulsive: 2, flashy: 1 },
        },
        success: {
          narrative: '你顺着消息源查了一圈，发现是可靠渠道的消息。果断入了一点。一周后官方公告证实了。',
          moneyDelta: 30,
          fameDelta: 1,
        },
        failure: {
          narrative: '消息是倒狗放的。你接盘了，他们出货了。',
          moneyDelta: -30,
          stressDelta: 2,
        },
      },
    ],
  },
  {
    id: 'skin-market-buff-weapon',
    type: 'life',
    title: '版本更新带涨',
    narrative:
      '新版本更新后某把枪的数据明显提升了，对应的皮肤价格才开始动。速度快的能赚一笔。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'fast-buy',
        label: '马上扫几个冷门皮',
        description: '手快有手慢无。',
        check: {
          primary: 'agility',
          secondary: 'experience',
          dc: 9,
          traitBonuses: { obsessed: 2, grinder: 1 },
          traitPenalties: { lazy: 1 },
        },
        success: {
          narrative: '你在价格起飞前扫了三个冷门皮肤。两天后翻了一倍。',
          moneyDelta: 20,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你买的时候价格已经涨完了。进去就是接盘侠。',
          moneyDelta: -20,
        },
      },
    ],
  },
  {
    id: 'skin-market-volume-spike',
    type: 'life',
    title: '冷门皮肤突然放量',
    narrative:
      '你发现一个平时没什么交易的冷门皮肤，过去一小时成交量突然暴涨。',
    stages: ALL,
    difficulty: 0,
    weight: 0.3,
    choices: [
      {
        id: 'detect-whale',
        label: '判断是不是庄家操作',
        description: '放量可能是机会也可能是陷阱。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 11,
          traitBonuses: { tactical: 3, steady: 1, streetwise: 1 },
          traitPenalties: { gambler: 2, risky: 1, flashy: 1 },
        },
        success: {
          narrative: '你分析了交易频次和钱包分布——是真需求不是庄家。跟着进了一小单，吃了波肉。',
          moneyDelta: 30,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '庄家拉高出货，你冲进去接了个正着。',
          moneyDelta: -20,
          stressDelta: 2,
        },
      },
    ],
  },
  {
    id: 'skin-market-whale-sweep',
    type: 'life',
    title: '大户在扫货',
    narrative:
      '你在市场追踪工具上看到一个钱包地址正在大批扫入某个皮肤。你怀疑有内幕消息。',
    stages: ALL,
    difficulty: 0,
    weight: 0.25,
    choices: [
      {
        id: 'follow-whale',
        label: '跟一小单',
        description: '大户吃肉你喝汤。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 12,
          traitBonuses: { tactical: 2, streetwise: 2 },
          traitPenalties: { gambler: 2, risky: 1 },
        },
        success: {
          narrative: '你跟了一小单，两天后那个皮肤果然被庄家拉了一波。虽然仓不大但利润可观。',
          moneyDelta: 40,
          dailyGrowth: 'mentality',
          fameDelta: 1,
        },
        failure: {
          narrative: '你跟了重仓，然后大户砸盘走人了。你被晾在山顶。',
          moneyDelta: -30,
          feelDelta: -0.5,
          stressDelta: 3,
        },
      },
    ],
  },
];

// ================================================================
// 五、灰色 / 边缘类（高风险高回报）
// ID 前缀：skin-gray-
// ================================================================

export const SKIN_GRAY_EVENTS: EventDef[] = [
  {
    id: 'skin-gray-fire-sale',
    type: 'life',
    title: '急出，低价',
    narrative:
      '有人私聊你出一把刀，价格只有市场价的六折。说是「急出，今天就要」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.3,
    choices: [
      {
        id: 'verify-item',
        label: '先查来源再决定',
        description: '太便宜的往往有问题。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { streetwise: 3, steady: 1 },
          traitPenalties: { gambler: 2, impulsive: 2 },
        },
        success: {
          narrative: '你查了交易记录，发现这把刀来自一个近期被盗的账号。放弃交易并举报了。',
          dailyGrowth: 'experience',
        },
        failure: {
          narrative: '你贪便宜收了。三天后账号被 Valve 冻结——赃物牵连，你的账号也跟着遭殃。',
          moneyDelta: -50,
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 4,
          tagAdds: ['scammed'],
          dailyGrowth: 'experience',
        },
      },
    ],
  },
  {
    id: 'skin-gray-boost-托管',
    type: 'life',
    title: '代练加托管一条龙',
    narrative:
      '一个网站提供代练上分+饰品托管服务，价格很诱人。但网站看起来有点简陋。',
    stages: ALL,
    difficulty: 0,
    weight: 0.3,
    choices: [
      {
        id: 'vet-site',
        label: '调研一下这网站',
        description: '看看有没有前车之鉴。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 8,
          traitBonuses: { tactical: 2, steady: 1, streetwise: 1 },
          traitPenalties: { impulsive: 2, lazy: 1 },
        },
        success: {
          narrative: '你搜了一下，发现这个网站备案信息是假的，论坛上有人发帖说被卷跑了。省了一笔。',
          dailyGrowth: 'experience',
        },
        failure: {
          narrative: '你把号给了他们。三天后网站打不开了，你的饰品和段位一起没了。',
          moneyDelta: -30,
          feelDelta: -0.5,
          stressDelta: 3,
          tagAdds: ['phished'],
        },
      },
    ],
  },
  {
    id: 'skin-gray-余额套利',
    type: 'life',
    title: '余额套利教学',
    narrative:
      '有人教你一套「倒余额套利」的方法：低价收礼品卡换余额，再等折扣期买入卖出。',
    stages: ALL,
    difficulty: 0,
    weight: 0.35,
    choices: [
      {
        id: 'try-arbitrage',
        label: '试一下',
        description: '套利理论上是稳的。',
        check: {
          primary: 'money',
          secondary: 'intelligence',
          dc: 7,
          traitBonuses: { tactical: 2, streetwise: 1 },
          traitPenalties: { steady: 1 },
        },
        success: {
          narrative: '操作了一轮，扣掉手续费净赚了 15%。钱不多但稳定。',
          moneyDelta: 20,
          fatigueDelta: 8,
        },
        failure: {
          narrative: '市场价在你操作期间波动了，加上手续费反而亏了一点。',
          moneyDelta: -10,
          fatigueDelta: 5,
        },
      },
    ],
  },
  {
    id: 'skin-gray-black-market-screenshot',
    type: 'life',
    title: '黑市库存截图',
    narrative:
      '你被拉进一个群，有人发了大量库存截图——全是热门高价值皮肤，但来源标记「不可查」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.25,
    choices: [
      {
        id: 'leave-immediately',
        label: '退群删除记录',
        description: '干净最重要。',
        check: {
          primary: 'mentality',
          secondary: 'experience',
          dc: 10,
          traitBonuses: { steady: 3, selfless: 2, streetwise: 1 },
          traitPenalties: { gambler: 3, risky: 2, impulsive: 1 },
        },
        success: {
          narrative: '你二话不说退了群，把所有聊天记录清了。这浑水不蹚。',
          dailyGrowth: 'mentality',
          tagAdds: ['clean-record'],
        },
        failure: {
          narrative: '你多看了几眼那些截图——有人截图了你的在线状态。之后有人私聊你「有兴趣吗」。',
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 3,
          tagAdds: ['dirty-money'],
        },
      },
    ],
  },
  {
    id: 'skin-gray-money-group',
    type: 'life',
    title: '「只聊赚钱」的小圈子',
    narrative:
      '一个群聊拉你进去，说是只聊「饰品投资和赚钱机会」。群里氛围有点兴奋。',
    stages: ALL,
    difficulty: 0,
    weight: 0.3,
    choices: [
      {
        id: 'assess-group',
        label: '先观察几天再说',
        description: '不急着参与。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { streetwise: 3, tactical: 1 },
          traitPenalties: { gambler: 3, risky: 2, impulsive: 1 },
        },
        success: {
          narrative: '你观察了几天——发现群里确实有几个正经做饰品期货的，跟了一波小赚。',
          moneyDelta: 20,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你没忍住参与了他们的「内部项目」，结果发现是变相赌博盘。钱进去了出不来。',
          feelDelta: -0.5,
          stressDelta: 2,
          moneyDelta: -30,
          tagAdds: ['dirty-money'],
        },
      },
    ],
  },
];

// ================================================================
// 六、搞笑 / 奇葩类（调节节奏，低数值影响）
// ID 前缀：skin-funny-
// ================================================================

export const SKIN_FUNNY_EVENTS: EventDef[] = [
  {
    id: 'skin-funny-id-europe',
    type: 'life',
    title: 'ID 变欧皇',
    narrative:
      '你开了一堆箱子全是蓝天白云——但你的 ID 后面突然被系统加了个「#8888」的随机数，队友笑称你这是「欧皇认证编号」。',
    stages: ALL,
    difficulty: 0,
    weight: 0.6,
    choices: [
      {
        id: 'laugh-it-off',
        label: '自嘲一波',
        description: '这运气也没谁了。',
        check: {
          primary: 'mentality',
          dc: 4,
        },
        success: {
          narrative: '你笑着截图发了个动态：「#8888 蓝天白云认证用户」。反而涨了几个粉。',
          fameDelta: 1,
        },
        failure: {
          narrative: '你有点沮丧——开箱运也太差了。不过至少 ID 变好看了？',
        },
      },
    ],
  },
  {
    id: 'skin-funny-sticker-玄学',
    type: 'team',
    title: '贴纸玄学',
    narrative:
      '队友郑重其事地告诉你：这把枪贴了某个贴纸爆头率会提升 30%——他看起来是认真的。',
    stages: TEAM,
    difficulty: 0,
    weight: 0.5,
    choices: [
      {
        id: 'play-along',
        label: '贴一个试试',
        description: '信一下又不会少块肉。',
        check: {
          primary: 'mentality',
          dc: 5,
          traitBonuses: { steady: 1 },
        },
        success: {
          narrative: '你贴了上去。下一局真爆了两个头——虽然你知道是巧合，但感觉不错。',
          feelDelta: 0.5,
        },
        failure: {
          narrative: '你贴了上去，然后一整局一个爆头都没有。队友说「你贴错位置了」。',
          feelDelta: -0.5,
        },
      },
    ],
  },
  {
    id: 'skin-funny-ugly-flex',
    type: 'life',
    title: '最丑的搭配',
    narrative:
      '排到一个人，用的是一套贵得离谱但丑得惊心的搭配——荧光绿手套配暗红刀，还一直在那切刀。',
    stages: ALL,
    difficulty: 0,
    weight: 0.5,
    choices: [
      {
        id: 'compliment-sarcastic',
        label: '调侃一句',
        description: '气氛组上线。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { media: 1 },
          traitPenalties: { shy: 1 },
        },
        success: {
          narrative: '你说了句「这搭配审美太超前了」，他回了个笑脸。气氛挺好。',
          feelDelta: 0.5,
        },
        failure: {
          narrative: '你话说重了，对方直接开麦对喷。好好的路人局变成了口水战。',
          feelDelta: -0.5,
          tiltDelta: 1,
        },
      },
    ],
  },
  {
    id: 'skin-funny-distracted-by-skin',
    type: 'life',
    title: '被自己美到了',
    narrative:
      '你刚换了一把新皮肤进游戏。一个残局对枪前你忍不住看了一眼——然后被对面爆头了。',
    stages: ALL,
    difficulty: 0,
    weight: 0.5,
    choices: [
      {
        id: 'shake-it-off',
        label: '自嘲一下，拉回来',
        description: '好看的皮囊千篇一律……',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { steady: 1 },
          traitPenalties: { flashy: 1 },
        },
        success: {
          narrative: '你苦笑着摇了摇头，下一局认真打回来。',
        },
        failure: {
          narrative: '你越想越气，注意力反倒更散了。队友在语音里喊你都没听到。',
          feelDelta: -0.5,
          tiltDelta: 1,
        },
      },
    ],
  },
  {
    id: 'skin-funny-audience-only-cares-skin',
    type: 'media',
    title: '弹幕全在问刀',
    narrative:
      '今天比赛你的操作不错，但下播一看录播回放——弹幕全在讨论你今天用的什么刀。没人在意你打了几个名场面。',
    stages: PRO,
    difficulty: 0,
    weight: 0.4,
    choices: [
      {
        id: 'embrace-it',
        label: '顺着弹幕聊',
        description: '观众爱看什么你就给什么。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { streamer: 2, media: 2 },
          traitPenalties: { shy: 2, antiMedia: 1 },
        },
        success: {
          narrative: '你干脆把皮肤搭配讲了一遍，弹幕活跃度反而上来了。平台运营私信你说这场直播数据不错。',
          fameDelta: 1,
          stressDelta: -1,
        },
        failure: {
          narrative: '你越聊越偏，训练时间被挤掉了。而且弹幕还是只关心皮肤，不关心你的比赛。',
          fameDelta: -1,
          stressDelta: 1,
        },
      },
      {
        id: 'redirect-focus',
        label: '把话题拉回比赛',
        description: '你是选手不是模特。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, grinder: 1 },
          traitPenalties: { volatile: 1 },
        },
        success: {
          narrative: '你说了句「刀不重要，重要的是准星」，然后把刚才那波残局复盘了一遍。部分观众开始认真听了。',
          dailyGrowth: 'mentality',
          stressDelta: -1,
        },
        failure: {
          narrative: '你有点不耐烦地说「能不能别聊皮肤了」，弹幕刷得更厉害了。',
          feelDelta: -0.5,
          stressDelta: 2,
        },
      },
    ],
  },
];

// ================================================================
// 七、高戏剧性事件（低权重，高影响）
// ID 前缀：skin-epic-
// ================================================================

export const SKIN_EPIC_EVENTS: EventDef[] = [
  {
    id: 'skin-epic-hacked',
    type: 'life',
    title: '账号被盗了',
    narrative:
      '早上一醒来，你发现 Steam 账号被登出了。重新登录后发现库存已经空了——API key 被人拿了。',
    stages: ALL,
    difficulty: 1,
    weight: 0.1,
    choices: [
      {
        id: 'damage-control',
        label: '立刻找 Valve 申诉 + 改所有密码',
        description: '尽人事。',
        check: {
          primary: 'mentality',
          dc: 14,
          traitBonuses: { steady: 2 },
          traitPenalties: { fragile: 2, volatile: 1 },
        },
        success: {
          narrative: '你冷静地走完了申诉流程，改掉了所有关联密码。Valve 说可能会追回部分物品。心态没有崩，但账号里的皮肤损失了大半，需要时间恢复。',
          dailyGrowth: 'mentality',
          stressDelta: -2,
          moneyDelta: -80,
          injuryRestRounds: 2,
        },
        failure: {
          narrative: '你慌了。申诉流程填错了好几次。损失追不回来了。这件事好几天都过不去。',
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 4,
          fatigueDelta: 30,
          tagAdds: ['devastated'],
          moneyDelta: -80,
          injuryRestRounds: 2,
        },
      },
    ],
  },
  {
    id: 'skin-epic-misprice',
    type: 'life',
    title: '挂错了价格',
    narrative:
      '你上架一个高价值皮肤时少打了一个零。挂在市场上才几秒钟——已经有人点购买了。',
    stages: ALL,
    difficulty: 0,
    weight: 0.15,
    choices: [
      {
        id: 'cancel-quick',
        label: '光速取消',
        description: '手速决定一切。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { impulsive: 1 },
          traitPenalties: { steady: 1 },
        },
        success: {
          narrative: '你在被秒拍的最后一刻取消了上架。心跳 180，但保住了。',
          feelDelta: 0.5,
          stressDelta: -1,
        },
        failure: {
          narrative: '你眼睁睁看着被人秒拍走了。几秒的失误，亏了一大笔。',
          moneyDelta: -30,
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 3,
        },
      },
    ],
  },
  {
    id: 'skin-epic-bargain-windfall',
    type: 'life',
    title: '捡了个大漏',
    narrative:
      '你之前随手低价收的一个冷门皮肤，今天发现价格暴涨了十几倍。群里都在@你。',
    stages: ALL,
    difficulty: 0,
    weight: 0.1,
    forbidTags: ['epic-bargain-cd'],
    choices: [
      {
        id: 'cash-out',
        label: '出了，落袋为安',
        description: '赚到的才是真的。',
        check: {
          primary: 'mentality',
          dc: 5,
        },
        success: {
          narrative: '你挂了一个低于市场价一点的价格，瞬间被秒。这笔钱够你换一套好装备了。',
          moneyDelta: 60,
          feelDelta: 1,
          fameDelta: 2,
          stressDelta: -1,
          tagCooldowns: { 'epic-bargain-cd': 48 },
        },
        failure: {
          narrative: '你犹豫了一下没出，第二天价格跌回去了一半。虽然还是赚了，但没赚到最多。',
          moneyDelta: 30,
          feelDelta: 0.5,
          fameDelta: 1,
          tagCooldowns: { 'epic-bargain-cd': 48 },
        },
      },
    ],
  },
  {
    id: 'skin-epic-team-fight-over-skin',
    type: 'team',
    title: '一把刀引发的矛盾',
    narrative:
      '队内因为一把刀的归属吵起来了——训练赛里有人用了你的皮肤设定，说是「借来用用」，你发现的时候已经打在比赛里了。',
    stages: TEAM,
    difficulty: 1,
    weight: 0.15,
    choices: [
      {
        id: 'resolve-calmly',
        label: '冷静沟通',
        description: '把话说开。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { support: 2, selfless: 1, steady: 1 },
          traitPenalties: { ego: 3, volatile: 2 },
        },
        success: {
          narrative: '你好好说了，对方也道了歉。队长出面协调，这件事翻篇了。',
          dailyGrowth: 'mentality',
          stressDelta: -1,
        },
        failure: {
          narrative: '话说重了，对方也火了。训练室气压骤降。经理不得不过来调解。',
          feelDelta: -1.0,
          tiltDelta: 1,
          stressDelta: 4,
          tagAdds: ['locker-tension', 'bad-rep'],
        },
      },
    ],
  },
  {
    id: 'skin-epic-sponsor-mandates-skin',
    type: 'media',
    title: '赞助商要求换皮肤',
    narrative:
      '赞助商发来邮件：下一场比赛你需要使用我们品牌的指定皮肤套装——包含一个你不喜欢的配色。',
    stages: PRO,
    difficulty: 1,
    weight: 0.15,
    choices: [
      {
        id: 'comply',
        label: '配合赞助商要求',
        description: '商业合同，得执行。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 8,
          traitBonuses: { streamer: 2, media: 1 },
          traitPenalties: { solo: 1 },
        },
        success: {
          narrative: '你换上了指定皮肤，打了几局之后发现其实手感还行。赞助商很满意，续约谈判开始了。',
          moneyDelta: 30,
          fameDelta: 2,
          stressDelta: 1,
        },
        failure: {
          narrative: '你用了两周实在受不了那配色，换回了自己的皮肤。赞助商投诉到俱乐部，你被约谈了。',
          moneyDelta: -30,
          feelDelta: -0.5,
          fameDelta: -2,
          stressDelta: 4,
          tagAdds: ['bad-rep'],
        },
      },
    ],
  },
];

// ── 全量导出 ──────────────────────────────────────────────────────
export const SKIN_EVENTS: EventDef[] = [
  ...SKIN_SCAM_EVENTS,
  ...SKIN_GAMBLE_EVENTS,
  ...SKIN_SOCIAL_EVENTS,
  ...SKIN_MARKET_EVENTS,
  ...SKIN_GRAY_EVENTS,
  ...SKIN_FUNNY_EVENTS,
  ...SKIN_EPIC_EVENTS,
];
