import { describe, expect, it } from 'vitest';
import { pickEvent } from '../events.js';
import type { Player } from '../../types.js';

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
});
