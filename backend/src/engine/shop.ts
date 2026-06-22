import { getShopItem } from '../data/shop.js';
import type { Buff, GameSession, Player } from '../types.js';
import {
  FEEL_CAP_DEFAULT,
  FEEL_CAP_MAX,
  FEEL_CAP_MIN,
  PERIPHERAL_PRICES,
  PERIPHERAL_SUCCESS_CHANCE,
} from './constants.js';
import { applyMoneyDeltaToStats } from './money.js';
import { clampStats } from './resolver.js';
import { clampFatigue, clampFame, clampFeel, clampStress } from './utils.js';
import {
  applyAutomaticTagCleanup,
  refreshTagExpiry,
} from './tags.js';
import { assertNoActiveEventSequence } from './phase.js';

export interface ApplyShopResult {
  player: Player;
  itemName: string;
  shopNarrative?: string;
  shopNarrativePositive?: boolean;
  shopBuffLabelsAdded?: string[];
  shopBuffLabelsRemoved?: string[];
  shopTagsAdded?: string[];
  shopTagsRemoved?: string[];
}

export function applyShopPurchase(session: GameSession, itemId: string): ApplyShopResult {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const item = getShopItem(itemId);
  if (!item) throw new Error(`未知商品: ${itemId}`);
  const player = session.player;
  const round = player.round;
  const weeklyLimit = item.category === 'consumable' ? 2 : item.category === 'service' ? 1 : undefined;
  const purchaseRecord = (player.weeklyShopPurchases ?? {})[itemId];
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const purchaseCount = purchaseRecord?.year === currentYear && purchaseRecord.week === currentWeek
    ? purchaseRecord.count
    : 0;

  if ((player.restRounds ?? 0) > 0) throw new Error('休养期间不能购买商店物品');
  if ((player.pawnedItemIds ?? []).includes(itemId)) throw new Error('该装备已永久典当，无法重新购买');
  if (item.category === 'equipment' && itemId !== 'pro-peripherals' && (player.ownedItems ?? []).includes(itemId)) {
    throw new Error('已经拥有该装备');
  }
  if (item.requireStage && !item.requireStage.includes(player.stage)) throw new Error('当前阶段无法购买此商品');
  if (item.requireFame !== undefined && (player.fame ?? 0) < item.requireFame) throw new Error(`名气不足，需要 ≥ ${item.requireFame}`);
  const cooldownUntil = (player.shopCooldowns ?? {})[itemId] ?? 0;
  if (cooldownUntil > round) throw new Error(`商品冷却中，还需 ${cooldownUntil - round} 回合`);
  if (weeklyLimit !== undefined && purchaseCount >= weeklyLimit) throw new Error(`本周购买次数已达上限（${purchaseCount}/${weeklyLimit}）`);
  if (player.stats.money < item.priceMoney) throw new Error(`资金不足，需要 ${item.priceMoney}K`);
  if (itemId === 'hire-agent' && player.tags.includes('has-agent')) throw new Error('已经签约经纪人，无需重复购买');
  if (itemId === 'fire-agent' && !player.tags.includes('has-agent')) throw new Error('当前没有经纪人可解约');

  if (itemId === 'pro-peripherals') {
    const tier = player.peripheralTier ?? 0;
    if (tier >= PERIPHERAL_PRICES.length) throw new Error('外设已满级，无法继续升级');
    const price = PERIPHERAL_PRICES[tier]!;
    if (player.stats.money < price) throw new Error(`资金不足，需要 ${price}K`);
    const currentCap = player.feelCap ?? FEEL_CAP_DEFAULT;
    const success = Math.random() < PERIPHERAL_SUCCESS_CHANCE;
    let newFeelCap: number;
    let newTier: number;
    let shopNarrative: string;
    let newBuffs = [...(player.buffs ?? [])];
    if (success) {
      newFeelCap = Math.min(currentCap + 0.5, FEEL_CAP_MAX);
      newTier = tier + 1;
      shopNarrative = `外设升级成功！手感上限提升至 ${newFeelCap}`;
      if (newTier >= PERIPHERAL_PRICES.length) {
        newBuffs = newBuffs.filter((b) => b.id !== 'pro-gear');
        newBuffs.push({
          id: 'pro-gear',
          label: '顶级外设',
          actionTag: 'ranked',
          growthKey: 'agility',
          growthMultiplier: 1.2,
          remainingUses: 9999,
          consumeOn: 'growth',
        });
        shopNarrative += '，外设已达满级，获得固定增益：天梯敏捷成长 +20%';
      }
    } else {
      newFeelCap = Math.max(currentCap - 0.5, FEEL_CAP_MIN);
      newTier = tier;
      shopNarrative = `买到了山寨货，手感上限反而下降至 ${newFeelCap}`;
    }
    const newStats = applyMoneyDeltaToStats(player.stats, -price);
    const nextPlayer: Player = {
      ...player,
      stats: clampStats(newStats),
      feelCap: newFeelCap,
      peripheralTier: newTier,
      buffs: newBuffs,
      ownedItems: success && !(player.ownedItems ?? []).includes(itemId)
        ? [...(player.ownedItems ?? []), itemId]
        : player.ownedItems,
    };
    return { player: nextPlayer, itemName: item.name, shopNarrative, shopNarrativePositive: success };
  }

  if (itemId === 'pro-peripherals') throw new Error('外设升级走了非预期的购买路径');
  const { effect } = item;
  let stats = applyMoneyDeltaToStats(player.stats, -item.priceMoney);
  if (effect.constitutionDelta) {
    stats.constitution = Math.max(0, Math.min(20, stats.constitution + effect.constitutionDelta));
  }
  stats = clampStats(stats);

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  let feel = volatile.feel;
  let tilt = volatile.tilt;
  let fatigue = volatile.fatigue;
  if (effect.fatigueDelta) fatigue = clampFatigue(fatigue + effect.fatigueDelta);
  if (effect.feelReset) feel = clampFeel(0, player.feelCap ?? FEEL_CAP_DEFAULT);
  let stress = player.stress ?? 0;
  let fame = player.fame ?? 0;
  if (effect.stressDelta) stress = clampStress(stress + effect.stressDelta);
  if (effect.fameDelta) fame = clampFame(fame + effect.fameDelta);

  let buffs = [...(player.buffs ?? [])];
  if (effect.buffRemoveId) buffs = buffs.filter((b) => b.id !== effect.buffRemoveId);
  if (effect.buffAdd) {
    buffs = buffs.filter((b) => b.id !== effect.buffAdd!.id);
    buffs.push(effect.buffAdd);
  }

  let tags = [...player.tags];
  if (effect.tagRemove) tags = tags.filter((t) => t !== effect.tagRemove);
  if (effect.tagRemoveAny?.length) {
    const remove = new Set(effect.tagRemoveAny);
    tags = tags.filter((t) => !remove.has(t));
  }
  if (effect.tagAdd && !tags.includes(effect.tagAdd)) tags.push(effect.tagAdd);

  const nextShopCooldowns = { ...(player.shopCooldowns ?? {}) };
  if (item.cooldownRounds > 0) nextShopCooldowns[itemId] = round + item.cooldownRounds;
  const nextWeeklyShopPurchases = { ...(player.weeklyShopPurchases ?? {}) };
  if (weeklyLimit !== undefined) {
    nextWeeklyShopPurchases[itemId] = { year: currentYear, week: currentWeek, count: purchaseCount + 1 };
  }

  let shopNarrative: string | undefined;
  if (item.negativeEvents) {
    for (const neg of item.negativeEvents) {
      if (Math.random() < neg.chance) {
        if (neg.effect.stressDelta) stress = clampStress(stress + neg.effect.stressDelta);
        if (neg.effect.fatigueDelta) fatigue = clampFatigue(fatigue + neg.effect.fatigueDelta);
        if (neg.effect.fameDelta) fame = clampFame(fame + neg.effect.fameDelta);
        if (neg.effect.feelReset) feel = clampFeel(0, player.feelCap ?? FEEL_CAP_DEFAULT);
        if (neg.effect.tagAdd && !tags.includes(neg.effect.tagAdd)) tags.push(neg.effect.tagAdd);
        if (neg.effect.tagRemove) tags = tags.filter((t) => t !== neg.effect.tagRemove);
        shopNarrative = neg.narrative;
        break;
      }
    }
  }

  let tagExpiry = refreshTagExpiry(
    tags,
    player.tagExpiry ?? {},
    round,
    [effect.tagAdd, shopNarrative ? item.negativeEvents?.find((neg) => neg.narrative === shopNarrative)?.effect.tagAdd : undefined]
      .filter((tag): tag is string => Boolean(tag)),
  );

  let nextPlayer: Player = {
    ...player,
    stats,
    volatile: { feel, tilt, fatigue },
    buffs,
    stress,
    fame,
    tags,
    tagExpiry,
    shopCooldowns: nextShopCooldowns,
    weeklyShopPurchases: nextWeeklyShopPurchases,
    ownedItems: item.category === 'equipment' && !(player.ownedItems ?? []).includes(itemId)
      ? [...(player.ownedItems ?? []), itemId]
      : player.ownedItems,
  };
  const shopTagsRemoved: string[] = [
    ...(effect.tagRemove ? [effect.tagRemove] : []),
    ...(effect.tagRemoveAny ?? []).filter((tag) => player.tags.includes(tag)),
  ];
  nextPlayer = applyAutomaticTagCleanup(nextPlayer, shopTagsRemoved);
  tagExpiry = nextPlayer.tagExpiry ?? tagExpiry;

  return {
    player: nextPlayer,
    itemName: item.name,
    shopNarrative:
      shopNarrative
      ?? (itemId === 'hire-agent'
        ? '签约成功：获得长期增益「经纪团队」，并添加标签「has-agent」。后续回合将有概率触发经纪人相关事件。'
        : itemId === 'fire-agent'
          ? '经纪合作已结束：移除长期增益「经纪团队」，并删除标签「has-agent」。'
          : undefined),
    shopNarrativePositive:
      shopNarrative ? false : (itemId === 'hire-agent' || itemId === 'fire-agent' ? true : undefined),
    shopBuffLabelsAdded: effect.buffAdd ? [effect.buffAdd.label] : undefined,
    shopBuffLabelsRemoved: effect.buffRemoveId
      ? (player.buffs ?? []).filter((b) => b.id === effect.buffRemoveId).map((b) => b.label)
      : undefined,
    shopTagsAdded: effect.tagAdd ? [effect.tagAdd] : undefined,
    shopTagsRemoved: shopTagsRemoved.length > 0 ? shopTagsRemoved : undefined,
  };
}

