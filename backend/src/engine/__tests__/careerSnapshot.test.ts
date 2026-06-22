import { describe, expect, it } from 'vitest';
import { finalizeGameSessionCareerSnapshot, finalizePlayerCareerSnapshot } from '../careerSnapshot.js';
import type { GameSession, Player } from '../../types.js';

function player(overrides: Partial<Player> = {}): Player {
  return {
    name: 'Tester',
    stats: {
      intelligence: 10,
      agility: 10,
      experience: 10,
      money: 10,
      mentality: 10,
      constitution: 10,
    },
    volatile: { feel: 0, tilt: 0, fatigue: 0 },
    feelCap: 3,
    peripheralTier: 0,
    buffs: [],
    growthSpent: 0,
    traits: [],
    backgroundId: 'bg',
    originRegion: '本地',
    stage: 'pro',
    round: 20,
    tags: [],
    tagExpiry: {},
    rivals: [],
    tournamentParticipations: 0,
    tournamentChampionships: 0,
    tierParticipations: {},
    tierChampionships: {},
    championshipSeries: {},
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
    teamTrust: 0,
    team: {
      clubId: 'club-a',
      name: 'Alpha',
      tag: 'ALP',
      region: 'EU',
      tier: 'pro',
      monthlySalary: 10,
      joinedRound: 12,
    },
    everHadTeam: true,
    contractRenewals: 0,
    stress: 20,
    fame: 30,
    restRounds: 0,
    stressMaxRounds: 0,
    year: 2,
    week: 3,
    pendingMatch: null,
    actionPoints: 100,
    shopCooldowns: {},
    weeklyShopPurchases: {},
    weeklyTeamActions: {},
    pendingApplication: null,
    qualificationSlots: {},
    teamQualificationSlots: {},
    consecutiveLosses: 0,
    forceNextEvent: null,
    forceMatchResult: null,
    bailoutCooldown: 0,
    teamBailoutCooldown: 0,
    consecutiveBrokeRounds: 0,
    creditScore: 100,
    familyBailoutCount: 0,
    roundCombos: [],
    pendingDeparture: undefined,
    ...overrides,
  };
}

function session(overrides: Partial<GameSession> = {}): GameSession {
  const basePlayer = player();
  return {
    id: 'session-1',
    apiToken: 'token',
    player: basePlayer,
    phase: 'action',
    currentEvent: null,
    history: [],
    status: 'active',
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    leaderboard: [],
    ...overrides,
  };
}

describe('career snapshot helpers', () => {
  it('tracks peak values and the longest team stint on the player snapshot', () => {
    const next = finalizePlayerCareerSnapshot(player({
      fame: 78,
      stress: 91,
      stats: {
        intelligence: 10,
        agility: 10,
        experience: 10,
        money: 10,
        mentality: 10,
        constitution: 4,
      },
      stage: 'pro',
    }));

    expect(next.careerPeaks).toEqual({
      highestStage: 'pro',
      peakFame: 78,
      peakStress: 91,
      lowestConstitution: 4,
    });
    expect(next.teamCareer).toEqual({
      longestTeamName: 'Alpha',
      longestTeamTag: 'ALP',
      longestTeamTier: 'pro',
      longestTeamRounds: 8,
    });
  });

  it('writes the finalized player back onto the session', () => {
    const next = finalizeGameSessionCareerSnapshot(session());

    expect(next.player.careerPeaks?.highestStage).toBe('pro');
    expect(next.player.teamCareer?.longestTeamRounds).toBe(8);
  });
});
