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
  priceMoney: number;      // cost in money stat points (1 point = 10K)
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
    priceMoney: 1, // 10K
    cooldownRounds: 0,
    effect: { fatigueDelta: -20 },
  },
  {
    id: 'meal-kit',
    name: '外卖套餐',
    description: '好好吃一顿，心情和体力都回来了一点。',
    category: 'consumable',
    priceMoney: 1, // 10K (round up from 3K, use 1 pt minimum)
    cooldownRounds: 0,
    effect: { fatigueDelta: -8, mentalityDelta: 0 }, // mentality not directly changeable, just fatigue
  },
  {
    id: 'painkiller',
    name: '止痛药',
    description: '暂时压制身体不适，让手腕撑过今天。',
    category: 'consumable',
    priceMoney: 1, // 10K
    cooldownRounds: 0,
    effect: { fatigueDelta: -15, constitutionDelta: 1 },
  },

  // ── 服务类（冷却 5 回合）─────────────────────────────────────────
  {
    id: 'psych-session',
    name: '心理咨询',
    description: '和运动心理师谈一小时，把压力拆成能处理的碎片。',
    category: 'service',
    priceMoney: 2, // 20K
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
    id: 'short-trip',
    name: '短途旅行',
    description: '离开城市两三天，彻底切断与比赛的联系。',
    category: 'service',
    priceMoney: 4, // 40K (was 35K, round to 4pt)
    cooldownRounds: 5,
    effect: {
      stressDelta: -35,
      fatigueDelta: -30,
      feelReset: true,
    },
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
    priceMoney: 4, // 40K
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

  // ── 社交类（冷却 3 回合）─────────────────────────────────────────
  {
    id: 'team-dinner',
    name: '请队友吃饭',
    description: '轻松的氛围能化解不少积怨，但饭桌上也可能出意外。',
    category: 'social',
    priceMoney: 2, // 20K
    cooldownRounds: 3,
    requireStage: ['youth', 'second', 'pro', 'star', 'veteran'],
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
    priceMoney: 3, // 30K
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
];

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}
