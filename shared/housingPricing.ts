interface HousingPriceTier {
  id: string;
  moveCost: number;
  weeklyCost: number;
}

interface HousingPriceCity {
  costMultiplier: number;
  propertyValueMultiplier: number;
}

export function housingMoveCost(tier: HousingPriceTier, city?: HousingPriceCity): number {
  const multiplier = tier.id === 'owned-home'
    ? (city?.propertyValueMultiplier ?? 1)
    : (city?.costMultiplier ?? 1);
  return Math.max(0, Math.round(tier.moveCost * multiplier));
}

export function housingWeeklyCost(tier: HousingPriceTier, city?: HousingPriceCity): number {
  return Math.max(0, Math.round(tier.weeklyCost * (city?.costMultiplier ?? 1)));
}
