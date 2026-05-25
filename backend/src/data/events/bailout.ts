import type { EventDef } from '../../types.js';

const ALL_STAGES: EventDef['stages'] = ['rookie', 'youth', 'second', 'pro'];

export const BAILOUT_EVENTS: EventDef[] = [
  {
    id: 'bailout-family-loan',
    type: 'bailout',
    title: '父母的电话',
    narrative:
      '妈妈打来电话，问你最近过得怎么样。你犹豫了一下，还是说了实话。电话那头沉默了很久，然后爸爸接过电话，说："先把日子过下去，别硬撑。"',
    stages: ALL_STAGES,
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-bailout'],
    narrativeMeta: {
      eventId: 'bailout-family-loan',
      playerStance: '被动接受关怀但内心抗拒',
      traitReactions: {
        scapegoat: {
          emphasis: ['电话那头的沉默让你更难受', '你知道这钱背后是担忧不是信任'],
          avoid: ['不要写成家人在施舍', '不要写成你毫不在意'],
        },
        hothead: {
          emphasis: ['想挂断电话但又舍不得', '愤怒于自己为什么要接电话'],
          avoid: ['不要写成对电话那头大吼'],
        },
      },
    },
    choices: [
      {
        id: 'accept-loan',
        label: '接受家里的周转',
        description: '先把这一关撑过去，后面慢慢想办法还回去。',
        check: { primary: 'mentality', dc: 4 },
        success: {
          narrative: '家里给你转来一笔周转金。虽然你知道这钱要记在心里，但至少今晚不用再盯着余额发呆。',
          moneyDelta: 30,
          stressDelta: -4,
          fameDelta: -3,
        },
        failure: {
          narrative: '你嘴上说着"我自己能扛"，但最后还是收下了这笔钱。电话挂断后，你的压力反而更重了。',
          moneyDelta: 20,
          stressDelta: 2,
          fameDelta: -2,
        },
      },
      {
        id: 'refuse-loan',
        isRefusal: true,
        label: '谢谢，我自己能撑过去',
        description: '不想让家里担心，也不想欠这份人情。',
        check: { primary: 'mentality', dc: 8, traitBonuses: { steady: 2, ego: 1 }, traitPenalties: { support: 1, fragile: 1 } },
        success: {
          narrative: '你说了声"没事，我有办法"，然后挂了电话。深吸一口气，没有退路，但也不想用这种方式过这道坎。',
          stressDelta: 2,
          feelDelta: 0.5,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你说了"我没事"，挂了电话，然后盯着账户发呆。这种倔强让你压力更大——你清楚自己根本没有办法。',
          stressDelta: 5,
          feelDelta: -0.5,
        },
      },
    ],
  },
  {
    id: 'bailout-family-gift',
    type: 'bailout',
    title: '家里寄来的红包',
    narrative:
      '一个熟悉的快递到了，里面是家里塞给你的现金和一句手写纸条："先顾好自己，比赛以后再说。"',
    stages: ALL_STAGES,
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-bailout'],
    narrativeMeta: {
      eventId: 'bailout-family-gift',
      emotionTone: '被关怀刺痛自尊',
      traitReactions: {
        scapegoat: {
          emphasis: ['纸条上的字像一面镜子', '你觉得这钱不该由他们来填'],
          avoid: ['绝对禁止写成抱怨家人添乱', '禁止写成心安理得'],
        },
        hothead: {
          emphasis: ['想把红包连同自尊一起扔回去', '愤怒于自己的无能'],
          avoid: ['不要写成对快递员发火'],
        },
        'tactical-mind': {
          emphasis: ['脑子里已经开始计算怎么还这笔情'],
          avoid: ['不要写成冷漠分析'],
        },
      },
    },
    choices: [
      {
        id: 'take-gift',
        label: '收下这份心意',
        description: '先解决眼前的窟窿，这份情记着就行。',
        check: { primary: 'mentality', dc: 3 },
        success: {
          narrative: '你把红包收进口袋，心里却沉了一下。钱能解燃眉之急，但欠下的是一份人情。',
          moneyDelta: 20,
          stressDelta: 3,
        },
        failure: {
          narrative: '你盯着红包看了很久，最后还是收下了。那种难受没消失，只是被你暂时压住了。',
          moneyDelta: 15,
          stressDelta: 4,
          fameDelta: -1,
        },
      },
      {
        id: 'refuse-gift',
        isRefusal: true,
        label: '把红包寄回去',
        description: '再难也不想接受这份援助——靠自己扛过去。',
        check: { primary: 'mentality', dc: 7, traitBonuses: { steady: 1, ego: 1 }, traitPenalties: { support: 1 } },
        success: {
          narrative: '你把红包放回箱子，附了一张纸条："我会想办法的，不用担心。"心里有点轻，有点沉。',
          stressDelta: 1,
          feelDelta: 0.5,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你想寄回去，但最后只是把箱子搁到一边。不好意思退，也不甘心收，两头都不是。这种悬着的感觉更难熬。',
          stressDelta: 4,
          feelDelta: -0.5,
        },
      },
    ],
  },
  {
    id: 'bailout-old-friend',
    type: 'bailout',
    title: '老朋友出手',
    forbidTags: ['low-credit'],
    narrative:
      '一个很久没联系的老朋友突然发消息："我听说你最近有点难。钱不多，先拿着，别跟我客气。"',
    stages: ALL_STAGES,
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-bailout'],
    narrativeMeta: {
      eventId: 'bailout-old-friend',
      playerStance: '被旧识见证落魄',
      traitReactions: {
        scapegoat: {
          emphasis: ['朋友的好意让你更难堪', '宁愿欠银行也不想欠人情'],
          avoid: ['不要写成怀疑朋友动机', '不要写成理所当然'],
        },
        hothead: {
          emphasis: ['愤怒于自己被看到了狼狈的样子', '自尊心在灼烧'],
          avoid: ['不要写成对朋友发火'],
        },
        'tactical-mind': {
          emphasis: ['分析这笔借款对关系的影响'],
          avoid: ['不要写成只算利弊'],
        },
      },
    },
    choices: [
      {
        id: 'borrow-friend',
        label: '记下这份情',
        description: '先渡过难关，以后有机会再还这份人情。',
        check: { primary: 'experience', dc: 5 },
        success: {
          narrative: '你收下了这笔钱，也记下了这次帮忙。老朋友的手伸过来时，你确实没那么孤单了。',
          moneyDelta: 40,
          stressDelta: -2,
          fameDelta: -5,
        },
        failure: {
          narrative: '你本来还想逞强，但对方根本不给你拒绝的机会。钱到了，面子也被按了回去。',
          moneyDelta: 35,
          stressDelta: 1,
          fameDelta: -4,
        },
      },
      {
        id: 'refuse-friend',
        isRefusal: true,
        label: '拒绝，自己的事自己扛',
        description: '不想让朋友看到自己落魄，这种钱不想接。',
        check: { primary: 'mentality', dc: 8, traitBonuses: { ego: 2, solo: 1 }, traitPenalties: { support: 1, selfless: 1 } },
        success: {
          narrative: '你回消息说"没那么严重，谢了"。对方没再追问。心里有些释然，也有些不是滋味——但这是你自己的选择。',
          stressDelta: 2,
          feelDelta: 0.5,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你拒绝了，然后把手机扔到床上。孤立无援的感觉比破产更难受，这份倔强今晚让你付出了代价。',
          stressDelta: 5,
          feelDelta: -1.0,
          tiltDelta: 1,
        },
      },
    ],
  },
  {
    id: 'bailout-team-emergency',
    type: 'bailout',
    title: '经理的应急垫款',
    narrative:
      '训练结束后，战队经理把你叫到办公室。他没有绕弯子："我知道你最近现金流断了，队里先给你一笔应急资金，但接下来三个月工资要打八折。"',
    stages: ['youth', 'second'],
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-team-bailout'],
    choices: [
      {
        id: 'accept-team-emergency',
        label: '接受战队的应急垫款',
        description: '先稳住生活开销，后面用工资慢慢补回来。',
        check: { primary: 'mentality', dc: 4 },
        success: {
          narrative: '你签下临时协议，经理很快把应急金打了过来。至少接下来几周，你能把注意力重新放回训练室。',
          moneyDelta: 30,
          stressDelta: -5,
        },
        failure: {
          narrative: '你接受了垫款，但也感觉自己在队里欠下了一份难说出口的人情。钱到账了，压力却没有完全消失。',
          moneyDelta: 20,
          stressDelta: 5,
        },
      },
      {
        id: 'refuse-team-emergency',
        isRefusal: true,
        label: '谢谢，我自己想办法',
        description: '接受垫款会影响在队里的地位，宁可自己扛。',
        check: { primary: 'mentality', dc: 9, traitBonuses: { steady: 2, ego: 1 }, traitPenalties: { fragile: 1 } },
        success: {
          narrative: '你婉拒了经理，说三个月薪资不需要下调，自己能扛过去。经理点了点头："有困难随时来找我。"这份坚持，也许在队里多了一份说不清的分量。',
          stressDelta: 3,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你拒绝了，经理有点意外，但没有勉强。走出办公室，你不确定自己是不是做了对的决定——钱的问题并没有因为你的倔强消失。',
          stressDelta: 6,
          feelDelta: -0.5,
        },
      },
    ],
  },
  {
    id: 'bailout-team-advance',
    type: 'bailout',
    title: '俱乐部预支薪水',
    narrative:
      '俱乐部财务发来一份预支协议：队伍可以提前支付一部分未来薪水，但接下来十二周你的周薪会临时下调 20%。这是职业体系里的冷冰冰帮助。',
    stages: ['second', 'pro'],
    difficulty: 0,
    weight: 10,
    requireTags: ['needs-team-bailout'],
    choices: [
      {
        id: 'take-salary-advance',
        label: '签下预支协议',
        description: '用未来三个月的部分工资换眼前的周转空间。',
        check: { primary: 'experience', dc: 5 },
        success: {
          narrative: '你看懂了条款，也确认没有隐藏陷阱。预支到账后，账面终于不再刺眼，只是未来几个月要勒紧一点。',
          moneyDelta: 50,
          stressDelta: 10,
        },
        failure: {
          narrative: '协议流程比你想象得更难堪，几层审批之后，款项少了一截。你还是签了，因为眼前没有更好的办法。',
          moneyDelta: 40,
          stressDelta: 15,
        },
      },
      {
        id: 'refuse-salary-advance',
        isRefusal: true,
        label: '不签，不想背这个包袱',
        description: '十二周薪资打折换来的周转，代价太大了。',
        check: { primary: 'mentality', dc: 8, traitBonuses: { steady: 2, grinder: 1 }, traitPenalties: { impulsive: 1 } },
        success: {
          narrative: '你退回了协议，决定自己扛过这关。财务表情有点惊讶，但也没再追。这个决定意味着接下来一段时间要更紧，但薪资不会被动手脚。',
          stressDelta: 3,
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你说不签，但脑子里转了半天也没找到别的出路。最后既后悔拒绝，又拉不下脸回头——悬在这里更难受。',
          stressDelta: 6,
          feelDelta: -0.5,
          tiltDelta: 1,
        },
      },
    ],
  },
  {
    id: 'family-crisis-illness',
    type: 'bailout',
    title: '家人需要手术费',
    narrative:
      '妈妈在电话那头说不出话来。爸爸接过去，声音很轻："你妈确诊了，医生说要尽快手术，手术费大概要 80K。家里实在拿不出来……你看能不能想想办法。"电话挂了，你一个人坐在那里，久久没动。',
    stages: ALL_STAGES,
    difficulty: 1,
    requireTags: ['needs-family-crisis'],
    choices: [
      {
        id: 'accept-crisis',
        label: '我来想办法，给我 4 个回合',
        description: '4 回合内凑够 80K，钱会自动结清，危机解除。凑不够则生涯结束。',
        check: { primary: 'mentality', dc: 6, traitBonuses: { steady: 2 }, traitPenalties: { fragile: 2, volatile: 1 } },
        success: {
          narrative: '你深吸一口气，告诉爸爸："给我一点时间，我想办法。"电话挂了，你盯着账户上那个数字——80K，四个回合。你不知道从哪里开始，但你知道自己必须开始。',
          stressDelta: 5,
        },
        failure: {
          narrative: '你愣了很久，什么也没说出来，只是答应下来。电话挂了，压力像一块石头压在胸口。你不知道从哪里开始，但你知道这是你最难的一关。',
          stressDelta: 10,
          feelDelta: -1.0,
          tiltDelta: 1,
        },
      },
      {
        id: 'abandon-family',
        label: '我没有这个能力——这件事超出了我的范围',
        description: '放弃筹款。危机以另一种方式结束，但烙印永久留下。',
        check: {
          primary: 'mentality',
          dc: 10,
          traitBonuses: { ego: 2, solo: 2, steady: 1 },
          traitPenalties: { selfless: 3, support: 2, fragile: 1 },
        },
        success: {
          narrative: '你放下了电话。你告诉自己：这件事已经超出你的能力范围了。某扇门就这样永远关上了——不是解脱，是一种更沉的东西。职业生涯继续，但某些东西不一样了。',
          feelDelta: -2.0,
          stressDelta: 3,
          tagAdds: ['abandoned-family'],
        },
        failure: {
          narrative: '你试着说服自己这不是你的事，但那个声音一直在脑子里转。你没办法睡着，没办法认真训练，没办法假装什么都没发生过。职业继续了，但你的状态已经不是你的了。',
          feelDelta: -3.0,
          stressDelta: 8,
          tiltDelta: 2,
          fatigueDelta: 20,
          tagAdds: ['abandoned-family', 'guilt-spiral'],
        },
      },
    ],
  },
];
