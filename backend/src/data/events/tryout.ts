import type { EventDef } from '../../types.js';

// --- Promotion narrative events ---
// These are NOT in the normal event pool. pickEvent injects them explicitly
// when player.promotionPending !== null.

export const PROMOTION_EVENTS: EventDef[] = [
  {
    id: 'promotion-rookie-to-youth',
    type: 'tryout',
    title: '青训考察',
    narrative:
      '你在一次比赛结束后收到一条消息——某俱乐部青训营教练说他看了你的几场比赛，想约你来两天聊聊。地址在隔壁城市，机会就在眼前。',
    stages: ['rookie'],
    difficulty: 2,
    weight: 0,
    choices: [
      {
        id: 'accept-youth-offer',
        label: '立刻动身去试训',
        description: '放下一切，抓住机会。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 11,
          traitBonuses: { mechanical: 2, grinder: 2, clutch: 1 },
        },
        success: {
          narrative: '两天试训打出了近期最好的状态，教练当场拍板签意向书——你正式进入青训营。',
          statChanges: { experience: 2, mentality: 1 },
          stageSet: 'youth',
          tagAdds: ['signed-second-team'],
          fameDelta: 3,
          stressDelta: -1,
        },
        failure: {
          narrative: '旅途颠簸，状态不佳，训练赛表现平平。教练让你回去继续练，说以后还有机会。',
          statChanges: { experience: 1, mentality: -1, money: -1 },
          stressDelta: 1,
        },
      },
      {
        id: 'negotiate-youth-offer',
        label: '先谈条件再去：路费和训练合同',
        description: '冷静争取更好的起点。',
        check: {
          primary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 2, igl: 1 },
        },
        success: {
          narrative: '对方同意报销路费并加了一条保障条款。你以更稳的心态赴约，顺利通过考核。',
          statChanges: { intelligence: 1, experience: 2, money: 1 },
          stageSet: 'youth',
          tagAdds: ['signed-second-team'],
          fameDelta: 2,
          stressDelta: -1,
        },
        failure: {
          narrative: '对方觉得你要价太高，撤回了邀请。这扇门暂时关上了。',
          statChanges: { mentality: -1 },
          stressDelta: 2,
        },
      },
      {
        id: 'decline-youth-offer',
        label: '暂时拒绝：还没准备好',
        description: '拒绝这次邀约，继续在低级别赛打磨，等下次机会。',
        check: { primary: 'experience', dc: 0 },
        success: {
          narrative: '你婉拒了邀请，继续专注在现有赛场。再磨几场，机会还会再来。',
          statChanges: { experience: 1 },
          stressDelta: 0,
        },
        failure: {
          narrative: '你婉拒了邀请，继续专注在现有赛场。再磨几场，机会还会再来。',
          statChanges: { experience: 1 },
          stressDelta: 0,
        },
      },
    ],
  },
  {
    id: 'promotion-youth-to-second',
    type: 'tryout',
    title: '二线合同邀约',
    narrative:
      '联赛结束后，一支二线队的领队在更衣室外等着你。他说队里有个坑位空出来了，问你有没有兴趣签一份正式合同。',
    stages: ['youth'],
    difficulty: 3,
    weight: 0,
    choices: [
      {
        id: 'accept-second-offer',
        label: '签合同，加入二线队',
        description: '正式走上职业化道路。',
        check: {
          primary: 'experience',
          secondary: 'mentality',
          dc: 11,
          traitBonuses: { steady: 2, grinder: 2 },
        },
        success: {
          narrative: '合同签下，你正式成为二线队的一员。新的起点，新的压力，也有新的资源。',
          statChanges: { experience: 2, money: 2 },
          stageSet: 'second',
          tagAdds: ['signed-second-team'],
          fameDelta: 5,
          stressDelta: 1,
        },
        failure: {
          narrative: '入队初期表现欠佳，队内地位不稳，你被挂在合同边缘观察期。',
          statChanges: { experience: 1, mentality: -1 },
          stressDelta: 2,
        },
      },
      {
        id: 'negotiate-second-offer',
        label: '谈薪资和出场时间保证',
        description: '争取更好的合同条款。',
        check: {
          primary: 'intelligence',
          dc: 11,
          traitBonuses: { igl: 2, tactical: 1 },
        },
        success: {
          narrative: '领队稍作思考后同意了你的条件。待遇提了一档，出场时间也有了保障。',
          statChanges: { intelligence: 1, money: 3, experience: 2 },
          stageSet: 'second',
          tagAdds: ['signed-second-team'],
          fameDelta: 4,
          stressDelta: 0,
        },
        failure: {
          narrative: '谈崩了。领队另找了人，这次机会就此错过。',
          statChanges: { mentality: -2 },
          stressDelta: 3,
        },
      },
      {
        id: 'decline-second-offer',
        label: '暂时谢绝，继续积累联赛经验',
        description: '还没准备好二线节奏，先在联赛再打几场。',
        check: { primary: 'experience', dc: 0 },
        success: {
          narrative: '你礼貌拒绝了邀约。领队点点头说"想好了随时联系"。机会是否还在，取决于你接下来的表现。',
          statChanges: { experience: 1 },
          stressDelta: 0,
        },
        failure: {
          narrative: '你礼貌拒绝了邀约。领队点点头说"想好了随时联系"。机会是否还在，取决于你接下来的表现。',
          statChanges: { experience: 1 },
          stressDelta: 0,
        },
      },
    ],
  },
  {
    id: 'promotion-second-to-pro',
    type: 'tryout',
    title: '职业队签约邀请',
    narrative:
      '赛后混采区，一个西装男把名片塞进你手里——某职业俱乐部的经理。他说今天看了你整场比赛，团队有意向把你签下来，明天约在咖啡馆细聊。',
    stages: ['second'],
    difficulty: 4,
    weight: 0,
    choices: [
      {
        id: 'accept-pro-offer',
        label: '明天赴约，直接谈合同',
        description: '正式进入职业体系。',
        check: {
          primary: 'mentality',
          secondary: 'experience',
          dc: 12,
          traitBonuses: { steady: 2, clutch: 2 },
          traitPenalties: { fragile: 1 },
        },
        success: {
          narrative: '谈判顺利，合同当场签下。俱乐部提供专业训练设施和赛程安排——你是职业选手了。',
          statChanges: { experience: 3, money: 3, mentality: 1 },
          stageSet: 'pro',
          fameDelta: 8,
          stressDelta: 1,
        },
        failure: {
          narrative: '谈判桌上你表现得有些紧张，条款谈得不理想，对方暂时搁置了签约意向。',
          statChanges: { experience: 1, mentality: -2 },
          stressDelta: 3,
        },
      },
      {
        id: 'agent-negotiate-pro',
        label: '联系经纪人代理谈判',
        description: '让专业人士介入，争取最优合同。',
        check: {
          primary: 'intelligence',
          dc: 11,
          traitBonuses: { tactical: 2, igl: 1 },
        },
        success: {
          narrative: '经纪人谈下了比预期高 30% 的薪资，还附加了出场时间保障条款。职业生涯开门红。',
          statChanges: { intelligence: 1, money: 5, experience: 2 },
          stageSet: 'pro',
          fameDelta: 7,
          stressDelta: -1,
        },
        failure: {
          narrative: '经纪人拖了太久，对方签了另一个人。这次机会从指缝溜走了。',
          statChanges: { money: -1, mentality: -1 },
          stressDelta: 3,
        },
      },
      {
        id: 'decline-pro-offer',
        label: '婉拒，感觉自己还差一口气',
        description: '先再打几场比赛，确认自己已经准备好。',
        check: { primary: 'experience', dc: 0 },
        success: {
          narrative: '你婉拒了邀约，经理笑着说下半赛季还有机会。继续打出成绩，他们会再来找你的。',
          statChanges: { experience: 1 },
          stressDelta: 0,
        },
        failure: {
          narrative: '你婉拒了邀约，经理笑着说下半赛季还有机会。继续打出成绩，他们会再来找你的。',
          statChanges: { experience: 1 },
          stressDelta: 0,
        },
      },
    ],
  },
  {
    id: 'promotion-pro-to-star',
    type: 'media',
    title: '明星合同与品牌谈判',
    narrative:
      '你的战绩引起了一线俱乐部和顶级赞助商的双重注意。经纪公司发来一份提案：重新签一份顶级合同，同时绑定一个外设品牌代言。你翻开合同第一页，数字让你愣了一下。',
    stages: ['pro'],
    difficulty: 5,
    weight: 0,
    choices: [
      {
        id: 'sign-star-contract',
        label: '签下合同：成为队伍的核心选手',
        description: '正式以明星身份运营，压力和曝光同步暴涨。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 13,
          traitBonuses: { steady: 2, clutch: 2, media: 2 },
          traitPenalties: { fragile: 2 },
        },
        success: {
          narrative: '合同签下，外设代言公告同步发出。你的 ID 出现在官网首页，社交媒体粉丝一夜暴涨。',
          statChanges: { money: 6, intelligence: 2, mentality: 1 },
          stageSet: 'star',
          fameDelta: 15,
          stressDelta: 2,
          tagAdds: ['highlight-clip'],
        },
        failure: {
          narrative: '谈判桌上你表现失常，合同条款没达到预期，对方降低了待遇要求。签是签了，但不是最好的起点。',
          statChanges: { money: 2, mentality: -2 },
          stressDelta: 4,
        },
      },
      {
        id: 'selective-star-contract',
        label: '只签俱乐部合同，放弃代言',
        description: '降低曝光压力，专注比赛本身。',
        check: {
          primary: 'intelligence',
          dc: 11,
          traitBonuses: { steady: 3, tactical: 1 },
        },
        success: {
          narrative: '你专注于技术层面，拒绝过多商业活动。俱乐部尊重你的决定，合同顺利签下。',
          statChanges: { money: 3, experience: 2, mentality: 1 },
          stageSet: 'star',
          fameDelta: 10,
          stressDelta: -1,
        },
        failure: {
          narrative: '俱乐部认为你不够"商业价值"，重新评估了合同等级，条款打了折扣。',
          statChanges: { money: 1, mentality: -1 },
          stressDelta: 2,
        },
      },
      {
        id: 'decline-star-offer',
        label: '再等等：想在国际赛场证明自己再谈',
        description: '继续打顶级赛事，用成绩说话，争取更高起点。',
        check: { primary: 'mentality', dc: 0 },
        success: {
          narrative: '你把合同推迟到了赛季末。"先拿一个成绩"——你心里清楚自己想要什么。',
          statChanges: { mentality: 1 },
          stressDelta: -1,
        },
        failure: {
          narrative: '你把合同推迟到了赛季末。"先拿一个成绩"——你心里清楚自己想要什么。',
          statChanges: { mentality: 1 },
          stressDelta: -1,
        },
      },
    ],
  },
];

