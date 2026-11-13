import type { EventDef } from '../../types.js';

export const HOUSING_EVENTS: EventDef[] = [
  {
    id: 'housing-family-visit',
    type: 'life',
    title: '家里忽然来访',
    narrative:
      '周末门铃响起，家里人带着一点水果上门。你发现自己住进了真正的“家”，但这也意味着你要解释自己的生活节奏。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.55,
    requireTags: ['housing-home'],
    choices: [
      {
        id: 'warm-host',
        label: '好好招待一下',
        description: '花点时间安顿家人，顺便把近况说清楚。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 1, support: 1 },
        },
        success: {
          narrative: '一顿饭后气氛缓和了不少，家里人至少知道你不是在瞎混。',
          stateDelta: {
            stress: -8,
            feel: 0.6,
          },
        },
        failure: {
          narrative: '你说得太急，最后还是变成一场不太舒服的解释会。',
          stateDelta: {
            stress: 8,
            feel: -0.4,
          },
        },
      },
      {
        id: 'postpone-visit',
        label: '先把人送走，改天再聊',
        description: '保住当下状态，但关系会有一点距离。',
        check: {
          primary: 'intelligence',
          dc: 6,
        },
        success: {
          narrative: '你把家人安顿好，约了下次再细聊，终于保住了今天的训练计划。',
          stateDelta: {
            fatigue: -2,
          },
        },
        failure: {
          narrative: '你虽然送走了他们，但自己一整天都心不在焉。',
          stateDelta: {
            stress: 6,
          },
        },
      },
    ],
  },
  {
    id: 'housing-renovation-plan',
    type: 'life',
    title: '装修方案摆上桌',
    narrative:
      '你拿着房产中介发来的装修建议单，开始琢磨训练室、复盘室和休息空间到底该怎么分配。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.5,
    requireTags: ['housing-home'],
    choices: [
      {
        id: 'plan-training-room',
        label: '先做训练室',
        description: '把钱投进更稳定的训练环境。',
        check: {
          primary: 'money',
          dc: 8,
        },
        success: {
          narrative: '你把训练区先做了一个雏形，接下来几周的磨合都会更顺手。',
          resourceDelta: {
            money: -12,
          },
          stateDelta: {
            stress: -4,
          },
        },
        failure: {
          narrative: '预算算得太紧，这轮装修只能先搁着。',
          stateDelta: {
            stress: 4,
          },
        },
      },
      {
        id: 'plan-review-room',
        label: '先做复盘室',
        description: '把战术整理空间优先拉起来。',
        check: {
          primary: 'intelligence',
          dc: 8,
        },
        success: {
          narrative: '你把复盘桌和屏幕先安排好，之后想安静研究比赛会容易很多。',
          resourceDelta: {
            money: -10,
          },
          stateDelta: {
            feel: 0.4,
          },
        },
        failure: {
          narrative: '想得很美，真开始算预算的时候就发现哪里都要钱。',
          stateDelta: {
            stress: 5,
          },
        },
      },
    ],
  },
  {
    id: 'housing-neighbor-network',
    type: 'life',
    title: '邻居开始认识你',
    narrative:
      '搬进自有房后，周围邻居开始把你当成“那个打比赛的年轻人”。有的人友善，有的人好奇，也有人嫌你晚上开灯太晚。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.5,
    requireTags: ['housing-home'],
    choices: [
      {
        id: 'small-social',
        label: '简单打个招呼',
        description: '维持一个体面的邻里关系。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { streamer: 1, support: 1 },
        },
        success: {
          narrative: '你和楼下阿姨混了个脸熟，之后收快递也方便多了。',
          stateDelta: {
            stress: -4,
          },
        },
        failure: {
          narrative: '你不知道该怎么寒暄，最后场面有点僵。',
          stateDelta: {
            stress: 4,
          },
        },
      },
      {
        id: 'keep-distance',
        label: '保持距离，别惹麻烦',
        description: '省心，但会少一点生活气。',
        check: {
          primary: 'intelligence',
          dc: 5,
        },
        success: {
          narrative: '你礼貌地保持边界，邻里关系平稳过关。',
          stateDelta: {
            fatigue: -2,
          },
        },
        failure: {
          narrative: '你越回避，越像是在故意摆脸色。',
          stateDelta: {
            stress: 5,
          },
        },
      },
    ],
  },
  {
    id: 'housing-asset-maintenance',
    type: 'life',
    title: '房产保养清单',
    narrative:
      '物业提醒你，房子不是买完就算完，墙面、管线和设备都得长期维护。你得决定要不要为这套资产继续投入。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.45,
    requireTags: ['housing-asset'],
    choices: [
      {
        id: 'maintain-property',
        label: '按清单维护',
        description: '让资产保持稳定状态。',
        check: {
          primary: 'money',
          dc: 7,
        },
        success: {
          narrative: '你把该修的地方都做了，房子状态维持得不错。',
          resourceDelta: {
            money: -8,
          },
          stateDelta: {
            stress: -3,
          },
        },
        failure: {
          narrative: '你省了这笔钱，但心里总觉得哪里不太踏实。',
          stateDelta: {
            stress: 7,
          },
        },
      },
      {
        id: 'defer-maintenance',
        label: '先拖一拖',
        description: '把钱留给当下，但以后还得补。',
        check: {
          primary: 'mentality',
          dc: 6,
        },
        success: {
          narrative: '你把维护顺延了一周，短期现金流总算宽一点。',
          stateDelta: {
            stress: 2,
          },
        },
        failure: {
          narrative: '你越想拖，越担心房子状态继续下滑。',
          stateDelta: {
            stress: 8,
            tilt: 1,
          },
        },
      },
    ],
  },
  {
    id: 'housing-roommate-noise',
    type: 'life',
    title: '室友通宵连麦',
    narrative:
      '合租屋隔音很差，室友凌晨还在连麦开黑。你第二天还有训练，但门外的笑声和键盘声一阵一阵往耳朵里钻。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.7,
    requireTags: ['housing-low'],
    choices: [
      {
        id: 'talk-it-out',
        label: '敲门沟通，约一个安静时间',
        description: '尝试把问题讲清楚，改善之后的居住节奏。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 2, support: 1 },
          traitPenalties: { volatile: 2, shy: 1 },
        },
        success: {
          narrative: '对方虽然尴尬，但答应凌晨后戴耳机。屋子终于安静下来，你补回了一点睡眠。',
          stateDelta: {
            fatigue: -6,
            stress: -4,
          },
        },
        failure: {
          narrative: '沟通变成了互相甩脸色。声音没小多少，你反而更烦。',
          stateDelta: {
            fatigue: 8,
            stress: 10,
            tilt: 1,
          },
        },
      },
      {
        id: 'buy-earplugs',
        label: '买耳塞和遮光帘硬扛',
        description: '花一点钱解决当周睡眠问题。',
        check: {
          primary: 'money',
          dc: 4,
        },
        success: {
          narrative: '便宜的耳塞不完美，但足够让你睡完整觉。',
          stateDelta: {
            fatigue: -4,
            stress: -2,
          },
          resourceDelta: {
            money: -3,
          },
        },
        failure: {
          narrative: '你买了最便宜的一套，效果一般，钱也花出去了。',
          stateDelta: {
            fatigue: 3,
          },
          resourceDelta: {
            money: -2,
          },
        },
      },
    ],
  },
  {
    id: 'housing-internet-outage',
    type: 'life',
    title: '训练夜突然断网',
    narrative:
      '你刚排进训练局，路由器灯突然全灭。房东说线路明天才有人来修，你今晚的训练计划被硬生生截断。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.65,
    requireTags: ['housing-unstable'],
    forbidTags: ['housing-stable'],
    choices: [
      {
        id: 'go-netcafe',
        label: '去附近网吧补训练',
        description: '花钱保住训练节奏，但休息会被压缩。',
        check: {
          primary: 'money',
          secondary: 'constitution',
          dc: 7,
          traitBonuses: { streetwise: 2, grinder: 1 },
        },
        success: {
          narrative: '你找到一台还算顺手的机器，把训练内容补完了，只是回家时已经很晚。',
          stateDelta: {
            feel: 0.5,
            fatigue: 6,
            stress: 2,
          },
          resourceDelta: {
            money: -5,
          },
        },
        failure: {
          narrative: '网吧环境太吵，设备也不顺手。你花了钱，却没练出什么质量。',
          stateDelta: {
            feel: -0.5,
            fatigue: 10,
            stress: 6,
          },
          resourceDelta: {
            money: -4,
          },
        },
      },
      {
        id: 'review-offline-demo',
        label: '改看离线 demo',
        description: '把训练改成复盘，减少损失。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { tactical: 2, igl: 1 },
        },
        success: {
          narrative: '你把几场旧 demo 看完，虽然没打成枪，但理解了一些之前忽略的细节。',
          dailyGrowth: 'intelligence',
          stateDelta: {
            stress: -2,
          },
        },
        failure: {
          narrative: '你越看越烦，脑子一直惦记着没打完的训练局。',
          stateDelta: {
            stress: 8,
            feel: -0.5,
          },
        },
      },
    ],
  },
  {
    id: 'housing-rent-pressure',
    type: 'life',
    title: '房租催缴',
    narrative:
      '房东发来消息，提醒你这周把房租和杂费结清。你看了一眼余额，突然意识到下一场比赛之前现金流并不宽裕。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    weight: 0.55,
    requireTags: ['housing-unstable', 'cash-strapped'],
    forbidTags: ['housing-stable'],
    choices: [
      {
        id: 'pay-now',
        label: '先结清，别留下麻烦',
        description: '现金进一步吃紧，但压力下降。',
        check: {
          primary: 'money',
          dc: 5,
        },
        success: {
          narrative: '账单结清后你至少不用再被消息轰炸，心里轻了一些。',
          stateDelta: {
            stress: -5,
          },
          resourceDelta: {
            money: -5,
          },
        },
        failure: {
          narrative: '你勉强凑了一部分，催缴没有停止，压力也没少多少。',
          stateDelta: {
            stress: 8,
          },
          resourceDelta: {
            money: -3,
          },
        },
      },
      {
        id: 'delay-payment',
        label: '拖一周，先保训练开销',
        description: '保住现金，但信用和心态都会受影响。',
        check: {
          primary: 'mentality',
          dc: 9,
          traitBonuses: { hardship: 2, streetwise: 1 },
          traitPenalties: { affluent: 1 },
        },
        success: {
          narrative: '你和房东约好下周补齐，训练预算暂时保住了。',
          stateDelta: {
            stress: 4,
          },
        },
        failure: {
          narrative: '你答应得很轻松，但接下来几天看到房东消息就心跳加快。',
          stateDelta: {
            stress: 14,
            tilt: 1,
          },
        },
      },
    ],
  },
];
