import type { Buff, Stage } from '../types.js';

export type ShopCategory = 'consumable' | 'service' | 'equipment' | 'social';

export interface ShopEffect {
  fatigueDelta?: number;
  stressDelta?: number;    // raw value, will be applied directly (not ×5)
  feelReset?: boolean;     // reset feel to 0
  moneyDelta?: number;     // negative = costs (already paid separately)
  constitutionDelta?: number;
  mentalityDelta?: number;
  fameDelta?: number;
  buffAdd?: Buff;
  buffRemoveId?: string;
  tagRemove?: string;
  tagAdd?: string;
}

export interface ShopNegativeEvent {
  chance: number;      // 触发概率 0-1
  effect: ShopEffect;
  narrative: string;   // 展示给玩家的文字
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  priceMoney: number;      // cost in money (1 = 1K)
  cooldownRounds: number;  // 0 = no cooldown
  effect: ShopEffect;
  requireFame?: number;
  requireStage?: Stage[];
  negativeEvents?: ShopNegativeEvent[];
}

export const SHOP_ITEMS: ShopItem[] = [
  // ── 消耗品（无冷却）─────────────────────────────────────────────
  {
    id: 'energy-drink',
    name: '能量饮料',
    description: '一罐进去，疲劳立减。',
    category: 'consumable',
    priceMoney: 10, // 10K
    cooldownRounds: 0,
    effect: { fatigueDelta: -20 },
  },
  {
    id: 'meal-kit',
    name: '外卖套餐',
    description: '好好吃一顿，心情和体力都回来了一点。',
    category: 'consumable',
    priceMoney: 10, // 10K (round up from 3K, use 1 pt minimum)
    cooldownRounds: 0,
    effect: { fatigueDelta: -8, mentalityDelta: 0 }, // mentality not directly changeable, just fatigue
  },
  {
    id: 'painkiller',
    name: '止痛药',
    description: '暂时压制身体不适，让手腕撑过今天。',
    category: 'consumable',
    priceMoney: 10, // 10K
    cooldownRounds: 0,
    effect: { fatigueDelta: -15, constitutionDelta: 1 },
  },

  // ── 服务类（冷却 5 回合）─────────────────────────────────────────
  {
    id: 'psych-session',
    name: '心理咨询',
    description: '和运动心理师谈一小时，把压力拆成能处理的碎片。',
    category: 'service',
    priceMoney: 20, // 20K
    cooldownRounds: 5,
    effect: {
      stressDelta: -100,
      buffAdd: {
        id: 'psych-calm',
        label: '心理稳定',
        actionTag: 'all',
        multiplier: 1.15,
        remainingUses: 3,
      },
    },
  },
  {
    id: 'aim-coach',
    name: '枪法私教',
    description: '请教练盯着你把拉枪和定位一点点抠顺，短期涨得快，但练狠了也容易把手感练乱。',
    category: 'service',
    priceMoney: 30,
    cooldownRounds: 4,
    effect: {
      fatigueDelta: -6,
      stressDelta: -8,
      buffAdd: {
        id: 'aim-coached',
        label: '枪法私教',
        actionTag: 'ranked',
        growthKey: 'agility',
        multiplier: 1.18,
        remainingUses: 4,
      },
    },
    negativeEvents: [
      {
        chance: 0.25,
        effect: { fatigueDelta: 12, stressDelta: 6 },
        narrative: '私教把训练强度拉得太满，动作是纠了，但手臂和手腕也跟着酸了一整天。',
      },
      {
        chance: 0.15,
        effect: { feelReset: true, stressDelta: 8 },
        narrative: '你试着硬改发力习惯，结果原本的节奏被打散了，今天的手感一下子冷了下来。',
      },
    ],
  },
  {
    id: 'tactical-review',
    name: '战术复盘',
    description: '拉上分析师和队友把 demo 过一遍，理清思路后训练效率更高。',
    category: 'service',
    priceMoney: 25,
    cooldownRounds: 4,
    effect: {
      stressDelta: -12,
      buffAdd: {
        id: 'tactical-review',
        label: '战术复盘',
        actionTag: 'training',
        growthKey: 'intelligence',
        multiplier: 1.15,
        remainingUses: 4,
      },
    },
    negativeEvents: [
      {
        chance: 0.2,
        effect: { stressDelta: 10 },
        narrative: '信息量一下子灌得太多，越复盘越乱，脑子里全是没解开的细节。',
      },
    ],
  },
  {
    id: 'short-trip',
    name: '短途旅行',
    description: '离开城市两三天，彻底切断与比赛的联系。',
    category: 'service',
    priceMoney: 40, // 40K (was 35K, round to 4pt)
    cooldownRounds: 5,
    effect: {
      stressDelta: -35,
      fatigueDelta: -30,
      feelReset: true,
    },
  },
  {
    id: 'massage-therapy',
    name: '理疗按摩',
    description: '让理疗师把肩颈和前臂彻底放松下来，恢复很扎实，但按得太重也可能适得其反。',
    category: 'service',
    priceMoney: 35,
    cooldownRounds: 6,
    effect: {
      fatigueDelta: -20,
      stressDelta: -15,
    },
    negativeEvents: [
      {
        chance: 0.15,
        effect: { fatigueDelta: 4, stressDelta: 6 },
        narrative: '这次手法有点重，刚按完是松了，但过一会儿反而有种隐隐发酸的迟滞感。',
      },
    ],
  },

  // ── 装备类（外设升级，特殊分支，price 由 peripheralTier 动态决定）──────
  {
    id: 'pro-peripherals',
    name: '游戏外设升级',
    description: '新鼠标、键盘、鼠标垫——好的外设能突破手感上限。价格随等级递增，但不保证一定有效。',
    category: 'equipment',
    priceMoney: 0,     // 占位，实际由 PERIPHERAL_PRICES[peripheralTier] 决定
    cooldownRounds: 0, // 无冷却，由满级检查控制
    effect: {},        // 效果由 applyShopPurchase 特殊分支处理
  },
  {
    id: 'ergo-chair',
    name: '人体工学椅',
    description: '腰不酸了，坐满6小时也不累。',
    category: 'equipment',
    priceMoney: 40, // 40K
    cooldownRounds: 20,
    effect: {
      constitutionDelta: 2,
      buffAdd: {
        id: 'ergo-recovery',
        label: '人体工学',
        actionTag: 'all',
        multiplier: 0.85, // fatigue gains reduced in resolver by buff (not directly, just a Buff tag)
        remainingUses: 15,
      },
    },
  },
  {
    id: 'wrist-brace',
    name: '护腕支撑套',
    description: '给手腕加一层稳定支撑，短期训练更稳，也能缓一口气，但不一定完全适配你的发力习惯。',
    category: 'equipment',
    priceMoney: 30, // 30K
    cooldownRounds: 6,
    effect: {
      fatigueDelta: -12,
      stressDelta: -15,
      buffAdd: {
        id: 'wrist-support',
        label: '腕部支撑',
        actionTag: 'all',
        multiplier: 1.1,
        remainingUses: 5,
      },
    },
    negativeEvents: [
      {
        chance: 0.25,
        effect: { fatigueDelta: 10, stressDelta: 8 },
        narrative: '护腕的支撑角度和你平时的发力习惯不太合拍，刚戴上时反而有些别扭，训练后比预想更累。',
      },
      {
        chance: 0.12,
        effect: { stressDelta: 15 },
        narrative: '材质有些发硬，手腕被勒得不太舒服，你一整天都在调整姿势，心情也跟着烦躁起来。',
      },
    ],
  },

  // ── 社交类（冷却 3 回合）─────────────────────────────────────────
  {
    id: 'team-dinner',
    name: '请队友吃饭',
    description: '轻松的氛围能化解不少积怨，但饭桌上也可能出意外。',
    category: 'social',
    priceMoney: 20, // 20K
    cooldownRounds: 3,
    requireStage: ['youth', 'second', 'pro'],
    effect: {
      stressDelta: -10,
      tagRemove: 'locker-tension',
    },
    negativeEvents: [
      {
        chance: 0.30,
        effect: { stressDelta: 15, tagAdd: 'locker-tension' },
        narrative: '饭桌上队友当场起了争执，气氛比之前更糟，衣柜里的阴云又回来了。',
      },
      {
        chance: 0.20,
        effect: { stressDelta: 8 },
        narrative: '结账时账单比预想贵了不少，这顿饭吃得有些肉痛。',
      },
    ],
  },
  {
    id: 'fan-meetup',
    name: '粉丝见面会',
    description: '当面感受支持者的热情，名气小幅上升，但这也很消耗人，偶尔还会出乱子。',
    category: 'social',
    priceMoney: 30, // 30K
    cooldownRounds: 3,
    requireFame: 20,
    effect: {
      fameDelta: 10,
      stressDelta: 8,
    },
    negativeEvents: [
      {
        chance: 0.30,
        effect: { stressDelta: 20, fatigueDelta: 15 },
        narrative: '现场失控，粉丝蜂拥而上，保安手忙脚乱——你筋疲力尽地回到酒店。',
      },
      {
        chance: 0.20,
        effect: { fameDelta: -5, stressDelta: 10 },
        narrative: '某媒体断章取义，把你的一句话炒成了负面新闻，名气反而受损。',
      },
    ],
  },
  {
    id: 'pr-interview',
    name: '媒体专访',
    description: '安排一次更正式的采访和露出，能带来名气，但说错一句话也可能被无限放大。',
    category: 'social',
    priceMoney: 25,
    cooldownRounds: 4,
    requireStage: ['second', 'pro'],
    effect: {
      fameDelta: 8,
      stressDelta: 5,
    },
    negativeEvents: [
      {
        chance: 0.25,
        effect: { fameDelta: -6, stressDelta: 12 },
        narrative: '采访中的一句话被单独拎了出来，舆论直接拐了个方向，热度有了，但全是压力。',
      },
    ],
  },
  {
    id: 'hire-agent',
    name: '签约经纪人',
    description: '把商务、采访和部分资源协调交给职业经纪人，后续也会逐渐带来新的机会与麻烦。',
    category: 'social',
    priceMoney: 60,
    cooldownRounds: 0,
    requireStage: ['second', 'pro'],
    effect: {
      tagAdd: 'has-agent',
      buffAdd: {
        id: 'agent-support',
        label: '经纪团队',
        actionTag: 'all',
        multiplier: 1.12,
        remainingUses: 9999,
      },
    },
  },
  {
    id: 'fire-agent',
    name: '解雇经纪人',
    description: '结束这段合作，暂时少掉外部安排，也失去经纪团队带来的长期帮助。',
    category: 'social',
    priceMoney: 0,
    cooldownRounds: 0,
    effect: {
      tagRemove: 'has-agent',
      buffRemoveId: 'agent-support',
    },
  },
];

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}
