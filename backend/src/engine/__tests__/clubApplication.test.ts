import { describe, expect, it } from 'vitest';
import { pickEvent } from '../events.js';
import type { Player } from '../../types.js';
import { applyClubRequest, createSession, initPlayer } from '../gameEngine.js';

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
  it('forces the club response once the application response round is reached', () => {
    const event = pickEvent({
      player: player({
        pendingApplication: {
          clubId: 'club-cyber-academy',
          clubName: '赛博学院',
          appliedRound: 6,
          responseRound: 10,
        },
        tags: ['applying', 'application-path-open-match'],
      }),
      recentEventIds: [],
      rng: () => 0.99,
    });

    expect(event?.id).toBe('chain-club-response');
  });

  it('uses the rookie open-match interview when that application path is active', () => {
    const event = pickEvent({
      player: player({
        tags: ['interview-pending', 'application-path-open-match'],
      }),
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('chain-club-interview-open-match');
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
