import { describe, expect, it } from 'vitest';
import { applyShopPurchase, createSession, initPlayer } from '../gameEngine.js';

describe('applyShopPurchase', () => {
  it('limits each consumable item to two purchases per week', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;
    player.round = 3;
    player.week = 2;
    player.volatile.fatigue = 80;

    const session = createSession(player, 1);
    const first = applyShopPurchase(session, 'energy-drink');
    const second = applyShopPurchase({ ...session, player: first.player }, 'energy-drink');

    expect(second.player.weeklyShopPurchases['energy-drink']).toEqual({ year: 1, week: 2, count: 2 });
    expect(second.player.stats.money).toBe(14);
    expect(() => applyShopPurchase({ ...session, player: second.player }, 'energy-drink'))
      .toThrow('本周购买次数已达上限（2/2）');

    const nextWeekPlayer = {
      ...second.player,
      week: 3,
    };
    const nextWeek = applyShopPurchase({ ...session, player: nextWeekPlayer }, 'energy-drink');
    expect(nextWeek.player.weeklyShopPurchases['energy-drink']).toEqual({ year: 1, week: 3, count: 1 });
    expect(nextWeek.player.stats.money).toBe(11);
  });

  it('limits each service item to one purchase per week', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 100;
    player.week = 4;

    const session = createSession(player, 1);
    const first = applyShopPurchase(session, 'tactical-review');

    expect(first.player.weeklyShopPurchases['tactical-review']).toEqual({ year: 1, week: 4, count: 1 });
    expect(() => applyShopPurchase({ ...session, player: first.player }, 'tactical-review'))
      .toThrow('本周购买次数已达上限（1/1）');
  });
});
