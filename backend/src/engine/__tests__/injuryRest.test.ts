import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyChoice,
  applyShopPurchase,
  applyTeamMeeting,
  createSession,
  endActionPhase,
  initPlayer,
} from '../gameEngine.js';
import { getEventById } from '../../data/events/index.js';
import { toPublicEvent } from '../events.js';
import type { PendingMatch, Player } from '../../types.js';

function player(overrides: Partial<Player> = {}): Player {
  return {
    ...initPlayer({
      name: 'InjuryTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stats: {
      agility: 12,
      intelligence: 10,
      mentality: 10,
      experience: 10,
      constitution: 4,
      money: 20,
    },
    volatile: { feel: 0, tilt: 0, fatigue: 84 },
    round: 12,
    year: 1,
    week: 12,
    actionPoints: 100,
    stage: 'youth',
    ...overrides,
  };
}

function pendingMatch(): PendingMatch {
  return {
    tournamentId: 'y1-b-01',
    tier: 'b',
    name: 'Academy League',
    displayName: 'Academy League Season 1',
    progressionTier: 'b',
    entryType: 'direct_signup',
    resolveYear: 1,
    resolveWeek: 12,
    stageIndex: 0,
  };
}

describe('injury rest integration', () => {
  it('uses injury-aware tournament event when rest overlaps match week', () => {
    const session = createSession(player({
      pendingMatch: pendingMatch(),
      restRounds: 2,
      tags: ['injured', 'forced-rest'],
      actionPoints: 0,
    }), 1);
    session.phase = 'action';

    const eventPhase = endActionPhase(session).session;
    expect(eventPhase.currentEvent?.id).toBe('tourney-injury-y1-b-01-0');

    const forfeited = applyChoice(eventPhase, 'forfeit-injury');
    expect(forfeited.session.player.pendingMatch).toBeNull();
    expect(forfeited.session.player.restRounds).toBeGreaterThan(0);
  });

  it('adds injury risk tags after strained routine actions', () => {
    const session = createSession(player({
      pendingMatch: null,
      restRounds: 0,
      tags: [],
      actionPoints: 100,
    }), 1);

    const acted = applyAction(session, 'action-structured-training');
    expect(acted.player.tags.some((tag) => (
      tag === 'minor-injury-risk' ||
      tag === 'injury-warning' ||
      tag === 'injury-limited' ||
      tag === 'forced-rest'
    ))).toBe(true);
  });

  it('decrements restRounds automatically when a natural round advances', () => {
    const session = createSession(player({
      pendingMatch: null,
      restRounds: 2,
      tags: ['injured', 'forced-rest'],
      actionPoints: 100,
    }), 1);
    session.phase = 'event';
    session.currentEvent = toPublicEvent(getEventById('rest-physio-rookie')!);

    const resolved = applyChoice(session, 'full-rest');
    expect(resolved.session.player.restRounds).toBe(1);
    expect(resolved.session.player.tags).toContain('forced-rest');
  });

  it('does not report pressure collapse removal when the tag was not active', () => {
    const session = createSession(player({
      pendingMatch: null,
      restRounds: 2,
      stress: 40,
      stressMaxRounds: 0,
      tags: ['injured', 'forced-rest'],
      actionPoints: 100,
    }), 1);
    session.phase = 'event';
    session.currentEvent = toPublicEvent(getEventById('rest-physio-rookie')!);

    const resolved = applyChoice(session, 'full-rest');

    expect(resolved.result.tagsRemoved).not.toContain('breaking-down');
    expect(resolved.session.player.tags).not.toContain('breaking-down');
  });

  it('blocks action, shop, and team management during rest', () => {
    const session = createSession(player({
      pendingMatch: null,
      restRounds: 1,
      tags: ['injured', 'forced-rest'],
      actionPoints: 100,
      team: {
        clubId: 'club-local-wolves',
        name: 'Test Club',
        tag: 'TST',
        region: 'EU',
        tier: 'youth',
        joinedRound: 1,
        monthlySalary: 10,
      },
      roster: [
        {
          id: 'tm-1',
          name: 'Teammate',
          role: 'Entry',
          stats: {
            agility: 10,
            intelligence: 10,
            mentality: 10,
            experience: 10,
          },
          chemistry: 50,
          visibleIdentity: 'rookie',
          identitySinceRound: 1,
          traits: [],
          personality: 'supportive',
          growthSpent: 0,
        },
      ],
    }), 1);
    session.phase = 'action';
    session.currentEvent = null;

    expect(() => applyAction(session, 'action-fitness')).toThrow('休养期间不能进行日常行动');
    expect(() => applyShopPurchase(session, 'energy-drink')).toThrow('休养期间不能购买商店物品');
    expect(() => applyTeamMeeting(session)).toThrow('休养期间不能进行队伍管理');
  });
});
