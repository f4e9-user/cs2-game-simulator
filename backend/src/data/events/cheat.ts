import type { EventDef } from '../../types.js';

// Cheating detection probability by stage. Slightly higher than betting —
// 反外挂系统比赛事部更严厉.
const DETECT_MACRO = {
  rookie: 0.08,
  youth: 0.12,
  second: 0.20,
  pro: 0.35,
  star: 0.55,
  veteran: 0.45,
};

const DETECT_LIGHT = {
  rookie: 0.03,
  youth: 0.05,
  second: 0.08,
  pro: 0.15,
  star: 0.25,
  veteran: 0.20,
};

const BANNED = {
  narrative:
    'VAC 邮件在训练赛中途弹出，队内账号被拉黑。你的名字被所有赛事主办方拉入禁赛名单。',
  stateDelta: {
    feel: -1.5,
    tilt: 1,
    stress: 50,
  },
  resourceDelta: {
    money: -50,
    fame: -15,
  },
  progression: {
    endRun: true,
    endReason: 'banned_for_cheating',
  },
  tags: {
    add: ['banned'],
  },
};

export const CHEAT_EVENTS: EventDef[] = [
  {
    id: 'cheat-macro-tempt',
    type: 'cheat',
    title: '群里推销的"秒压压枪宏"',
    narrative:
      '老队友偷偷发来一条链接：「这个宏不被反作弊识别，上分利器。」',
    stages: ['second', 'pro'],
    difficulty: 3,
    weight: 0.3,
    choices: [
      {
        id: 'install-macro',
        label: '装上，准备冲一波',
        description: '能直接压稳压枪后坐力，判定是外挂风险。',
        check: {
          primary: 'mentality',
          dc: 0,
          detection: { chanceByStage: DETECT_MACRO },
        },
        success: {
          narrative: '这波没被逮住。排位胜率飙起来，屏幕前你却微微出汗。',
          stateDelta: {
            feel: 1.2,
            stress: 15,
          },
          tags: {
            add: ['cheater'],
          },
        },
        failure: BANNED,
      },
      {
        id: 'install-light',
        label: '只装一个小透视包装成主题皮肤',
        description: '简陋但风险低。',
        check: {
          primary: 'intelligence',
          dc: 0,
          detection: { chanceByStage: DETECT_LIGHT },
        },
        success: {
          narrative: '包装得很隐蔽，反作弊暂时没抓到。但你每把都多一分心虚。',
          stateDelta: {
            feel: 0.6,
            stress: 10,
          },
          tags: {
            add: ['cheater'],
          },
        },
        failure: BANNED,
      },
      {
        id: 'decline-macro',
        label: '删链接 + 举报到群主',
        description: '立即切割。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 2, selfless: 2 },
          traitPenalties: { risky: 2, gambler: 1 },
        },
        success: {
          narrative: '群主把那人踢了。你睡得很踏实，训练反而更专注。',
          stateDelta: {
            feel: 0.5,
            stress: -10,
          },
          tags: {
            add: ['clean-record'],
          },
        },
        failure: {
          narrative: '你没装也没举报，但链接一直留在聊天里。心里那根刺没拔。',
          stateDelta: {
            feel: -0.5,
            stress: 5,
          },
        },
      },
    ],
  },
  {
    id: 'cheat-hwid-spoof',
    type: 'cheat',
    title: '硬件黑客的主动联系',
    narrative:
      '一个陌生人加上你，开门见山：「我能给你一套 VAC 过检套件，封号也能快速回号，只要你分我比赛奖金。」',
    stages: ['second', 'pro'],
    difficulty: 4,
    weight: 0.15,
    choices: [
      {
        id: 'sign-contract',
        label: '答应合作，自己打排位上分',
        description: '收益极高但代价可能是整个生涯。',
        check: {
          primary: 'mentality',
          dc: 0,
          detection: { chanceByStage: DETECT_MACRO },
        },
        success: {
          narrative: '账号起飞，你在平台被称为"天才少年"，顺手进账 40K。你开始忘了自己真实段位是什么。',
          stateDelta: {
            feel: 1.8,
            stress: 25,
          },
          resourceDelta: {
            money: 40,
          },
          tags: {
            add: ['cheater', 'dirty-money'],
          },
        },
        failure: BANNED,
      },
      {
        id: 'refuse-and-report',
        label: '礼貌拒绝并把对话交给俱乐部',
        description: '按合规流程处理。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 9,
          traitBonuses: { steady: 2, tactical: 2, selfless: 2 },
        },
        success: {
          narrative: '俱乐部法务当晚就把人查出来交给反作弊组。你得到一份褒奖信。',
          stateDelta: {
            feel: 0.5,
            stress: -5,
          },
          resourceDelta: {
            fame: 2,
          },
          tags: {
            add: ['clean-record', 'team-trust'],
          },
        },
        failure: {
          narrative: '你举报了，但流程拖延让你觉得这件事没那么重要了。',
          stateDelta: {
            feel: -0.5,
            stress: 5,
          },
        },
      },
      {
        id: 'quiet-block',
        label: '直接删联系，不上报',
        description: '最省事但也最孤立。',
        check: {
          primary: 'mentality',
          dc: 6,
        },
        success: {
          narrative: '你没看他第二眼。过了一周就不记得这件事了。',
          stateDelta: {
            stress: 0,
          },
        },
        failure: {
          narrative: '你删了，但对话截图被对方传出去，少数论坛有人怀疑你"接触过"。',
          stateDelta: {
            feel: -1,
            tilt: 1,
            stress: 10,
          },
          resourceDelta: {
            fame: -2,
          },
        },
      },
    ],
  },
];
