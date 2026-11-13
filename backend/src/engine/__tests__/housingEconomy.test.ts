import { describe, expect, it } from 'vitest';
import { getEventById } from '../../data/events/index.js';
import { initPlayer } from '../player.js';
import { MONEY_MAX } from '../constants.js';
import {
  applyHomeFacilityUpgrade,
  applyHomeAssetAction,
  applyHousingChange,
  effectiveHousingCost,
  effectiveMoveCost,
  housingEventTags,
  processLivingEconomy,
} from '../housing.js';
import { processRecoverySystems } from '../recovery.js';

function createHomeOwner(money: number, mortgagePrincipal?: number) {
  const player = initPlayer({
    name: 'HomeSaleTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  player.stats.money = money;
  player.housing = {
    tier: 'owned-home',
    movedAtRound: 0,
    cityId: 'local-city',
    assets: {
      facilities: { trainingRoom: 0, reviewRoom: 0, restRoom: 0 },
      renovationLevel: 0,
      mortgagePrincipal,
    },
  };
  return player;
}

describe('housing economy', () => {
  it('initializes rookies in shared housing', () => {
    const player = initPlayer({
      name: 'HousingTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });

    expect(player.housing?.tier).toBe('shared-housing');
  });

  it('deducts weekly living expenses and shared housing rent', () => {
    const player = initPlayer({
      name: 'HousingTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;
    player.volatile.fatigue = 20;
    player.stress = 10;
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(18);
    expect(player.volatile.fatigue).toBe(20);
    expect(player.stress).toBe(10);
    expect(effects).toEqual(expect.arrayContaining([
      '生活费支出 -1K',
      '住宿支出：宿舍/合租 -1K（本地城市）',
    ]));
  });

  it('applies higher housing recovery modifiers after weekly costs', () => {
    const player = initPlayer({
      name: 'ApartmentTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = { tier: 'standard-apartment', movedAtRound: 1 };
    player.stats.money = 20;
    player.volatile.fatigue = 10;
    player.stress = 5;
    const effects: string[] = [];

    processLivingEconomy(player, effects);

    expect(player.stats.money).toBe(13);
    expect(player.volatile.fatigue).toBe(8);
    expect(player.stress).toBe(3);
    expect(effects).toContain('住宿恢复：疲劳 -2，压力 -2');
  });

  it('charges a moving cost when switching housing tiers', () => {
    const player = initPlayer({
      name: 'MoveTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;

    const result = applyHousingChange(player, 'basic-rental');

    expect(result.success).toBe(true);
    expect(result.player?.housing?.tier).toBe('basic-rental');
    expect(result.player?.stats.money).toBe(14);
    expect(result.message).toContain('搬家成本 -6K');
  });

  it('rejects switching to the current housing tier', () => {
    const player = initPlayer({
      name: 'MoveTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });

    expect(applyHousingChange(player, 'shared-housing')).toEqual({
      success: false,
      message: '已经住在该档位',
    });
  });

  it('does not charge weekly living costs during bailout-only recovery', () => {
    const player = initPlayer({
      name: 'BailoutTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;

    processRecoverySystems(player, 'bailout-family');

    expect(player.stats.money).toBe(20);
  });

  it('applies lightweight housing volatility to low-tier housing weekly logs', () => {
    const player = initPlayer({
      name: 'NoiseTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;
    player.volatile.fatigue = 10;
    player.stress = 10;
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0 });

    expect(player.volatile.fatigue).toBeGreaterThan(10);
    expect(player.stress).toBeGreaterThan(10);
    expect(effects.some((effect) => effect.startsWith('住宿波动：'))).toBe(true);
  });

  it('exposes housing event tags only for low and mid tier housing', () => {
    const player = initPlayer({
      name: 'HousingEventTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });

    player.housing = { tier: 'shared-housing', movedAtRound: 0 };
    expect(housingEventTags(player)).toEqual(expect.arrayContaining(['housing-low', 'housing-unstable']));

    player.housing = { tier: 'basic-rental', movedAtRound: 0 };
    expect(housingEventTags(player)).toEqual(expect.arrayContaining(['housing-mid', 'housing-unstable']));

    player.housing = { tier: 'standard-apartment', movedAtRound: 0 };
    expect(housingEventTags(player)).toEqual(expect.arrayContaining(['housing-stable']));
    expect(housingEventTags(player)).not.toEqual(expect.arrayContaining(['housing-low', 'housing-mid']));

    const roommateNoise = getEventById('housing-roommate-noise');
    const internetOutage = getEventById('housing-internet-outage');
    expect(roommateNoise?.requireTags).toContain('housing-low');
    expect(internetOutage?.requireTags).toContain('housing-unstable');
    expect(internetOutage?.forbidTags).toContain('housing-stable');
  });

  it('treats owned home as a managed property asset', () => {
    const player = initPlayer({
      name: 'HomeOwner',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = { tier: 'owned-home', movedAtRound: 4 };
    player.stats.money = 50;

    expect(housingEventTags(player)).toEqual(expect.arrayContaining(['housing-home', 'housing-asset']));

    const upgrade = applyHomeFacilityUpgrade(player, 'training-room');

    expect(upgrade.success).toBe(true);
    expect(upgrade.player?.stats.money).toBe(38);
    expect(upgrade.player?.housing?.assets?.facilities.trainingRoom).toBe(1);
    expect(upgrade.message).toContain('训练室');
  });

  it('applies owned home facility upkeep and stable recovery during living economy settlement', () => {
    const player = initPlayer({
      name: 'HomeRecovery',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = {
      tier: 'owned-home',
      movedAtRound: 4,
      assets: {
        facilities: {
          trainingRoom: 1,
          reviewRoom: 1,
          restRoom: 1,
        },
        renovationLevel: 0,
      },
    };
    player.stats.money = 30;
    player.volatile.fatigue = 20;
    player.stress = 20;
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(24);
    expect(player.volatile.fatigue).toBe(15);
    expect(player.stress).toBe(16);
    expect(effects).toContain('房产设施维护 -3K');
    expect(effects).toContain('房产设施加成：疲劳 -2，压力 -2');
  });

  it('registers owned-home identity asset events', () => {
    expect(getEventById('housing-family-visit')?.requireTags).toContain('housing-home');
    expect(getEventById('housing-renovation-plan')?.requireTags).toContain('housing-home');
    expect(getEventById('housing-neighbor-network')?.requireTags).toContain('housing-home');
    expect(getEventById('housing-asset-maintenance')?.requireTags).toContain('housing-asset');
  });

  it('applies city price bands to rent and moving costs', () => {
    const player = initPlayer({
      name: 'CityCost',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = { tier: 'standard-apartment', movedAtRound: 0, cityId: 'major-hub' };
    player.stats.money = 30;
    const effects: string[] = [];

    expect(effectiveHousingCost('standard-apartment', 'major-hub')).toBe(9);
    expect(effectiveMoveCost('basic-rental', 'major-hub')).toBe(9);

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(20);
    expect(effects).toContain('住宿支出：标准公寓 -9K（核心城市）');
  });

  const cityPrices = [
    { cityId: 'local-city', purchase: 120, mortgage: 60, sale: 90, rentalMove: 6 },
    { cityId: 'regional-hub', purchase: 144, mortgage: 72, sale: 108, rentalMove: 7 },
    { cityId: 'major-hub', purchase: 180, mortgage: 90, sale: 135, rentalMove: 9 },
    { cityId: 'low-cost-city', purchase: 102, mortgage: 51, sale: 77, rentalMove: 5 },
  ] as const;

  describe.each(cityPrices)('housing prices in $cityId', ({ cityId, purchase, mortgage, sale, rentalMove }) => {
    it.each([false, true])('uses the city purchase price for two sale cycles (mortgaged: %s)', (mortgaged) => {
      const player = createHomeOwner(600);
      player.housing = { tier: 'basic-rental', movedAtRound: 0, cityId };
      expect(effectiveMoveCost('owned-home', cityId)).toBe(purchase);

      for (let cycle = 1; cycle <= 2; cycle += 1) {
        const balanceBefore = player.stats.money;
        const bought = applyHousingChange(player, 'owned-home');
        expect(bought.success).toBe(true);
        expect(player.stats.money).toBe(balanceBefore - purchase);
        expect(bought.message).toContain(`搬家成本 -${purchase}K`);
        if (mortgaged) {
          expect(applyHomeAssetAction(player, 'mortgage').success).toBe(true);
          expect(player.housing?.assets?.mortgagePrincipal).toBe(mortgage);
          expect(player.stats.money).toBe(balanceBefore - purchase + mortgage);
        }
        const sold = applyHomeAssetAction(player, 'sell');
        expect(sold.success).toBe(true);
        expect(sold.message).toContain(`售价 ${sale}K`);
        expect(player.stats.money).toBe(600 - cycle * (purchase - sale));
        expect(player.housing?.assets).toBeUndefined();
      }
    });

    it('checks affordability against the same city purchase price that it charges', () => {
      const player = createHomeOwner(purchase - 1);
      player.housing = { tier: 'basic-rental', movedAtRound: 0, cityId };
      const before = structuredClone(player);

      const rejected = applyHousingChange(player, 'owned-home');

      expect(rejected.success).toBe(false);
      expect(rejected.message).toContain(`${purchase}K`);
      expect(player).toEqual(before);
      player.stats.money = purchase;
      expect(applyHousingChange(player, 'owned-home').success).toBe(true);
      expect(player.stats.money).toBe(0);
    });

    it('charges city-adjusted moving costs for rental housing', () => {
      const player = createHomeOwner(20);
      player.housing = { tier: 'shared-housing', movedAtRound: 0, cityId };

      const result = applyHousingChange(player, 'basic-rental');

      expect(result.success).toBe(true);
      expect(player.stats.money).toBe(20 - rentalMove);
      expect(result.message).toContain(`搬家成本 -${rentalMove}K`);
    });
  });

  it('supports owned-home rental, mortgage, sale, and renovation actions', () => {
    const player = initPlayer({
      name: 'AssetOps',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = {
      tier: 'owned-home',
      movedAtRound: 0,
      cityId: 'regional-hub',
      assets: {
        facilities: { trainingRoom: 0, reviewRoom: 0, restRoom: 0 },
        renovationLevel: 0,
      },
    };
    player.stats.money = 50;

    const rentOut = applyHomeAssetAction(player, 'rent-out');
    expect(rentOut.success).toBe(true);
    expect(player.housing?.assets?.rentalActive).toBe(true);

    const mortgage = applyHomeAssetAction(player, 'mortgage');
    expect(mortgage.success).toBe(true);
    expect(player.stats.money).toBe(122);
    expect(player.housing?.assets?.mortgagePrincipal).toBe(72);

    const renovate = applyHomeAssetAction(player, 'renovate');
    expect(renovate.success).toBe(true);
    expect(player.stats.money).toBe(102);
    expect(player.housing?.assets?.renovationLevel).toBe(1);

    const sell = applyHomeAssetAction(player, 'sell');
    expect(sell.success).toBe(true);
    expect(player.housing?.tier).toBe('basic-rental');
    expect(player.housing?.cityId).toBe('regional-hub');
    expect(player.housing?.assets).toBeUndefined();
    expect(player.stats.money).toBe(152);
    expect(sell.message).toContain('售价 122K');
    expect(sell.message).toContain('清偿抵押 72K');
    expect(sell.message).toContain('净入账 +50K');
  });

  it('credits the full sale price when there is no mortgage', () => {
    const player = createHomeOwner(10);

    const result = applyHomeAssetAction(player, 'sell');

    expect(result.success).toBe(true);
    expect(player.stats.money).toBe(100);
    expect(result.message).toContain('售价 90K');
    expect(result.message).toContain('清偿抵押 0K');
    expect(result.message).toContain('净入账 +90K');
  });

  it('settles the outstanding mortgage before crediting sale proceeds', () => {
    const player = createHomeOwner(100, 60);
    player.round = 7;

    const result = applyHomeAssetAction(player, 'sell');

    expect(result.success).toBe(true);
    expect(player.stats.money).toBe(130);
    expect(player.housing).toEqual({ tier: 'basic-rental', movedAtRound: 7, cityId: 'local-city' });
    expect(result.message).toContain('售价 90K');
    expect(result.message).toContain('清偿抵押 60K');
    expect(result.message).toContain('净入账 +30K');
  });

  it.each([
    [MONEY_MAX - 50, MONEY_MAX - 20, 30],
    [MONEY_MAX - 10, MONEY_MAX, 10],
  ])('settles a sale against the balance limit from %iK', (balance, expectedBalance, credited) => {
    const player = createHomeOwner(balance, 60);

    const result = applyHomeAssetAction(player, 'sell');

    expect(result.success).toBe(true);
    expect(player.stats.money).toBe(expectedBalance);
    expect(result.message).toContain('清偿抵押 60K');
    expect(result.message).toContain(`净入账 +${credited}K`);
    if (credited < 30) expect(result.message).toContain('资金上限');
  });

  it('preserves money, property, and debt when sale proceeds cannot cover the mortgage', () => {
    const player = createHomeOwner(10, 140);
    player.housing!.assets!.facilities = { trainingRoom: 2, reviewRoom: 1, restRoom: 1 };
    player.housing!.assets!.renovationLevel = 1;
    player.housing!.assets!.rentalActive = true;
    const before = structuredClone(player);

    const result = applyHomeAssetAction(player, 'sell');

    expect(result.success).toBe(false);
    expect(result.message).toContain('资金不足');
    expect(result.message).toContain('36K');
    expect(player).toEqual(before);
  });

  it('uses available cash to fully settle mortgage debt above the sale price', () => {
    const player = createHomeOwner(30, 120);

    const result = applyHomeAssetAction(player, 'sell');

    expect(result.success).toBe(true);
    expect(player.stats.money).toBe(0);
    expect(player.housing?.tier).toBe('basic-rental');
    expect(player.housing?.assets).toBeUndefined();
    expect(result.message).toContain('清偿抵押 120K');
    expect(result.message).toContain('净入账 -30K');
  });

  it('does not create money across repeated buy, mortgage, and sale cycles', () => {
    const player = createHomeOwner(240);
    player.housing = { tier: 'basic-rental', movedAtRound: 0, cityId: 'local-city' };

    for (const expectedBalance of [210, 180]) {
      expect(applyHousingChange(player, 'owned-home').success).toBe(true);
      expect(applyHomeAssetAction(player, 'mortgage').success).toBe(true);
      expect(player.housing?.assets?.mortgagePrincipal).toBe(60);
      expect(applyHomeAssetAction(player, 'sell').success).toBe(true);
      expect(player.stats.money).toBe(expectedBalance);
      expect(player.housing?.assets).toBeUndefined();
    }
  });

  it.each(['shared-housing', 'basic-rental', 'standard-apartment', 'high-end-apartment'] as const)(
    'prevents discarding a mortgaged property by moving to %s',
    (targetTier) => {
      const player = createHomeOwner(200, 60);
      player.housing!.assets!.facilities.trainingRoom = 1;
      player.housing!.assets!.rentalActive = true;
      const before = structuredClone(player);

      const result = applyHousingChange(player, targetTier);

      expect(result.success).toBe(false);
      expect(result.message).toContain('抵押');
      expect(result.message).toContain('出售');
      expect(player).toEqual(before);
    },
  );

  it('still allows moving away from an unencumbered property', () => {
    const player = createHomeOwner(20);

    const result = applyHousingChange(player, 'basic-rental');

    expect(result.success).toBe(true);
    expect(player.stats.money).toBe(14);
    expect(player.housing?.tier).toBe('basic-rental');
  });

  it('settles owned-home rental income and mortgage payment each week', () => {
    const player = initPlayer({
      name: 'AssetSettlement',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = {
      tier: 'owned-home',
      movedAtRound: 0,
      cityId: 'low-cost-city',
      assets: {
        facilities: { trainingRoom: 0, reviewRoom: 0, restRoom: 0 },
        renovationLevel: 1,
        rentalActive: true,
        mortgagePrincipal: 60,
      },
    };
    player.stats.money = 30;
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(25);
    expect(effects).toContain('房产出租收入 +3K');
    expect(effects).toContain('房产抵押还款 -4K');
    expect(player.housing?.assets?.mortgagePrincipal).toBe(56);
    expect(housingEventTags(player)).toEqual(expect.arrayContaining(['housing-city-low-cost-city', 'housing-rented-out', 'housing-mortgaged']));
  });

  it('reduces mortgage principal across weeks and stops charging after full repayment', () => {
    const player = createHomeOwner(50, 6);
    const firstWeek: string[] = [];
    const secondWeek: string[] = [];
    const thirdWeek: string[] = [];

    processLivingEconomy(player, firstWeek, { rng: () => 0.99 });
    expect(player.stats.money).toBe(43);
    expect(player.housing?.assets?.mortgagePrincipal).toBe(2);
    expect(firstWeek).toContain('房产抵押还款 -4K');

    processLivingEconomy(player, secondWeek, { rng: () => 0.99 });
    expect(player.stats.money).toBe(38);
    expect(player.housing?.assets?.mortgagePrincipal).toBe(0);
    expect(secondWeek).toContain('房产抵押还款 -2K');
    expect(secondWeek).toContain('房产抵押已还清');
    expect(housingEventTags(player)).not.toContain('housing-mortgaged');

    processLivingEconomy(player, thirdWeek, { rng: () => 0.99 });
    expect(player.stats.money).toBe(35);
    expect(player.housing?.assets?.mortgagePrincipal).toBe(0);
    expect(thirdWeek.some((effect) => effect.includes('房产抵押'))).toBe(false);
  });

  it.each([
    { balance: 5, paid: 2, principal: 58 },
    { balance: 3, paid: 0, principal: 60 },
    { balance: 0, paid: 0, principal: 60 },
  ])('reduces principal only by the actual payment with $balance K available', ({ balance, paid, principal }) => {
    const player = createHomeOwner(balance, 60);
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(0);
    expect(player.housing?.assets?.mortgagePrincipal).toBe(principal);
    expect(effects).not.toContain('房产抵押还款 -4K');
    if (paid > 0) expect(effects).toContain(`房产抵押还款 -${paid}K`);
    else expect(effects.some((effect) => effect.startsWith('房产抵押还款 -'))).toBe(false);
    expect(effects).toContain(`资金不足，房产抵押本周少还 ${4 - paid}K，剩余本金 ${principal}K`);
  });

  it('clears only the remaining principal when selling after a weekly repayment', () => {
    const player = createHomeOwner(50, 60);
    processLivingEconomy(player, [], { rng: () => 0.99 });

    const result = applyHomeAssetAction(player, 'sell');

    expect(result.success).toBe(true);
    expect(player.stats.money).toBe(77);
    expect(result.message).toContain('清偿抵押 56K');
    expect(result.message).toContain('净入账 +34K');
    expect(player.housing?.assets).toBeUndefined();
  });

  it('replaces normal housing rent with temporary venue costs during away tournament weeks', () => {
    const player = initPlayer({
      name: 'AwayEvent',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = { tier: 'standard-apartment', movedAtRound: 0, cityId: 'local-city' };
    player.stats.money = 40;
    player.volatile.fatigue = 20;
    player.stress = 20;
    player.year = 1;
    player.week = 5;
    player.pendingMatch = {
      tournamentId: 'y1-c-02',
      tier: 'c',
      name: 'Community Open Hangzhou',
      resolveYear: 1,
      resolveWeek: 5,
      stageIndex: 0,
    };
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(33);
    expect(player.volatile.fatigue).toBe(19);
    expect(player.stress).toBe(20);
    expect(effects).toContain('异地赛事临时驻地：Hangzhou -7K');
    expect(effects).not.toContain('生活费支出 -1K');
    expect(effects.some((effect) => effect.startsWith('住宿支出：'))).toBe(false);
    expect(player.tags).toEqual(expect.arrayContaining(['travel-away', 'travel-city', 'travel-cross-region']));
  });

  it('keeps normal living economy for same-region tournament weeks', () => {
    const player = initPlayer({
      name: 'SameRegionEvent',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = { tier: 'basic-rental', movedAtRound: 0, cityId: 'regional-hub' };
    player.stats.money = 40;
    player.volatile.fatigue = 20;
    player.stress = 20;
    player.year = 1;
    player.week = 5;
    player.pendingMatch = {
      tournamentId: 'y1-c-02',
      tier: 'c',
      name: 'Community Open Hangzhou',
      resolveYear: 1,
      resolveWeek: 5,
      stageIndex: 0,
    };
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(35);
    expect(effects).toContain('生活费支出 -1K');
    expect(effects).toContain('住宿支出：普通租房 -4K（区域中心）');
    expect(effects.some((effect) => effect.startsWith('异地赛事临时驻地：'))).toBe(false);
    expect(player.tags).not.toEqual(expect.arrayContaining(['travel-away']));
  });

  it('pauses owned-home income during cross-region tournament travel while keeping asset obligations', () => {
    const player = initPlayer({
      name: 'TravelingOwner',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = {
      tier: 'owned-home',
      movedAtRound: 0,
      cityId: 'regional-hub',
      assets: {
        facilities: { trainingRoom: 1, reviewRoom: 1, restRoom: 1 },
        renovationLevel: 1,
        rentalActive: true,
        mortgagePrincipal: 60,
      },
    };
    player.team = {
      clubId: 'club-iron-wolves',
      name: '铁狼',
      tag: 'IW',
      region: '欧洲',
      tier: 'semi-pro',
      monthlySalary: 30,
      joinedRound: 1,
    };
    player.stats.money = 50;
    player.volatile.fatigue = 20;
    player.stress = 20;
    player.year = 1;
    player.week = 5;
    player.pendingMatch = {
      tournamentId: 'y1-c-02',
      tier: 'c',
      name: 'Community Open Hangzhou',
      resolveYear: 1,
      resolveWeek: 5,
      stageIndex: 0,
    };
    const effects: string[] = [];

    processLivingEconomy(player, effects, { rng: () => 0.99 });

    expect(player.stats.money).toBe(34);
    expect(player.volatile.fatigue).toBe(19);
    expect(player.stress).toBe(20);
    expect(effects).toContain('异地赛事临时驻地：Hangzhou -8K');
    expect(effects).toContain('异地赛事：房产出租收入暂停');
    expect(effects).toContain('房产抵押还款 -4K');
    expect(effects).toContain('房产设施维护 -4K');
    expect(effects.some((effect) => effect.startsWith('房产设施加成：'))).toBe(false);
    expect(effects).not.toContain('房产出租收入 +4K');
  });

  it('exposes tournament travel tags and travel recovery events', () => {
    const player = initPlayer({
      name: 'TravelTags',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.housing = { tier: 'shared-housing', movedAtRound: 0, cityId: 'local-city' };
    player.year = 1;
    player.week = 5;
    player.pendingMatch = {
      tournamentId: 'y1-c-02',
      tier: 'c',
      name: 'Community Open Hangzhou',
      resolveYear: 1,
      resolveWeek: 5,
      stageIndex: 0,
    };

    expect(housingEventTags(player)).toEqual(expect.arrayContaining(['travel-away', 'travel-city', 'travel-venue-apac']));
    expect(getEventById('housing-travel-hotel-noise')).toBeUndefined();
    expect(getEventById('housing-travel-temp-training-room')).toBeUndefined();
    expect(getEventById('tournament-context-travel-hotel-noise')?.type).toBe('tournament-context');
    expect(getEventById('tournament-context-travel-temp-training-room')?.type).toBe('tournament-context');
  });
});
