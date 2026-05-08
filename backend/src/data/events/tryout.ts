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
          statChanges: { experience: 1, mentality: -1, money: -10 },
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
          statChanges: { intelligence: 1, experience: 2, money: 10 },
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
          statChanges: { experience: 2, money: 20 },
          stageSet: 'second',
          teamTierSet: 'semi-pro',
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
          statChanges: { intelligence: 1, money: 30, experience: 2 },
          stageSet: 'second',
          teamTierSet: 'semi-pro',
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
          statChanges: { experience: 3, money: 30, mentality: 1 },
          stageSet: 'pro',
          teamTierSet: 'pro',
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
          statChanges: { intelligence: 1, money: 50, experience: 2 },
          stageSet: 'pro',
          teamTierSet: 'pro',
          fameDelta: 7,
          stressDelta: -1,
        },
        failure: {
          narrative: '经纪人拖了太久，对方签了另一个人。这次机会从指缝溜走了。',
          statChanges: { money: -10, mentality: -1 },
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
];

export const TRYOUT_EVENTS: EventDef[] = [
  {
    id: 'tryout-invite',
    type: 'tryout',
    title: '二线队的试训邀约',
    narrative:
      '一支二线队的星探私信你：在城市赛里看过你的几场比赛，想让你去参加一次试训，三天吃住自付，第四天打训练赛定去留。',
    stages: ['youth'],
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
          statChanges: { experience: 3, mentality: 2, money: -20 },
          stageDelta: 1,
          tagAdds: ['signed-second-team'],
        },
        failure: {
          narrative: '旅途劳顿，你表现一般，教练让你回去继续练。',
          statChanges: { experience: 1, mentality: -2, money: -20 },
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
          statChanges: { intelligence: 1, money: 20, experience: 2 },
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
