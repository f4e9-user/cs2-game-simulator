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

  // ── 装备类（购买后持续）─────────────────────────────────────────
  {
    id: 'pro-peripherals',
    name: '高端外设',
    description: '新鼠标、新键盘、更低的延迟——手感真的有区别。',
    category: 'equipment',
    priceMoney: 5, // 50K
    cooldownRounds: 20, // 购买一次后约 20 回合内不再重复购买
    effect: {
      buffAdd: {
        id: 'pro-gear',
        label: '高端外设',
        actionTag: 'ranked',
        growthKey: 'agility',
        multiplier: 1.2,
        remainingUses: 10,
      },
    },
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
    description: '轻松的氛围能化解不少积怨。',
    category: 'social',
    priceMoney: 2, // 20K (was 15K, use 2pt)
    cooldownRounds: 3,
    requireStage: ['youth', 'second', 'pro', 'star', 'veteran'],
    effect: {
      stressDelta: -10,
      tagRemove: 'locker-tension',
    },
  },
  {
    id: 'fan-meetup',
    name: '粉丝见面会',
    description: '当面感受支持者的热情，名气小幅上升，但这也很消耗人。',
    category: 'social',
    priceMoney: 3, // 30K
    cooldownRounds: 3,
    requireFame: 20,
    effect: {
      fameDelta: 10,
      stressDelta: 8, // draining even though positive
    },
  },
];

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}
