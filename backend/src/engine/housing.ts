import {
  DEFAULT_HOUSING_CITY_ID,
  HOME_FACILITY_DEFINITIONS,
  HOUSING_CITY_PROFILES,
  HOUSING_TIERS,
  WEEKLY_LIVING_EXPENSE,
  getHousingCityProfile,
  getHomeFacility,
  getHousingTier,
} from '../data/housing.js';
import type { HomeAssetState, HomeAssetActionId, HomeFacilityId, HousingCityId, HousingTierId, Player } from '../types.js';
import { applyMoneyTransaction } from './money.js';
import { awayTournamentTravelContext, tournamentTravelEventTags, type TournamentTravelContext } from './travel.js';
import { clampFatigue, clampStress } from './utils.js';

export interface ApplyHousingChangeResult {
  success: boolean;
  message: string;
  player?: Player;
}

interface HousingVolatility {
  label: string;
  fatigueDelta: number;
  stressDelta: number;
  moneyDelta?: number;
}

const HOUSING_VOLATILITY: Partial<Record<HousingTierId, { chance: number; events: HousingVolatility[] }>> = {
  'shared-housing': {
    chance: 0.35,
    events: [
      { label: '室友通宵连麦，睡眠被打断', fatigueDelta: 6, stressDelta: 4 },
      { label: '楼道半夜吵到停不下来', fatigueDelta: 4, stressDelta: 5 },
      { label: '公共设备临时维修，额外花了一点钱', fatigueDelta: 2, stressDelta: 3, moneyDelta: -1 },
    ],
  },
  'basic-rental': {
    chance: 0.2,
    events: [
      { label: '楼上装修，休息质量下降', fatigueDelta: 3, stressDelta: 3 },
      { label: '网络不稳，训练节奏被打断', fatigueDelta: 2, stressDelta: 4 },
    ],
  },
};

function resolveHousingCity(player: Player): HousingCityId {
  return player.housing?.cityId ?? DEFAULT_HOUSING_CITY_ID;
}

function resolveCityProfile(player: Player) {
  return getHousingCityProfile(resolveHousingCity(player));
}

function travelRecoveryProfile(ctx: TournamentTravelContext): { fatigueRecovery: number; stressRecovery: number; benefitScale: number } {
  if (ctx.distance === 'same-region') {
    return { fatigueRecovery: 1, stressRecovery: 1, benefitScale: 0.5 };
  }
  return { fatigueRecovery: 1, stressRecovery: 0, benefitScale: 0 };
}

function tournamentTravelCost(ctx: TournamentTravelContext, tierId: HousingTierId): number {
  const tier = getHousingTier(tierId);
  if (!tier) return 0;
  const tierBase: Record<string, number> = {
    'shared-housing': 2,
    'basic-rental': 3,
    'standard-apartment': 4,
    'high-end-apartment': 6,
    'owned-home': 5,
  };
  const base = tierBase[tier.id] ?? 3;
  const venuePremium = ctx.hasCityVenue ? 1 : 0;
  const distanceMultiplier = ctx.distance === 'same-region' ? 1 : 1.4;
  return Math.max(1, Math.round((base + venuePremium) * distanceMultiplier));
}

function currentHousingAssets(player: Player): HomeAssetState | undefined {
  return player.housing?.assets;
}

function ensureHousingAssets(player: Player): HomeAssetState | undefined {
  if (player.housing?.tier !== 'owned-home') return undefined;
  if (!player.housing.assets) {
    player.housing = {
      ...player.housing,
      assets: {
        facilities: {
          trainingRoom: 0,
          reviewRoom: 0,
          restRoom: 0,
        },
        renovationLevel: 0,
      },
    };
  }
  return player.housing.assets;
}

export function effectiveHousingCost(tierId: HousingTierId, cityId?: HousingCityId): number {
  const tier = getHousingTier(tierId);
  if (!tier) throw new Error(`unknown housing tier: ${tierId}`);
  const city = getHousingCityProfile(cityId);
  return Math.max(0, Math.round(tier.weeklyCost * city.costMultiplier));
}

export function effectiveMoveCost(tierId: HousingTierId, cityId?: HousingCityId): number {
  const tier = getHousingTier(tierId);
  if (!tier) throw new Error(`unknown housing tier: ${tierId}`);
  const city = getHousingCityProfile(cityId);
  return Math.max(0, Math.round(tier.moveCost * city.costMultiplier));
}