export function pawnItem(
  player: Player,
  itemId: string,
): { success: boolean; message?: string; pawnValue?: number; player?: Player } {
  if (!player.ownedItems.includes(itemId)) {
    return { success: false, message: '未拥有该装备，无法典当' };
  }
  if ((player.pawnedItemIds ?? []).includes(itemId)) {
    return { success: false, message: '该装备已经典当过了' };
  }
  if (itemId !== 'ergo-chair' && itemId !== 'pro-peripherals') {
    return { success: false, message: '只有装备类物品可以典当' };
  }

  let pawnValue: number;
  let nextPlayer: Player;

  if (itemId === 'ergo-chair') {
    pawnValue = Math.floor(35 * 0.6);
    const newStats = clampStats({
      ...applyMoneyDeltaToStats(player.stats, pawnValue),
      constitution: Math.max(0, player.stats.constitution - 2),
    });
    nextPlayer = {
      ...player,
      stats: newStats,
      buffs: (player.buffs ?? []).filter((b) => b.id !== 'ergo-recovery'),
      ownedItems: player.ownedItems.filter((id) => id !== itemId),
      pawnedItemIds: [...(player.pawnedItemIds ?? []), itemId],
    };
  } else {
    const tier = player.peripheralTier ?? 0;
    if (tier <= 0) {
      return { success: false, message: '当前没有可典当的外设升级' };
    }
    let totalValue = 0;
    for (let i = 0; i < tier; i++) {
      totalValue += PERIPHERAL_PRICES[i] ?? 0;
    }
    pawnValue = Math.floor(totalValue * 0.5);
    const newFeelCap = FEEL_CAP_DEFAULT;
    const newStats = clampStats({
      ...applyMoneyDeltaToStats(player.stats, pawnValue),
    });
    nextPlayer = {
      ...player,
      stats: newStats,
      peripheralTier: 0,
      feelCap: newFeelCap,
      volatile: {
        ...(player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 }),
        feel: clampFeel(player.volatile?.feel ?? 0, newFeelCap),
      },
      buffs: (player.buffs ?? []).filter((b) => b.id !== 'pro-gear'),
      ownedItems: player.ownedItems.filter((id) => id !== itemId),
      pawnedItemIds: [...(player.pawnedItemIds ?? []), itemId],
    };
  }

  return { success: true, pawnValue, player: nextPlayer };
}
