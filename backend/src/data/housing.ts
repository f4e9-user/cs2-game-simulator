import type { HomeFacilityId, HousingCityId, HousingTierId } from '../types.js';

export interface HousingTier {
  id: HousingTierId;
  name: string;
  description: string;
  weeklyCost: number;
  fatigueRecovery: number;
  stressRecovery: number;
  moveCost: number;
}

export interface HomeFacilityDefinition {
  id: HomeFacilityId;
  name: string;
  description: string;
  upgradeCost: number;
  weeklyUpkeep: number;
  fatigueRecovery: number;
  stressRecovery: number;
  maxLevel: number;
}

export interface HousingCityProfile {
  id: HousingCityId;
  name: string;
  description: string;
  costMultiplier: number;
  propertyValueMultiplier: number;
  rentalIncome: number;
  eventWeightMultiplier: number;
}

export const WEEKLY_LIVING_EXPENSE = 1;
export const DEFAULT_HOUSING_CITY_ID: HousingCityId = 'local-city';

export const HOUSING_TIERS: HousingTier[] = [
  {
    id: 'shared-housing',
    name: '宿舍/合租',
    description: '最低支出，环境将就，几乎没有额外恢复。',
    weeklyCost: 1,
    fatigueRecovery: 0,
    stressRecovery: 0,
    moveCost: 0,
  },
  {
    id: 'basic-rental',
    name: '普通租房',
    description: '能稳定睡觉和训练，恢复略好，但每周支出开始变重。',
    weeklyCost: 3,
    fatigueRecovery: 1,
    stressRecovery: 1,
    moveCost: 6,
  },
  {
    id: 'standard-apartment',
    name: '标准公寓',
    description: '环境稳定，休息质量明显更好，是中期现金流选择。',
    weeklyCost: 6,
    fatigueRecovery: 2,
    stressRecovery: 2,
    moveCost: 18,
  },
  {
    id: 'high-end-apartment',
    name: '高端公寓',
    description: '支出很高，但睡眠、隐私和抗压环境都更稳定。',
    weeklyCost: 10,
    fatigueRecovery: 3,
    stressRecovery: 3,
    moveCost: 40,
  },
  {
    id: 'owned-home',
    name: '自有房产',
    description: '一次性成本极高，周期开销低，提供稳定的长期恢复。',
    weeklyCost: 2,
    fatigueRecovery: 3,
    stressRecovery: 2,
    moveCost: 120,
  },
];

export const HOME_FACILITY_DEFINITIONS: HomeFacilityDefinition[] = [
  {
    id: 'training-room',
    name: '训练室',
    description: '一间能稳定热手和做基础枪法训练的小房间。',
    upgradeCost: 12,
    weeklyUpkeep: 1,
    fatigueRecovery: 1,
    stressRecovery: 0,
    maxLevel: 1,
  },
  {
    id: 'review-room',
    name: '复盘室',
    description: '用于看 demo、整理战术笔记和长期复盘的安静空间。',
    upgradeCost: 10,
    weeklyUpkeep: 1,
    fatigueRecovery: 0,
    stressRecovery: 1,
    maxLevel: 1,
  },
  {
    id: 'rest-room',
    name: '休息室',
    description: '把恢复从将就变成稳定习惯，减少长期透支。',
    upgradeCost: 15,
    weeklyUpkeep: 1,
    fatigueRecovery: 1,
    stressRecovery: 1,
    maxLevel: 1,
  },
];

export const HOUSING_CITY_PROFILES: HousingCityProfile[] = [
  {
    id: 'local-city',
    name: '本地城市',
    description: '默认常驻地，住房成本和事件权重保持基准。',
    costMultiplier: 1,
    propertyValueMultiplier: 1,
    rentalIncome: 3,
    eventWeightMultiplier: 1,
  },
  {
    id: 'regional-hub',
    name: '区域中心',
    description: '机会更多，住房和房产价值略高。',
    costMultiplier: 1.2,
    propertyValueMultiplier: 1.2,
    rentalIncome: 4,
    eventWeightMultiplier: 1.15,
  },
  {
    id: 'major-hub',
    name: '核心城市',
    description: '职业机会集中，生活成本显著更高。',
    costMultiplier: 1.5,
    propertyValueMultiplier: 1.5,
    rentalIncome: 5,
    eventWeightMultiplier: 1.35,
  },
  {
    id: 'low-cost-city',
    name: '低成本城市',
    description: '生活成本低，但资源和事件热度也更低。',
    costMultiplier: 0.8,
    propertyValueMultiplier: 0.85,
    rentalIncome: 3,
    eventWeightMultiplier: 0.8,
  },
];

export function getHousingTier(id: HousingTierId): HousingTier | undefined {
  return HOUSING_TIERS.find((tier) => tier.id === id);
}

export function getHomeFacility(id: HomeFacilityId): HomeFacilityDefinition | undefined {
  return HOME_FACILITY_DEFINITIONS.find((facility) => facility.id === id);
}

export function getHousingCityProfile(id: HousingCityId | undefined): HousingCityProfile {
  return HOUSING_CITY_PROFILES.find((city) => city.id === id) ?? HOUSING_CITY_PROFILES[0]!;
}
