import type { EventDef } from '../../types.js';

export const LIFE_EVENTS: EventDef[] = [
  {
    id: 'life-guilt-haunts',
    type: 'life',
    title: '那件事又浮上来了',
    narrative:
      '深夜，你忽然想起那个电话。你告诉自己当时没有选择，但这个解释越来越难说服你自己。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 0,
    weight: 0.25,
    requireTags: ['abandoned-family'],
    forbidTags: ['guilt-processed'],
    choices: [
      {
        id: 'confront-memory',
        label: '直面这段记忆',
        description: '不压制它，承认它的重量。',
        check: {
          primary: 'mentality',
          dc: 11,
          traitBonuses: { steady: 2, selfless: 1 },
          traitPenalties: { ego: 2, volatile: 1 },
        },
        success: {
          narrative: '你没有试着逃开。你想了很久，那段记忆还是很沉，但你不再用「当时没有办法」来说服自己了。这种诚实让你好受了一点点。',
          stateDelta: {
            stress: -15,
            feel: 0.5,
          },
          tags: {
            add: ['guilt-processed'],
            remove: ['guilt-spiral'],
          },
          dailyGrowth: 'mentality',
        },
        failure: {
          narrative: '你试着直面，结果越想越难受。那天的电话声一遍遍在脑子里转，你整夜没睡，训练的时候也在想这件事。',
          stateDelta: {
            stress: 30,
            feel: -1.0,
            fatigue: 20,
            tilt: 1,
          },
        },
      },
      {
        id: 'suppress-memory',
        label: '压下去，专注眼前',
        description: '有些事想多了只会乱分寸，先把它关掉。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { ego: 2, solo: 1, steady: 1 },
          traitPenalties: { selfless: 1 },
        },
        success: {
          narrative: '你把那扇门关上，回到战术分析里去。今晚没再想，但你知道它还在那里。',
          stateDelta: {
            stress: 5,
          },
          tags: {
            add: ['guilt-processed'],
            remove: ['guilt-spiral'],
          },
        },
        failure: {
          narrative: '你以为自己压住了，但梦里又看到了那个场景。早上起来眼眶是红的，说不清是做梦还是哭了。',
          stateDelta: {
            stress: 20,
            feel: -0.5,
            fatigue: 15,
          },
        },
      },
    ],
  },
  {
    id: 'life-family-call',
    type: 'life',
    title: '凌晨三点的家里来电',
    forbidTags: ['abandoned-family'],
    narrative:
      '训练到凌晨三点，手机震动：家人问你「还在打游戏吗？到底什么时候回家？」',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'honest-talk',
        label: '认真聊一下，解释规划',
        description: '修复关系，但耗费心神。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { steady: 2, tactical: 1 },
        },
        success: {
          narrative: '你把自己的训练计划和目标一条条解释清楚，对方沉默后说了声「注意身体」。',
          stateDelta: {
            feel: 1.4,
          },
        },
        failure: {
          narrative: '话题很快滑向争吵，你挂电话后一整晚没睡好。',
          stateDelta: {
            feel: -1,
            tilt: 1,
          },
        },
      },
      {
        id: 'avoid-call',
        label: '挂掉，明天再说',
        description: '当下省事，后患无穷。',
        check: {
          primary: 'mentality',
          dc: 6,
          traitBonuses: { ego: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '你先稳住当下的情绪，第二天早上才回电话。',
          stateDelta: {
            feel: 0.5,
          },
          tags: {
            add: ['family-strain'],
          },
        },
        failure: {
          narrative: '手机被你静音后你根本没睡着，脑子里全是那句话。',
          stateDelta: {
            feel: -1,
            tilt: 1,
          },
          tags: {
            add: ['family-strain'],
          },
        },
      },
      {
        id: 'send-money',
        label: '直接转一笔钱给家里',
        description: '用物质表达态度。',
        check: {
          primary: 'money',
          dc: 8,
          traitBonuses: { streamer: 1 },
          traitPenalties: { shy: 1 },
        },
        success: {
          narrative: '钱到账的那一刻家里的态度明显软化，但你账户里只剩几个数字。',
          stateDelta: {
            feel: 1,
          },
          resourceDelta: {
            money: -30,
          },
        },
        failure: {
          narrative: '你没那么多钱，硬转让自己更焦虑。',
          stateDelta: {
            feel: -1,
            tilt: 1,
          },
          resourceDelta: {
            money: -20,
          },
        },
      },
    ],
    narrativeMeta: {
      eventId: 'life-family-call',
      emotionTone: '亲情与梦想的拉锯',
      traitReactions: {
        scapegoat: {
          emphasis: ['你没法解释清楚，因为解释就是让他们更担心', '挂了电话后你会怪自己为什么要接'],
          avoid: ['禁止写成完全不在乎家人', '禁止写成家人的关心是负担'],
        },
        hothead: {
          emphasis: ['语气越来越冲，明知道不该这样', '挂了电话后更烦躁'],
          avoid: ['禁止写成对家人大吼大叫', '不要写成摔手机'],
        },
        'tactical-mind': {
          emphasis: ['试图用规划说服家人，但他们听不懂'],
          avoid: ['不要写成书呆子式的说教'],
        },
      },
    },
  },
  {
    id: 'life-wrist-pain',
    type: 'life',
    title: '手腕隐隐作痛',
    narrative:
      '连续训练三周后，你的手腕开始疼。你该怎么办？',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    choices: [
      {
        id: 'see-doctor',
        label: '看医生、下一周休息',
        description: '短期损失，长期收益。',
        check: {
          primary: 'intelligence',
          dc: 8,
          traitBonuses: { steady: 2 },
        },
        success: {
          narrative: '医生让你下周停训。休养后你感觉连点击鼠标都轻松了。',
          stateDelta: {
            feel: 1.1,
          },
          resourceDelta: {
            money: -10,
          },
        },
        failure: {
          narrative: '你听医生嘱咐但忍不住还是偷偷练了，效果打折。',
          stateDelta: {
            feel: -0.5,
          },
        },
      },
      {
        id: 'push-through',
        label: '忍一忍，再硬练两周',
        description: '赌年轻。',
        check: {
          primary: 'mentality',
          secondary: 'agility',
          dc: 13,
          traitBonuses: { grinder: 2, clutch: 2 },
          traitPenalties: { steady: 2 },
        },
        success: {
          narrative: '你挺了过来，状态反而被练到极致。',
          stateDelta: {
            feel: 0.7,
          },
        },
        failure: {
          narrative: '你的手腕彻底撑不住，需要停训一个月。',
          stateDelta: {
            feel: -2.8,
            tilt: 1,
          },
          resourceDelta: {
            money: -20,
          },
          tags: {
            add: ['injured'],
          },
        },
      },
      {
        id: 'buy-gear',
        label: '买人体工学外设 + 康复师',
        description: '花钱消灾。',
        check: {
          primary: 'money',
          dc: 10,
          traitBonuses: { streamer: 1 },
          traitPenalties: { lazy: 1 },
        },
        success: {
          narrative: '设备换了、康复师到位，你的状态迅速回升。',
          stateDelta: {
            feel: 1.1,
          },
          resourceDelta: {
            money: -30,
          },
        },
        failure: {
          narrative: '你买了贵设备，但没坚持康复训练，效果不理想。',
          stateDelta: {
            feel: -0.5,
          },
          resourceDelta: {
            money: -30,
          },
        },
      },
    ],
    narrativeMeta: {
      eventId: 'life-wrist-pain',
      conflictType: '身体-野心',
      traitReactions: {
        scapegoat: {
          emphasis: ['觉得伤病是自己训练不当造成的', '不该让别人知道自己的脆弱'],
          avoid: ['不要写成怨天尤人', '不要写成抱怨命运'],
        },
        hothead: {
          emphasis: ['你想砸键盘，但砸的是自己的身体', '愤怒于身体的背叛'],
          avoid: ['禁止写成怨天尤人', '不要写成迁怒他人'],
        },
        grinder: {
          emphasis: ['即使疼痛也想继续练', '休息比疼痛更让人焦虑'],
          avoid: ['不要写成享受休息'],
        },
      },
    },
  },
];
