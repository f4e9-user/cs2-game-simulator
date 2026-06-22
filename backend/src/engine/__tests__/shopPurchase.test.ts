import { describe, expect, it } from 'vitest';
import { applyAction, applyShopPurchase, createSession, initPlayer, weekToMonth } from '../gameEngine.js';

describe('applyShopPurchase', () => {
  it('keeps weekToMonth exported from the game engine facade', () => {
    expect(weekToMonth(1)).toBe(1);
    expect(weekToMonth(5)).toBe(2);
    expect(weekToMonth(99)).toBe(12);
  });

  it('blocks shop purchases while an event sequence is active', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;

    const session = createSession(player, 1);
    session.activeEventSequence = {
      id: 'test-sequence',
      type: 'club-interview',
      currentIndex: 0,
      startedRound: player.round,
      mustCompleteInCurrentRound: true,
      status: 'active',
      context: {},
      steps: [],
    };

    expect(() => applyShopPurchase(session, 'energy-drink'))
      .toThrow('当前事件流程未结束，不能进行其他操作');
  });

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

  it('adds multi-round cooldowns to deep recovery services', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 100;
    player.round = 10;
    player.week = 4;

    const session = createSession(player, 1);
    const first = applyShopPurchase(session, 'psych-session');

    expect(first.player.shopCooldowns['psych-session']).toBe(16);

    const nextWeekPlayer = {
      ...first.player,
      round: 12,
      week: 5,
    };
    expect(() => applyShopPurchase({ ...session, player: nextWeekPlayer }, 'psych-session'))
      .toThrow('商品冷却中，还需 4 回合');

    const cooledDownPlayer = {
      ...first.player,
      stats: { ...first.player.stats, money: 100 },
      round: 16,
      week: 5,
    };
    const second = applyShopPurchase({ ...session, player: cooledDownPlayer }, 'psych-session');
    expect(second.player.shopCooldowns['psych-session']).toBe(22);
  });

  it('uses shared tag expiry durations for shop negative event tags', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 100;
    player.stage = 'youth';
    player.round = 10;
    player.team = {
      clubId: 'club-local-wolves',
      name: '本地狼队',
      tag: 'LW',
      region: '本地',
      tier: 'youth',
      monthlySalary: 10,
      joinedRound: 1,
    };

    const session = createSession(player, 1);
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const result = applyShopPurchase(session, 'team-dinner');

      expect(result.player.tags).toContain('locker-tension');
      expect(result.player.tagExpiry?.['locker-tension']).toBe(18);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('makes aim coaching a buff-only baseline service', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 100;
    player.stress = 45;
    player.volatile.fatigue = 60;
    player.volatile.feel = 2;

    const session = createSession(player, 1);
    const originalRandom = Math.random;
    Math.random = () => 1;
    try {
      const result = applyShopPurchase(session, 'aim-coach');

      expect(result.player.stats.money).toBe(70);
      expect(result.player.stress).toBe(45);
      expect(result.player.volatile.fatigue).toBe(60);
      expect(result.player.volatile.feel).toBe(2);
      expect(result.player.buffs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'aim-coached',
          growthKey: 'agility',
          growthMultiplier: 1.18,
        }),
      ]));
    } finally {
      Math.random = originalRandom;
    }
  });

  it('consumes painkiller fatigue buff on the next positive fatigue action', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    player.stats.money = 20;
    player.stats.constitution = 20;
    player.volatile.fatigue = 50;

    const session = createSession(player, 1);
    const purchased = applyShopPurchase(session, 'painkiller');
    expect(purchased.player.buffs.some((buff) => buff.id === 'painkiller-cover')).toBe(true);

    const acted = applyAction({ ...session, player: purchased.player }, 'action-fitness');
    expect(acted.player.buffs.some((buff) => buff.id === 'painkiller-cover')).toBe(false);
  });
});
