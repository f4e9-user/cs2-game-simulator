import { describe, expect, it } from 'vitest';
import { applyChoice, applyShopPurchase, createSession, initPlayer, validateAllocation } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import { BASE_STATS, OPENING_STAT_INVEST_MAX, POINT_POOL } from '../constants.js';
import { applyCareerExperienceGrowth } from '../resolver.js';
import type { EventDef } from '../../types.js';

describe('career experience progression', () => {
  it('uses a 10 point opening pool with an 8 point per-stat investment cap', () => {
    const floor = { ...BASE_STATS };
    expect(POINT_POOL).toBe(10);
    expect(OPENING_STAT_INVEST_MAX).toBe(8);
    expect(validateAllocation({
      ...floor,
      agility: 4,
      intelligence: 3,
      mentality: 2,
      constitution: 1,
    }, floor)).toBeNull();
    expect(validateAllocation({
      ...floor,
      agility: 9,
      intelligence: 1,
      mentality: 0,
      constitution: 0,
    }, floor)).toMatch(/最多/);
  });

  it('does not allow opening allocation points to be spent on experience', () => {
    const floor = { ...BASE_STATS };
    const stats = {
      ...floor,
      agility: 3,
      intelligence: 3,
      mentality: 3,
      constitution: 3,
      experience: 1,
    };

    expect(validateAllocation(stats, floor)).toMatch(/经验不能通过开局点数分配/);
  });

  it('turns clamped negative opening overflow into temporary recovery tags', () => {
    const player = initPlayer({
      name: 'OverflowTester',
      traitIds: ['fragile-star', 'introvert', 'addicted'],
      backgroundId: '',
      stats: {
        agility: 6,
        intelligence: 8,
        mentality: 0,
        constitution: 1,
        experience: 0,
        money: 0,
      },
    });

    expect(player.stats.mentality).toBe(0);
    expect(player.tags).toEqual(expect.arrayContaining([
      'opening-mental-scar',
    ]));
    expect(player.tagExpiry['opening-mental-scar']).toBeGreaterThan(player.round);
    expect(player.stress).toBeGreaterThan(0);
  });

  it('lets the player pay to remove opening overflow recovery tags', () => {
    const player = initPlayer({
      name: 'RecoveryTester',
      traitIds: ['fragile-star', 'introvert', 'addicted'],
      backgroundId: '',
      stats: {
        agility: 6,
        intelligence: 8,
        mentality: 0,
        constitution: 1,
        experience: 0,
        money: 0,
      },
    });
    player.stats.money = 50;

    const result = applyShopPurchase(createSession(player, 1), 'foundation-rehab');

    expect(result.player.stats.money).toBe(32);
    expect(result.player.tags).not.toContain('opening-mental-scar');
    expect(result.shopTagsRemoved).toEqual(expect.arrayContaining([
      'opening-mental-scar',
    ]));
  });

  it('blocks foundation rehab unless the player has opening overflow recovery tags', () => {
    const player = initPlayer({
      name: 'HealthyTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
      stats: {
        agility: 4,
        intelligence: 4,
        mentality: 4,
        constitution: 5,
        experience: 0,
        money: 0,
      },
    });
    player.stats.money = 50;

    expect(() => applyShopPurchase(createSession(player, 1), 'foundation-rehab'))
      .toThrow('仅限存在开局负面溢出恢复标签时购买');
  });

  it('grows experience from career sources with slower high-end gains', () => {
    const low = applyCareerExperienceGrowth(
      { ...BASE_STATS, experience: 4 },
      2,
    );
    const high = applyCareerExperienceGrowth(
      { ...BASE_STATS, experience: 18 },
      2,
    );

    expect(low.grown).toBeGreaterThan(high.grown);
    expect(low.stats.experience).toBeGreaterThan(4);
    expect(high.stats.experience).toBeGreaterThan(18);
    expect(high.grown).toBeLessThan(1);
  });

  it('grows match experience without consuming the core growth cap', () => {
    const player = initPlayer({
      name: 'ExpTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
      stats: {
        agility: 4,
        intelligence: 4,
        mentality: 4,
        constitution: 5,
        experience: 0,
        money: 0,
      },
    });
    const session = createSession({
      ...player,
      forceMatchResult: 'win',
      pendingMatch: {
        tournamentId: 'y1-c-01',
        tier: 'c',
        name: 'Faceit Rookie Night',
        displayName: 'Faceit Rookie Night',
        progressionTier: 'c',
        entryType: 'direct_signup',
        resolveYear: 1,
        resolveWeek: 1,
        stageIndex: 0,
      },
    }, 1);
    session.currentEvent = toPublicEvent({
      id: 'tournament-y1-c-01--0',
      type: 'match',
      title: '测试赛事',
      narrative: '测试赛事',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      choices: [
        {
          id: 'match-play',
          label: '上场比赛',
          description: '测试',
          check: { primary: 'agility', dc: 0 },
          success: { narrative: '' },
          failure: { narrative: '' },
        },
      ],
    }, []);

    const updated = applyChoice(session, 'match-play');

    expect(updated.session.player.stats.experience).toBeGreaterThan(player.stats.experience);
    expect(updated.session.player.growthSpent).toBe(player.growthSpent);
  });

  it('grows career-time experience on round advancement with diminishing gains', () => {
    const player = initPlayer({
      name: 'TimeTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
      stats: {
        agility: 4,
        intelligence: 4,
        mentality: 4,
        constitution: 5,
        experience: 0,
        money: 0,
      },
    });
    const session = createSession(player, 1);
    const event: EventDef = {
      id: 'career-time-test',
      type: 'routine',
      title: '普通一周',
      narrative: '普通一周',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      choices: [
        {
          id: 'advance',
          label: '推进',
          description: '测试',
          check: { primary: 'agility', dc: 0 },
          success: { narrative: '' },
          failure: { narrative: '' },
        },
      ],
    };
    session.currentEvent = toPublicEvent(event, []);

    const low = applyChoice(session, 'advance', 0, [event]);
    expect(low.session.player.stats.experience).toBeGreaterThan(player.stats.experience);
    expect(low.session.player.growthSpent).toBe(player.growthSpent);

    const veteran = createSession({
      ...player,
      stats: { ...player.stats, experience: 18 },
    }, 2);
    veteran.currentEvent = session.currentEvent;
    const high = applyChoice(veteran, 'advance', 0, [event]);

    expect(high.session.player.stats.experience - veteran.player.stats.experience)
      .toBeLessThan(low.session.player.stats.experience - player.stats.experience);
  });
});