export function effectiveHousingEventWeightMultiplier(player: Player): number {
  return resolveCityProfile(player).eventWeightMultiplier;
}

export function housingEventTags(player: Player): string[] {
  const tier = player.housing?.tier ?? 'shared-housing';
  const city = resolveHousingCity(player);
  const travel = awayTournamentTravelContext(player);
  const travelTags = travel ? tournamentTravelEventTags(travel) : [];
  if (tier === 'shared-housing') return ['housing-low', 'housing-unstable', ...travelTags];
  if (tier === 'basic-rental') return ['housing-mid', 'housing-unstable', ...travelTags];
  if (tier === 'owned-home') {
    const tags = ['housing-stable', 'housing-home', 'housing-asset', `housing-city-${city}`];
    const assets = currentHousingAssets(player);
    if (assets?.rentalActive) tags.push('housing-rented-out');
    if ((assets?.mortgagePrincipal ?? 0) > 0) tags.push('housing-mortgaged');
    tags.push(...travelTags);
    return tags;
  }
  return ['housing-stable', `housing-city-${city}`, ...travelTags];
}

function defaultHomeAssets(): HomeAssetState {
  return {
    facilities: {
      trainingRoom: 0,
      reviewRoom: 0,
      restRoom: 0,
    },
    renovationLevel: 0,
  };
}

function facilityKey(id: HomeFacilityId): keyof HomeAssetState['facilities'] {
  if (id === 'training-room') return 'trainingRoom';
  if (id === 'review-room') return 'reviewRoom';
  return 'restRoom';
}