export const TRYOUT_EVENTS: EventDef[] = [
  {
    id: 'tryout-invite',
    type: 'tryout',
    title: '二线队的试训邀约',
    narrative:
      '一支二线队的星探私信你：在城市赛里看过你的几场比赛，想让你去参加一次试训，三天吃住自付，第四天打训练赛定去留。',
    stages: ['rookie', 'youth'],
    difficulty: 3,
    requireTags: ['elite-prospect', 'has-open-match-exp'],
    choices: [
      {
        id: 'accept-tryout',
        label: '立刻收拾行李去',
        description: '孤注一掷。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 14,
          traitBonuses: { mechanical: 2, grinder: 2, clutch: 2 },
        },
        success: {
          narrative: '三天的训练赛，你打出近一个月最好的表现，签下意向书。',
          statChanges: { experience: 3, mentality: 2, money: -2 },
          stageDelta: 1,
          tagAdds: ['signed-second-team'],
        },
        failure: {
          narrative: '旅途劳顿，你表现一般，教练让你回去继续练。',
          statChanges: { experience: 1, mentality: -2, money: -2 },
        },
      },
      {
        id: 'negotiate-tryout',
        label: '回邮件争取路费和合约条款',
        description: '冷静谈判。',
        check: {
          primary: 'intelligence',
          dc: 12,
          traitBonuses: { tactical: 2, streamer: 1, media: 1 },
        },
        success: {
          narrative: '对方同意报销路费并加一条保障条款，你以更稳的状态赴约。',
          statChanges: { intelligence: 1, money: 2, experience: 2 },
          stageDelta: 1,
          tagAdds: ['signed-second-team'],
        },
        failure: {
          narrative: '对方觉得你要求太多，直接收回邀请。',
          statChanges: { mentality: -2 },
        },
      },
      {
        id: 'decline-tryout',
        label: '拒绝，先把路人分刷到前 100',
        description: '继续在舒适区。',
        check: {
          primary: 'experience',
          dc: 7,
          traitBonuses: { solo: 2 },
        },
        success: {
          narrative: '你专心打路人，三天后天梯前 100，但机会窗口关上了。',
          statChanges: { experience: 2, agility: 1, mentality: -1 },
        },
        failure: {
          narrative: '你天梯也没打上去，机会又没抓住。',
          statChanges: { mentality: -2 },
        },
      },
    ],
  },
];
