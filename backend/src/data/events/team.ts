import type { EventDef } from '../../types.js';

export const TEAM_EVENTS: EventDef[] = [
  {
    id: 'team-politics-caller-vs-star',
    type: 'team',
    title: '指挥权和明星位',
    narrative:
      '连败后的复盘会上，队内明星选手觉得你的指挥太死板。教练把话题留给你们自己处理。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    requireTags: ['has-team', 'team-caller-star-conflict-risk'],
    forbidTags: ['team-politics-cd'],
    weight: 3,
    choices: [
      {
        id: 'insist-discipline',
        label: '坚持纪律',
        description: '要求全队按既定体系执行。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 13,
          traitBonuses: { igl: 3, tactical: 2, steady: 1 },
          traitPenalties: { hothead: 2 },
        },
        success: {
          narrative: '你把几个关键残局拆开讲清楚，明星选手没有再顶嘴。',
          effects: {
            teamTrustDelta: 4,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: -2,
          },
          tags: {
            add: ['caller-discipline'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '话说得太硬，复盘室里没人再接话。',
          stateDelta: { stress: 6, tilt: 1 },
          effects: {
            teamTrustDelta: -5,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: -7,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 5 },
          },
        },
      },
      {
        id: 'give-star-freedom',
        label: '给他自由',
        description: '保留体系框架，但给明星位更多临场空间。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 11,
          traitBonuses: { support: 2, steady: 2, tactical: 1 },
        },
        success: {
          narrative: '你们把几个默认和自由发挥的边界说清楚，队伍气氛缓和了。',
          effects: {
            teamTrustDelta: 2,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: 5,
          },
          tags: {
            add: ['caller-star-aligned'],
            remove: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '自由度给出去了，但回合里变成了各打各的。',
          effects: {
            teamTrustDelta: -3,
            teamChemistryDelta: -2,
          },
          tags: {
            add: ['role-confusion'],
            cooldowns: { 'team-politics-cd': 5 },
          },
        },
      },
      {
        id: 'private-review',
        label: '私下复盘',
        description: '先把矛盾从全队会议里拿出来。',
        check: {
          primary: 'mentality',
          dc: 10,
          traitBonuses: { supportive: 2, steady: 2 },
          traitPenalties: { hothead: 1 },
        },
        success: {
          narrative: '你们单独看完几个回合，终于能把问题说成具体选择。',
          effects: {
            teamTrustDelta: 3,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: 3,
          },
          tags: {
            add: ['caller-star-aligned'],
            remove: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '谈话没有吵起来，但彼此都觉得对方没听进去。',
          effects: {
            teamTrustDelta: -1,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: -3,
          },
          tags: {
            cooldowns: { 'team-politics-cd': 4 },
          },
        },
      },
    ],
  },
  {
    id: 'team-politics-star-vs-caller',
    type: 'team',
    title: '明星选手和指挥体系',
    narrative:
      '你近期状态很好，但队内指挥认为你开始脱离体系。训练赛前，所有人都在等你的态度。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    requireTags: ['has-team', 'team-star-caller-conflict-risk'],
    forbidTags: ['team-politics-cd'],
    weight: 3,
    choices: [
      {
        id: 'accept-system',
        label: '接受体系',
        description: '把个人火力放回团队节奏里。',
        check: {
          primary: 'mentality',
          secondary: 'experience',
          dc: 11,
          traitBonuses: { steady: 2, support: 2 },
          traitPenalties: { solo: 2, ego: 1 },
        },
        success: {
          narrative: '你主动补了几次道具和回防，指挥明显松了一口气。',
          effects: {
            teamTrustDelta: 4,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: 3,
          },
          tags: {
            add: ['caller-star-aligned'],
            remove: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '你试着收进体系，但节奏断得很难受。',
          stateDelta: { feel: -0.5 },
          effects: {
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: -2,
          },
          tags: {
            cooldowns: { 'team-politics-cd': 4 },
          },
        },
      },
      {
        id: 'demand-freedom',
        label: '要求自由',
        description: '明确告诉队伍你需要更多主动权。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 13,
          traitBonuses: { mechanical: 2, aimer: 2, clutch: 1 },
          traitPenalties: { support: 2 },
        },
        success: {
          narrative: '你用一场训练赛证明了自己能承担更多主动权。',
          stateDelta: { feel: 1 },
          effects: {
            teamTrustDelta: 1,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: -1,
          },
          tags: {
            add: ['star-freedom'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '你没打出说服力，队内开始质疑你是在抢戏。',
          stateDelta: { stress: 5, tilt: 1 },
          effects: {
            teamTrustDelta: -6,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: -5,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 5 },
          },
        },
      },
      {
        id: 'use-data',
        label: '用数据谈',
        description: '拿训练赛数据讨论哪些回合该给你资源。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 10,
          traitBonuses: { tactical: 2, igl: 1 },
        },
        success: {
          narrative: '数据让争执变成了分工调整，指挥也愿意让出几个回合。',
          effects: {
            teamTrustDelta: 3,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: 4,
          },
          tags: {
            add: ['caller-star-aligned'],
            remove: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '数据看起来像是在挑指挥毛病，会议变得更僵。',
          effects: {
            teamTrustDelta: -2,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: -3,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-politics-cd': 5 },
          },
        },
      },
    ],
  },
  {
    id: 'team-politics-double-responsibility',
    type: 'team',
    title: '又要指挥又要输出',
    narrative:
      '你同时承担指挥和明星位，队伍开始把每个关键回合都压到你身上。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 4,
    requireTags: ['has-team', 'player-star-caller', 'team-influence-conflict-risk'],
    forbidTags: ['team-politics-cd'],
    weight: 2,
    choices: [
      {
        id: 'carry-both',
        label: '两头都扛',
        description: '继续同时承担指挥和关键击杀。',
        check: {
          primary: 'mentality',
          secondary: 'agility',
          dc: 15,
          traitBonuses: { clutch: 2, igl: 2, steady: 1 },
        },
        success: {
          narrative: '你撑住了这段高压期，全队短暂恢复了信心。',
          stateDelta: { feel: 1, stress: 4 },
          effects: {
            teamTrustDelta: 5,
            teamChemistryDelta: 1,
          },
          tags: {
            add: ['team-carries-through-you'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '你越想全都做好，回合里越像在同时打两场比赛。',
          stateDelta: { stress: 10, tilt: 1, fatigue: 8 },
          effects: {
            teamTrustDelta: -4,
            teamChemistryDelta: -2,
          },
          tags: {
            add: ['role-confusion'],
            cooldowns: { 'team-politics-cd': 5 },
          },
        },
      },
      {
        id: 'delegate-calling',
        label: '分出指挥',
        description: '把部分中期决策交给另一个队友。',
        check: {
          primary: 'intelligence',
          secondary: 'mentality',
          dc: 12,
          traitBonuses: { tactical: 2, support: 1 },
        },
        success: {
          narrative: '你把几套中期默认交出去，自己终于能专心处理关键枪位。',
          stateDelta: { stress: -4 },
          effects: {
            teamTrustDelta: 3,
            teamChemistryDelta: 2,
          },
          tags: {
            add: ['shared-calling'],
            remove: ['role-confusion'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '分工没有讲清楚，关键回合反而没人拍板。',
          effects: {
            teamTrustDelta: -3,
            teamChemistryDelta: -3,
          },
          tags: {
            add: ['role-confusion'],
            cooldowns: { 'team-politics-cd': 5 },
          },
        },
      },
      {
        id: 'ask-coach',
        label: '找教练定边界',
        description: '让教练明确哪些回合由你承担。',
        check: {
          primary: 'experience',
          secondary: 'mentality',
          dc: 10,
          traitBonuses: { veteran: 2, steady: 1 },
        },
        success: {
          narrative: '教练把责任边界写进训练计划，队伍不再事事等你救场。',
          effects: {
            teamTrustDelta: 2,
            teamChemistryDelta: 2,
          },
          tags: {
            remove: ['role-confusion', 'locker-tension'],
            cooldowns: { 'team-politics-cd': 6 },
          },
        },
        failure: {
          narrative: '教练给了方向，但队伍执行得很慢，你仍然要临场补洞。',
          stateDelta: { fatigue: 5 },
          effects: {
            teamTrustDelta: -1,
          },
          tags: {
            cooldowns: { 'team-politics-cd': 4 },
          },
        },
      },
    ],
  },
  {
    id: 'team-politics-aligned-resources',
    type: 'team',
    title: '资源分配说清楚了',
    narrative:
      '这周复盘少了火药味。指挥、明星位和教练组终于愿意坐下来，把关键回合的资源分配说清楚。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 2,
    requireTags: ['has-team', 'team-positive-voice-risk'],
    forbidTags: ['team-positive-voice-cd'],
    weight: 2,
    choices: [
      {
        id: 'build-star-package',
        label: '设计明星战术包',
        description: '围绕强点设计几套默认资源。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 10,
          traitBonuses: { tactical: 2, igl: 1 },
        },
        success: {
          narrative: '你们把几个地图的资源优先级写清楚，训练赛执行得很顺。',
          stateDelta: { stress: -3 },
          effects: {
            teamTrustDelta: 3,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: 4,
          },
          tags: {
            add: ['star-system-ready', 'late-round-clarity'],
            remove: ['role-confusion'],
            cooldowns: { 'team-positive-voice-cd': 4 },
          },
        },
        failure: {
          narrative: '方案听上去不错，但细节落到地图上还是有点模糊。',
          effects: {
            teamTrustDelta: -1,
          },
          tags: {
            cooldowns: { 'team-positive-voice-cd': 3 },
          },
        },
      },
      {
        id: 'keep-balanced',
        label: '保持均衡',
        description: '不偏向单点，强调每个人的回合责任。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 9,
          traitBonuses: { support: 2, steady: 1 },
        },
        success: {
          narrative: '队友都清楚自己什么时候要牺牲，什么时候可以主动要资源。',
          effects: {
            teamTrustDelta: 2,
            teamChemistryDelta: 2,
          },
          tags: {
            add: ['caller-star-aligned'],
            cooldowns: { 'team-positive-voice-cd': 4 },
          },
        },
        failure: {
          narrative: '你试图照顾所有人，但最后像是没有重点。',
          effects: {
            teamChemistryDelta: -1,
          },
          tags: {
            add: ['role-confusion'],
            cooldowns: { 'team-positive-voice-cd': 3 },
          },
        },
      },
    ],
  },
  {
    id: 'team-politics-resource-tilt',
    type: 'team',
    title: '默认资源要不要向你倾斜',
    narrative:
      '你已经是队伍主要火力点。下一场前，教练问你是否需要更多默认道具和首杀空间。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    requireTags: ['has-team', 'team-resource-tilt-risk'],
    forbidTags: ['team-resource-tilt-cd'],
    weight: 2,
    choices: [
      {
        id: 'ask-entry-space',
        label: '要更多首杀空间',
        description: '让队伍把默认资源向你的强点倾斜。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 12,
          traitBonuses: { aimer: 2, mechanical: 2, clutch: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '训练赛里你把这些资源转化成了实际突破，队伍愿意继续试。',
          stateDelta: { feel: 1 },
          effects: {
            teamTrustDelta: 1,
          },
          tags: {
            add: ['star-freedom'],
            cooldowns: { 'team-resource-tilt-cd': 6 },
          },
        },
        failure: {
          narrative: '资源给到你手里，但回合没有打开，其他队友开始有点不满。',
          stateDelta: { stress: 5, tilt: 1 },
          effects: {
            teamTrustDelta: -4,
            teamChemistryDelta: -2,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-resource-tilt-cd': 5 },
          },
        },
      },
      {
        id: 'allow-late-freedom',
        label: '只要残局自由',
        description: '默认仍按体系走，关键回合给你更多判断权。',
        check: {
          primary: 'experience',
          secondary: 'intelligence',
          dc: 10,
          traitBonuses: { clutch: 2, tactical: 1, steady: 1 },
        },
        success: {
          narrative: '这个边界更容易被队伍接受，你也不用每回合都抢资源。',
          effects: {
            teamTrustDelta: 2,
            teamChemistryDelta: 1,
          },
          tags: {
            add: ['late-round-clarity'],
            cooldowns: { 'team-resource-tilt-cd': 6 },
          },
        },
        failure: {
          narrative: '关键回合边界没说清，临场还是会撞指令。',
          effects: {
            teamTrustDelta: -2,
          },
          tags: {
            add: ['role-confusion'],
            cooldowns: { 'team-resource-tilt-cd': 5 },
          },
        },
      },
      {
        id: 'decline-extra-resource',
        label: '保持资源均衡',
        description: '先稳定体系，避免队友觉得资源被抢。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { steady: 2, support: 1 },
        },
        success: {
          narrative: '你没有急着要特权，队伍反而更愿意在关键回合相信你。',
          stateDelta: { stress: -2 },
          effects: {
            teamTrustDelta: 2,
            teamChemistryDelta: 1,
          },
          tags: {
            cooldowns: { 'team-resource-tilt-cd': 4 },
          },
        },
        failure: {
          narrative: '你嘴上说均衡，但回合里还是会忍不住主动要资源。',
          effects: {
            teamTrustDelta: -1,
          },
          tags: {
            cooldowns: { 'team-resource-tilt-cd': 4 },
          },
        },
      },
    ],
  },
  {
    id: 'team-politics-lineup-advice',
    type: 'team',
    title: '教练组问你的阵容看法',
    narrative:
      '队伍近期节奏不顺，教练组单独问你：现在的问题更像是角色分工，还是更衣室信任。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    requireTags: ['has-team', 'team-lineup-advice-risk'],
    forbidTags: ['team-lineup-advice-cd'],
    weight: 2,
    choices: [
      {
        id: 'back-current-roster',
        label: '支持现阵容',
        description: '强调先把现有分工练清楚。',
        check: {
          primary: 'mentality',
          secondary: 'experience',
          dc: 10,
          traitBonuses: { steady: 2, support: 1 },
        },
        success: {
          narrative: '你没有把问题推给某个人，教练组也愿意先把责任边界重新写清楚。',
          stateDelta: { stress: -2 },
          effects: {
            teamTrustDelta: 3,
            teamChemistryDelta: 1,
          },
          tags: {
            add: ['coach-neutral', 'late-round-clarity'],
            remove: ['role-confusion'],
            cooldowns: { 'team-lineup-advice-cd': 8 },
          },
        },
        failure: {
          narrative: '你说要相信现阵容，但复盘里拿不出足够具体的理由。',
          effects: {
            teamTrustDelta: -1,
          },
          tags: {
            cooldowns: { 'team-lineup-advice-cd': 6 },
          },
        },
      },
      {
        id: 'adjust-roles',
        label: '建议调角色',
        description: '建议先调整角色分工，而不是谈换人。',
        check: {
          primary: 'intelligence',
          secondary: 'experience',
          dc: 12,
          traitBonuses: { tactical: 2, igl: 1 },
        },
        success: {
          narrative: '你把问题落到几个地图和默认位，教练组决定先试一版新的角色分工。',
          effects: {
            teamTrustDelta: 1,
            teamChemistryDelta: 2,
          },
          tags: {
            add: ['role-clarity', 'coach-backs-star'],
            remove: ['role-confusion'],
            cooldowns: { 'team-lineup-advice-cd': 8 },
          },
        },
        failure: {
          narrative: '角色调整听上去像是在点名队友，会议气氛立刻紧了起来。',
          stateDelta: { stress: 4 },
          effects: {
            teamTrustDelta: -3,
            teamChemistryDelta: -1,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-lineup-advice-cd': 6 },
          },
        },
      },
      {
        id: 'name-problem-role',
        label: '点出问题位',
        description: '高风险地指出某个位置正在拖累体系。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 14,
          traitBonuses: { clutch: 1, tactical: 1 },
          traitPenalties: { support: 1 },
        },
        success: {
          narrative: '你把话说得很硬，但证据足够清楚，教练组决定后续单独处理这个位置。',
          effects: {
            teamTrustDelta: -1,
            teamChemistryDelta: 1,
            targetIdentity: 'problem',
            targetTeammateChemistryDelta: -2,
          },
          tags: {
            add: ['coach-backs-star'],
            cooldowns: { 'team-lineup-advice-cd': 10 },
          },
        },
        failure: {
          narrative: '你像是在甩锅，队友们开始怀疑你只是想替自己争取更多空间。',
          stateDelta: { stress: 6, tilt: 1 },
          effects: {
            teamTrustDelta: -5,
            targetIdentity: 'problem',
            targetTeammateChemistryDelta: -4,
          },
          tags: {
            add: ['locker-tension', 'coach-lost-control'],
            cooldowns: { 'team-lineup-advice-cd': 8 },
          },
        },
      },
    ],
  },
  {
    id: 'team-politics-ordinary-stand',
    type: 'team',
    title: '复盘室里的沉默',
    narrative:
      '指挥和明星队友在复盘室僵住了。你不是队内核心，但所有人都看得出你站在哪边会影响气氛。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 3,
    requireTags: ['has-team', 'team-ordinary-politics-risk'],
    forbidTags: ['team-ordinary-politics-cd'],
    weight: 2,
    choices: [
      {
        id: 'back-caller',
        label: '支持指挥',
        description: '强调先把体系执行好。',
        check: {
          primary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 2, support: 1 },
        },
        success: {
          narrative: '你把问题落到几个具体默认上，会议终于能继续往下走。',
          effects: {
            teamTrustDelta: 2,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: 3,
          },
          tags: {
            cooldowns: { 'team-ordinary-politics-cd': 5 },
          },
        },
        failure: {
          narrative: '明星队友觉得你在偏帮，气氛更冷了。',
          effects: {
            targetIdentity: 'star',
            targetTeammateChemistryDelta: -4,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-ordinary-politics-cd': 5 },
          },
        },
      },
      {
        id: 'back-star',
        label: '支持明星',
        description: '认为队伍需要给强点更多空间。',
        check: {
          primary: 'mentality',
          dc: 10,
          traitBonuses: { steady: 1, clutch: 1 },
        },
        success: {
          narrative: '你没有否定体系，只是帮明星队友把诉求说得更清楚。',
          effects: {
            teamTrustDelta: 1,
            targetIdentity: 'star',
            targetTeammateChemistryDelta: 3,
          },
          tags: {
            add: ['star-freedom'],
            cooldowns: { 'team-ordinary-politics-cd': 5 },
          },
        },
        failure: {
          narrative: '指挥认为你在拱火，复盘提前结束。',
          effects: {
            teamTrustDelta: -3,
            targetIdentity: 'caller',
            targetTeammateChemistryDelta: -4,
          },
          tags: {
            add: ['role-confusion'],
            cooldowns: { 'team-ordinary-politics-cd': 5 },
          },
        },
      },
      {
        id: 'mediate-room',
        label: '居中调停',
        description: '把争论拆成可执行的小问题。',
        check: {
          primary: 'mentality',
          secondary: 'intelligence',
          dc: 13,
          traitBonuses: { support: 2, steady: 2, tactical: 1 },
        },
        success: {
          narrative: '你把双方都拉回具体回合，复盘室终于没有继续升温。',
          stateDelta: { stress: -2 },
          effects: {
            teamTrustDelta: 4,
            teamChemistryDelta: 1,
          },
          tags: {
            remove: ['locker-tension'],
            cooldowns: { 'team-ordinary-politics-cd': 5 },
          },
        },
        failure: {
          narrative: '你试着圆场，但两边都觉得你没有说到重点。',
          stateDelta: { stress: 4 },
          effects: {
            teamTrustDelta: -2,
          },
          tags: {
            cooldowns: { 'team-ordinary-politics-cd': 4 },
          },
        },
      },
      {
        id: 'stay-silent',
        label: '保持沉默',
        description: '不介入核心矛盾，先把训练打完。',
        check: {
          primary: 'mentality',
          dc: 7,
          traitBonuses: { steady: 1 },
        },
        success: {
          narrative: '你没有把火引到自己身上，但问题也没有真正解决。',
          stateDelta: { stress: -1 },
          effects: {
            teamTrustDelta: -1,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-ordinary-politics-cd': 4 },
          },
        },
        failure: {
          narrative: '你越沉默，越像是在默认这场争吵无解。',
          effects: {
            teamTrustDelta: -2,
            teamChemistryDelta: -1,
          },
          tags: {
            add: ['locker-tension'],
            cooldowns: { 'team-ordinary-politics-cd': 4 },
          },
        },
      },
    ],
  },
  {
    id: 'team-role-clash',
    type: 'team',
    title: '主 AWP 位之争',
    narrative:
      '新赛季队内调整：你和队友都想拿主 AWP 位。教练让你们自己先沟通一下。',
    stages: ['youth', 'second', 'pro'],
    difficulty: 2,
    narrativeMeta: {
      eventId: 'team-role-clash',
      playerStance: '集体中的自我位置',
      traitReactions: {
        scapegoat: {
          emphasis: ['默默承担团队失误', '队友犯错时先检讨自己'],
          avoid: ['不要写成完全独立', '不要写成推卸责任'],
        },
        hothead: {
          emphasis: ['对团队决策不满时会爆发', '会议桌上拍桌子'],
          avoid: ['不要写成破坏团队氛围', '不要写成攻击队友'],
        },
        'tactical-mind': {
          emphasis: ['分析团队动态和角色分配', '脑子里有团队关系图'],
          avoid: ['不要写成指手画脚', '不要写成只说不做'],
        },
      },
    },
    choices: [
      {
        id: 'stake-role',
        label: '硬争：秀一局给他看',
        description: '靠比赛表现说话。',
        check: {
          primary: 'agility',
          secondary: 'mentality',
          dc: 12,
          traitBonuses: { awper: 3, mechanical: 2 },
          traitPenalties: { support: 2 },
        },
        success: {
          narrative: '你在训练赛里拿下 32 杀，队长点头。',
          stateDelta: {
            feel: 1.7,
          },
          tags: {
            add: ['main-awper'],
          },
        },
        failure: {
          narrative: '你表现一般，反倒让对方更有底气。',
          stateDelta: {
            feel: -1,
            tilt: 1,
          },
          tags: {
            add: ['locker-tension'],
          },
        },
      },
      {
        id: 'share-role',
        label: '提议：按图分配',
        description: '各自拿自己擅长的地图。',
        check: {
          primary: 'intelligence',
          dc: 10,
          traitBonuses: { tactical: 3, support: 2, steady: 2 },
        },
        success: {
          narrative: '你列了每个人擅长的图，队长觉得合理。队内气氛放松不少。',
          stateDelta: {
            feel: 1.3,
          },
        },
        failure: {
          narrative: '方案看起来合理，但执行起来总是扯皮。',
          stateDelta: {
            feel: -0.5,
          },
        },
      },
      {
        id: 'yield-role',
        label: '退一步：我打步枪位',
        description: '保全队内关系。',
        check: {
          primary: 'mentality',
          dc: 8,
          traitBonuses: { support: 3, steady: 2 },
          traitPenalties: { mechanical: 1 },
        },
        success: {
          narrative: '对方很感激，队内关系紧密了一层。',
          stateDelta: {
            feel: 1,
          },
          tags: {
            add: ['team-trust'],
          },
        },
        failure: {
          narrative: '你心里其实不服，表面平静。',
          stateDelta: {
            feel: -0.5,
          },
          tags: {
            add: ['suppressed-anger'],
          },
        },
      },
    ],
  },
];