export function processLivingEconomy(
  player: Player,
  effects?: string[],
  options?: { rng?: () => number },
): void {
  const housing = player.housing ?? { tier: 'shared-housing' as const, movedAtRound: player.round ?? 0 };
  const tier = getHousingTier(housing.tier);
  if (!tier) throw new Error(`unknown housing tier: ${housing.tier}`);
  const city = resolveCityProfile(player);
  const travel = awayTournamentTravelContext(player);

  if (!player.housing) player.housing = housing;

  const travelProfile = travel ? travelRecoveryProfile(travel) : null;
  if (travel) {
    const travelCost = tournamentTravelCost(travel, tier.id);
    const travelPaid = applyMoneyTransaction(player, -travelCost);
    if (travelPaid !== 0) {
      effects?.push(`异地赛事临时驻地：${travel.venueLabel} -${Math.abs(travelPaid)}K`);
    }
  } else {
    const livingPaid = applyMoneyTransaction(player, -WEEKLY_LIVING_EXPENSE);
    if (livingPaid !== 0) {
      effects?.push(`生活费支出 ${livingPaid}K`);
    }
  }

  if (!travel) {
    const rentPaid = applyMoneyTransaction(player, -effectiveHousingCost(tier.id, housing.cityId));
    if (rentPaid !== 0) {
      effects?.push(`住宿支出：${tier.name} ${rentPaid}K（${city.name}）`);
    }
  }

  const baseFatigueRecovery = travelProfile?.fatigueRecovery ?? tier.fatigueRecovery;
  const baseStressRecovery = travelProfile?.stressRecovery ?? tier.stressRecovery;
  let fatigueRecovery = baseFatigueRecovery;
  let stressRecovery = baseStressRecovery;
  const assets = ensureHousingAssets(player);
  let hasOwnedHomeAssetSettlement = false;
  if (assets) {
    hasOwnedHomeAssetSettlement = true;
    let assetCost = 0;
    const facilityUpkeep = HOME_FACILITY_DEFINITIONS.reduce((sum, facility) => {
      const level = assets.facilities[facilityKey(facility.id)];
      if (!level) return sum;
      const benefitScale = travel ? (travelProfile?.benefitScale ?? 0) : 1;
      fatigueRecovery += facility.fatigueRecovery * level * benefitScale;
      stressRecovery += facility.stressRecovery * level * benefitScale;
      assetCost += facility.weeklyUpkeep * level;
      return sum + facility.weeklyUpkeep * level;
    }, 0);
    const renovationUpkeep = assets.renovationLevel > 0 ? assets.renovationLevel : 0;
    const rentalIncome = assets.rentalActive ? Math.round(city.rentalIncome * (travel ? (travelProfile?.benefitScale ?? 0) : 1)) : 0;
    if (rentalIncome > 0) {
      applyMoneyTransaction(player, rentalIncome);
      effects?.push(`房产出租收入 +${rentalIncome}K`);
    } else if (travel && assets.rentalActive) {
      effects?.push('异地赛事：房产出租收入暂停');
    }
    const mortgagePayment = assets.mortgagePrincipal ? Math.min(assets.mortgagePrincipal, 4) : 0;
    if (mortgagePayment > 0) {
      applyMoneyTransaction(player, -mortgagePayment);
      effects?.push(`房产抵押还款 -${mortgagePayment}K`);
    }
    const totalUpkeep = facilityUpkeep + renovationUpkeep;
    if (totalUpkeep > 0) {
      applyMoneyTransaction(player, -totalUpkeep);
      effects?.push(`房产设施维护 -${totalUpkeep}K`);
    }
    if (fatigueRecovery > baseFatigueRecovery || stressRecovery > baseStressRecovery) {
      effects?.push(`房产设施加成：疲劳 -${fatigueRecovery - baseFatigueRecovery}，压力 -${stressRecovery - baseStressRecovery}`);
    }
  }
  if (travel && travelProfile) {
    if (!hasOwnedHomeAssetSettlement) {
      effects?.push(`赛事驻地调整：${travel.tournamentName}，常驻住宿恢复由临时驻地替代`);
    } else if (travel.distance === 'cross-region') {
      effects?.push(`赛事驻地调整：${travel.tournamentName}，房产收益暂停`);
    } else {
      effects?.push(`赛事驻地调整：${travel.tournamentName}，房产收益减半`);
    }
  }
  if (fatigueRecovery > 0 || stressRecovery > 0) {
    player.volatile = {
      ...(player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 }),
      fatigue: clampFatigue((player.volatile?.fatigue ?? 0) - fatigueRecovery),
    };
    player.stress = clampStress((player.stress ?? 0) - stressRecovery);
    effects?.push(`${travel ? '临时驻地恢复' : '住宿恢复'}：疲劳 -${fatigueRecovery}，压力 -${stressRecovery}`);
  }
  if (travel) {
    const nextTags = new Set(player.tags ?? []);
    const nextExpiry = { ...(player.tagExpiry ?? {}) };
    for (const tag of tournamentTravelEventTags(travel)) {
      nextTags.add(tag);
      nextExpiry[tag] = Math.max(nextExpiry[tag] ?? 0, (player.round ?? 0) + 2);
    }
    player.tags = [...nextTags];
    player.tagExpiry = nextExpiry;
  }

  const volatility = HOUSING_VOLATILITY[housing.tier];
  const rng = options?.rng ?? Math.random;
  if (!travel && volatility && rng() < volatility.chance) {
    const picked = volatility.events[Math.floor(rng() * volatility.events.length)] ?? volatility.events[0]!;
    player.volatile = {
      ...(player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 }),
      fatigue: clampFatigue((player.volatile?.fatigue ?? 0) + picked.fatigueDelta),
    };
    player.stress = clampStress((player.stress ?? 0) + picked.stressDelta);
    if (picked.moneyDelta) applyMoneyTransaction(player, picked.moneyDelta);
    const moneyText = picked.moneyDelta ? `，资金 ${picked.moneyDelta}K` : '';
    effects?.push(`住宿波动：${picked.label}（疲劳 +${picked.fatigueDelta}，压力 +${picked.stressDelta}${moneyText}）`);
  }
}

