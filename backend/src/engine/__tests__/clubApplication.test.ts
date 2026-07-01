import { describe, expect, it } from 'vitest';
import { pickEvent } from '../events.js';
import type { Player } from '../../types.js';
import { applyChoice, applyClubRequest, createSession, initPlayer } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import { getEventById } from '../../data/events/index.js';

function player(overrides: Partial<Player>): Player {
  return {
    name: 'tester',
    stress: 0,
    fame: 0,
    restRounds: 0,
    stressMaxRounds: 0,
    year: 1,
    week: 1,
    stats: {
      agility: 3,
      intelligence: 2,
      experience: 0,
      money: 0,
      mentality: 2,
      constitution: 2,
    },
    volatile: { feel: 0, tilt: 0, fatigue: 0 },
    feelCap: 3,
    peripheralTier: 0,
    buffs: [],
    growthSpent: 0,
    traits: [],
    backgroundId: '',
    stage: 'rookie',
    round: 10,
    tags: [],
    tagExpiry: {},
    rivals: [],
    tournamentParticipations: 0,
    tournamentChampionships: 0,
    tierParticipations: {},
    tierChampionships: {},
    promotionPending: null,
    promotionCooldown: 0,
    pendingOffer: null,
    ownedItems: [],
    loans: [],
    salaryTracker: null,
    pawnedItemIds: [],
    roster: null,
    preferredRole: null,
    activeRole: null,
    roleCrystallized: false,
    activeRoleRounds: 0,
    roleTransition: null,
    teamTrust: 50,
    pendingMatch: null,
    actionPoints: 100,
    shopCooldowns: {},
    weeklyShopPurchases: {},
    weeklyTeamActions: {},
    team: null,
    pendingApplication: null,
    qualificationSlots: {},
    teamQualificationSlots: {},
    consecutiveLosses: 0,
    everHadTeam: false,
    contractRenewals: 0,
    forceNextEvent: null,
    forceMatchResult: null,
    bailoutCooldown: 0,
    teamBailoutCooldown: 0,
    consecutiveBrokeRounds: 0,
    roundCombos: [],
    ...overrides,
  } as Player;
}