export function applyHomeAssetAction(player: Player, actionId: HomeAssetActionId): ApplyHousingChangeResult {
  if (player.housing?.tier !== 'owned-home') {
    return { success: false, message: '只有自有房产才能操作长期资产' };
  }
  const assets = ensureHousingAssets(player) ?? defaultHomeAssets();
  const city = resolveCityProfile(player);
  const tierName = getHousingTier('owned-home')?.name ?? '自有房产';

  if (actionId === 'rent-out') {
    if (assets.rentalActive) return { success: false, message: '房产已经处于出租状态' };
    assets.rentalActive = true;
    player.housing = { ...player.housing, assets };
    return { success: true, message: `已开始出租，后续每周获得 +${city.rentalIncome}K`, player };
  }

  if (actionId === 'stop-rental') {
    if (!assets.rentalActive) return { success: false, message: '房产当前未出租' };
    assets.rentalActive = false;
    player.housing = { ...player.housing, assets };
    return { success: true, message: '已停止出租', player };
  }

  if (actionId === 'mortgage') {
    if ((assets.mortgagePrincipal ?? 0) > 0) return { success: false, message: '房产已经抵押' };
    const mortgageValue = Math.max(30, Math.round(120 * city.propertyValueMultiplier * 0.5));
    assets.mortgagePrincipal = mortgageValue;
    applyMoneyTransaction(player, mortgageValue);
    player.housing = { ...player.housing, assets };
    return { success: true, message: `已抵押${tierName}，到账 +${mortgageValue}K`, player };
  }

  if (actionId === 'renovate') {
    const cost = 20 + (assets.renovationLevel * 2);
    if (player.stats.money < cost) return { success: false, message: `资金不足，装修需要 ${cost}K` };
    applyMoneyTransaction(player, -cost);
    assets.renovationLevel += 1;
    player.housing = { ...player.housing, assets };
    return { success: true, message: `已完成装修，花费 -${cost}K`, player };
  }

  if (actionId === 'sell') {
    const saleValue = Math.max(40, Math.round(120 * city.propertyValueMultiplier * 0.75) + (assets.renovationLevel * 8) + (assets.rentalActive ? 6 : 0));
    applyMoneyTransaction(player, saleValue);
    player.housing = {
      tier: 'basic-rental',
      movedAtRound: player.round ?? 0,
      cityId: player.housing.cityId ?? DEFAULT_HOUSING_CITY_ID,
    };
    return { success: true, message: `已出售${tierName}，到账 +${saleValue}K`, player };
  }

  return { success: false, message: '未知长期资产操作' };
}

export function applyHomeFacilityUpgrade(player: Player, facilityId: HomeFacilityId): ApplyHousingChangeResult {
  if (player.housing?.tier !== 'owned-home') {
    return { success: false, message: '只有自有房产才能升级附属功能' };
  }
  const facility = getHomeFacility(facilityId);
  if (!facility) {
    return { success: false, message: '未知房产设施' };
  }
  const assets = ensureHousingAssets(player) ?? defaultHomeAssets();
  const current = assets.facilities[facilityKey(facilityId)];
  if (current >= facility.maxLevel) {
    return { success: false, message: `${facility.name}已满级` };
  }
  if (player.stats.money < facility.upgradeCost) {
    return { success: false, message: `资金不足，升级${facility.name}需要 ${facility.upgradeCost}K` };
  }

  applyMoneyTransaction(player, -facility.upgradeCost);
  assets.facilities[facilityKey(facilityId)] = current + 1;
  player.housing = {
    ...player.housing,
    assets,
  };

  return {
    success: true,
    message: `已升级${facility.name}，花费 -${facility.upgradeCost}K`,
    player,
  };
}

export function applyHousingChange(player: Player, targetTierId: HousingTierId): ApplyHousingChangeResult {
  const currentHousing = player.housing ?? { tier: 'shared-housing' as const, movedAtRound: player.round ?? 0 };
  if (currentHousing.tier === targetTierId) {
    return { success: false, message: '已经住在该档位' };
  }

  const target = getHousingTier(targetTierId);
  if (!target) {
    return { success: false, message: '未知住宿档位' };
  }
  if (player.stats.money < target.moveCost) {
    return { success: false, message: `资金不足，搬家需要 ${target.moveCost}K` };
  }

  applyMoneyTransaction(player, -target.moveCost);
  player.housing = {
    tier: target.id,
    movedAtRound: player.round ?? 0,
    cityId: player.housing?.cityId ?? DEFAULT_HOUSING_CITY_ID,
    assets: target.id === 'owned-home' ? defaultHomeAssets() : undefined,
  };

  return {
    success: true,
    message: `已搬入${target.name}，搬家成本 -${target.moveCost}K`,
    player,
  };
}

export { HOUSING_TIERS, WEEKLY_LIVING_EXPENSE, HOME_FACILITY_DEFINITIONS, HOUSING_CITY_PROFILES };