describe('club application events', () => {
  it('does not surface scored rookie youth replies before the response round', () => {
    const event = pickEvent({
      player: player({
        round: 8,
        pendingApplication: {
          clubId: 'club-cyber-academy',
          clubName: '赛博学院',
          appliedRound: 6,
          responseRound: 10,
          path: 'youth-score',
          score: 88,
          result: 'pass',
        },
        tags: ['applying'],
      }),
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).not.toBe('chain-club-youth-score');
  });

  it('forces the club response once the application response round is reached', () => {
    const event = pickEvent({
      player: player({
        pendingApplication: {
          clubId: 'club-cyber-academy',
          clubName: '赛博学院',
          appliedRound: 6,
          responseRound: 10,
        },
        tags: ['applying'],
      }),
      recentEventIds: [],
      rng: () => 0.99,
    });

    expect(event?.id).toBe('chain-club-response');
  });

  it('uses the rookie open-match interview when that application path is active', () => {
    const event = pickEvent({
      player: player({
        pendingApplication: {
          clubId: 'club-cyber-academy',
          clubName: '赛博学院',
          appliedRound: 6,
          responseRound: 10,
          path: 'youth-score',
          score: 88,
          result: 'pass',
        },
        tags: ['application-youth-score-ready'],
      }),
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('chain-club-youth-score');
  });

  it('keeps origin preference as a soft condition with exception context', () => {
    const p = initPlayer({
      name: 'OriginTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      originRegion: '北美',
      stage: 'pro',
      fame: 40,
      round: 20,
      actionPoints: 100,
    } as Player, 1);

    const applied = applyClubRequest(session, 'club-dragon-corp');

    expect(applied.pendingApplication?.clubId).toBe('club-dragon-corp');
    expect(applied.pendingApplication?.originFit).toBe('mismatch');
    expect(applied.pendingApplication?.exceptionBonus).toBeGreaterThan(0);
    expect(applied.tags).toContain('club-origin-mismatch');
    expect(applied.tags).toContain('club-exception-strength');
  });

  it('stores a scored rookie youth application instead of hard gating it', () => {
    const p = player({
      name: 'YouthScoreTester',
      traits: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
      stats: {
        agility: 6,
        intelligence: 4,
        experience: 0,
        money: 0,
        mentality: 4,
        constitution: 2,
      },
    });
    const session = createSession({
      ...p,
      originRegion: '中国',
      stage: 'rookie',
      fame: 18,
      round: 20,
      actionPoints: 100,
      tierParticipations: { c: 3, b: 1 },
      tierChampionships: { c: 1 },
    } as Player, 1);

    const applied = applyClubRequest(session, 'club-cyber-academy');

    expect(applied.pendingApplication?.path).toBe('youth-score');
    expect(applied.pendingApplication?.result).toBeDefined();
    expect(applied.pendingApplication?.score).toBeGreaterThanOrEqual(50);
  });

  it('marks weak rookie youth applications as reject instead of throwing', () => {
    const p = player({
      name: 'WeakYouthTester',
      traits: ['streamer-charm', 'middle-class-family', 'fragile-star'],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      originRegion: '北美',
      stage: 'rookie',
      fame: 0,
      round: 20,
      actionPoints: 100,
      tierParticipations: {},
      tierChampionships: {},
    } as Player, 1);

    const applied = applyClubRequest(session, 'club-cyber-academy');

    expect(applied.pendingApplication?.path).toBe('youth-score');
    expect(applied.pendingApplication?.result).toBe('reject');
    expect(applied.pendingApplication?.score).toBeLessThan(50);
  });

  it('scores rookie youth applications by trait id instead of trait tags', () => {
    const p = player({
      name: 'TraitIdScoreTester',
      traits: ['support-soul'],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      originRegion: '北美',
      stage: 'rookie',
      fame: 0,
      round: 20,
      actionPoints: 100,
      tierParticipations: {},
      tierChampionships: {},
    } as Player, 1);

    const applied = applyClubRequest(session, 'club-cyber-academy');

    expect(applied.pendingApplication?.path).toBe('youth-score');
    expect(applied.pendingApplication?.score).toBe(42);
    expect(applied.pendingApplication?.result).toBe('reject');
  });

  it('uses the 60 percent salary band for 50-74 scored youth tryouts', () => {
    const p = player({
      name: 'TryoutSalaryTester',
      traits: [],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      stage: 'rookie',
      round: 20,
      pendingApplication: {
        clubId: 'club-school-team',
        clubName: '校队',
        appliedRound: 20,
        responseRound: 20,
        path: 'youth-score',
        score: 55,
        result: 'tryout',
      },
      tags: ['application-youth-score-ready'],
    } as Player, 1);
    const event = getEventById('chain-club-youth-score');
    if (!event) throw new Error('missing chain-club-youth-score');
    session.currentEvent = toPublicEvent(event, session.player.rivals, session.player.roster ?? []);

    const updated = applyChoice(session, 'read-score', 20);

    expect(updated.session.player.pendingOffer?.monthlySalary).toBe(6);
  });

  it('uses the 80 percent salary band for 75-84 scored youth rotations', () => {
    const p = player({
      name: 'RotationSalaryTester',
      traits: [],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      stage: 'rookie',
      round: 20,
      pendingApplication: {
        clubId: 'club-school-team',
        clubName: '校队',
        appliedRound: 20,
        responseRound: 20,
        path: 'youth-score',
        score: 80,
        result: 'pass',
      },
      tags: ['application-youth-score-ready'],
    } as Player, 1);
    const event = getEventById('chain-club-youth-score');
    if (!event) throw new Error('missing chain-club-youth-score');
    session.currentEvent = toPublicEvent(event, session.player.rivals, session.player.roster ?? []);

    const updated = applyChoice(session, 'read-score', 20);

    expect(updated.session.player.pendingOffer?.monthlySalary).toBe(8);
    expect(updated.session.player.pendingOffer?.teamStatus).toBe('rotation');
    expect(updated.session.player.pendingOffer?.teamStatusUntilRound).toBe(33);
  });

  it('clears application tags after a scored youth offer is created', () => {
    const p = player({
      name: 'YouthOfferTagTester',
      traits: [],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      stage: 'rookie',
      round: 20,
      pendingApplication: {
        clubId: 'club-school-team',
        clubName: '校队',
        appliedRound: 20,
        responseRound: 20,
        path: 'youth-score',
        score: 80,
        result: 'pass',
      },
      tags: [
        'applying',
        'application-youth-score-ready',
        'application-response-ready',
        'application-path-open-match',
        'interview-pending',
        'club-origin-match',
      ],
    } as Player, 1);
    const event = getEventById('chain-club-youth-score');
    if (!event) throw new Error('missing chain-club-youth-score');
    session.currentEvent = toPublicEvent(event, session.player.rivals, session.player.roster ?? []);

    const updated = applyChoice(session, 'read-score', 20);

    expect(updated.session.player.pendingOffer).toBeTruthy();
    expect(updated.session.player.pendingApplication).toBeNull();
    expect(updated.session.player.tags).not.toContain('applying');
    expect(updated.session.player.tags).not.toContain('application-youth-score-ready');
    expect(updated.session.player.tags).not.toContain('application-response-ready');
    expect(updated.session.player.tags).not.toContain('application-path-open-match');
    expect(updated.session.player.tags).not.toContain('interview-pending');
    expect(updated.session.player.tags).not.toContain('club-origin-match');
  });

  it('clears application tags after a scored youth rejection', () => {
    const p = player({
      name: 'YouthRejectTagTester',
      traits: [],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      stage: 'rookie',
      round: 20,
      pendingApplication: {
        clubId: 'club-school-team',
        clubName: '校队',
        appliedRound: 20,
        responseRound: 20,
        path: 'youth-score',
        score: 42,
        result: 'reject',
      },
      tags: [
        'applying',
        'application-youth-score-ready',
        'application-response-ready',
        'application-path-open-match',
        'interview-pending',
        'club-origin-match',
      ],
    } as Player, 1);
    const event = getEventById('chain-club-youth-score');
    if (!event) throw new Error('missing chain-club-youth-score');
    session.currentEvent = toPublicEvent(event, session.player.rivals, session.player.roster ?? []);

    const updated = applyChoice(session, 'read-score', 20);

    expect(updated.session.player.pendingApplication).toBeNull();
    expect(updated.session.player.tags).toContain('club-rejected-notify');
    expect(updated.session.player.tags).not.toContain('applying');
    expect(updated.session.player.tags).not.toContain('application-youth-score-ready');
    expect(updated.session.player.tags).not.toContain('application-response-ready');
    expect(updated.session.player.tags).not.toContain('application-path-open-match');
    expect(updated.session.player.tags).not.toContain('interview-pending');
    expect(updated.session.player.tags).not.toContain('club-origin-match');
  });

  it('uses the full salary band for 85-plus scored youth starters', () => {
    const p = player({
      name: 'StarterSalaryTester',
      traits: [],
      backgroundId: '',
    });
    const session = createSession({
      ...p,
      stage: 'rookie',
      round: 20,
      pendingApplication: {
        clubId: 'club-school-team',
        clubName: '校队',
        appliedRound: 20,
        responseRound: 20,
        path: 'youth-score',
        score: 90,
        result: 'pass',
      },
      tags: ['application-youth-score-ready'],
    } as Player, 1);
    const event = getEventById('chain-club-youth-score');
    if (!event) throw new Error('missing chain-club-youth-score');
    session.currentEvent = toPublicEvent(event, session.player.rivals, session.player.roster ?? []);

    const updated = applyChoice(session, 'read-score', 20);

    expect(updated.session.player.pendingOffer?.monthlySalary).toBe(10);
    expect(updated.session.player.pendingOffer?.teamStatus).toBe('starter');
    expect(updated.session.player.pendingOffer?.teamStatusUntilRound).toBeUndefined();
  });

  it('surfaces exception events before the application response is due', () => {
    const event = pickEvent({
      player: player({
        stage: 'pro',
        round: 20,
        pendingApplication: {
          clubId: 'club-dragon-corp',
          clubName: '龙腾电竞',
          appliedRound: 20,
          responseRound: 24,
          originRegion: '北美',
          originPreference: 'regional-core',
          originFit: 'mismatch',
          originFitBonus: -1,
          exceptionBonus: 2,
          exceptionReasons: ['名气远高于门槛'],
        },
        tags: ['applying', 'club-origin-mismatch', 'club-exception-ready', 'club-exception-strength'],
      }),
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('chain-club-exception-scout');
  });
});
