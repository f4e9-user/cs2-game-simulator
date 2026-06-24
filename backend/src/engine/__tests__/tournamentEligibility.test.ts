import { describe, expect, it } from 'vitest';
import { buildYearTournaments } from '../../data/tournaments.js';
import { canSignUpForTournament } from '../tournamentEligibility.js';
import { createSession, initPlayer } from '../gameEngine.js';
import type { ClubTier, Stage } from '../../types.js';

function makePlayer(stage: Stage, tier: ClubTier) {
  const base = initPlayer({
    name: 'EligibilityTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
    return {
      ...base,
      stage,
      week: 11,
      year: 1,
      fame: 40,
      team: {
        clubId: 'club-dragon-corp',
        name: '龙腾电竞',
      tag: 'DRG',
      region: '亚太',
      tier,
      monthlySalary: 50,
      joinedRound: 1,
    },
  };
}

describe('tournament eligibility', () => {
  it('audits qualification gates across the tournament ladder', () => {
    const tournaments = buildYearTournaments(1);
    const secondPlayer = makePlayer('second', 'semi-pro');
    const proPlayer = makePlayer('pro', 'pro');
    const lowRankProPlayer = makePlayer('pro', 'pro');

    for (const tournament of tournaments) {
      const week = tournament.signupWeeks === 'always' ? 1 : tournament.signupWeeks[0] ?? 1;
      if (
        tournament.progressionTier === 'b' &&
        tournament.qualificationTargets?.length &&
        tournament.stages.includes('second')
      ) {
        expect(
          canSignUpForTournament(secondPlayer, tournament, 100, week),
          `${tournament.id} should not require B seed for second-stage teams`,
        ).toBe(true);
      }
      if (
        tournament.progressionTier === 'a' &&
        tournament.qualificationTargets?.length &&
        tournament.stages.includes('pro')
      ) {
        expect(
          canSignUpForTournament(proPlayer, tournament, 100, week),
          `${tournament.id} should not require A ticket for pro teams`,
        ).toBe(true);
      }
      if (
        ['s-qualifier', 's-main', 'major'].includes(tournament.progressionTier) &&
        tournament.qualificationTargets?.length &&
        tournament.stages.includes('pro')
      ) {
        expect(
          canSignUpForTournament(lowRankProPlayer, tournament, 20, week),
          `${tournament.id} should keep S/Major qualification gate without ticket or ranking bypass`,
        ).toBe(false);
      }
    }
  });

  it('does not let lower-stage tournament tickets block higher-stage teams', () => {
    const tournaments = buildYearTournaments(1);
    const academyMain = tournaments.find((tournament) => tournament.id === 'y1-b-main-01');
    const challenger = tournaments.find((tournament) => tournament.id === 'y1-a-01');
    if (!academyMain) throw new Error('missing B-tier fixture');
    if (!challenger) throw new Error('missing A-tier fixture');

    const youthPlayer = makePlayer('youth', 'youth');
    const secondPlayer = makePlayer('second', 'semi-pro');
    const proPlayer = makePlayer('pro', 'pro');

    expect(canSignUpForTournament(youthPlayer, academyMain, 20, 12)).toBe(false);
    expect(canSignUpForTournament(secondPlayer, academyMain, 20, 12)).toBe(true);
    expect(canSignUpForTournament(secondPlayer, challenger, 20, 11)).toBe(false);
    expect(canSignUpForTournament(proPlayer, challenger, 20, 11)).toBe(true);
  });

  it('allows pro teams to enter A-tier tournaments without consuming qualification tickets', () => {
    const tournaments = buildYearTournaments(1);
    const challenger = tournaments.find((tournament) => tournament.id === 'y1-a-01');
    const iemOpenQualifier = tournaments.find((tournament) => tournament.id === 'y1-s-open-01');
    if (!challenger) throw new Error('missing A-tier fixture');
    if (!iemOpenQualifier) throw new Error('missing S-tier fixture');

    const proPlayer = makePlayer('pro', 'pro');

    expect(canSignUpForTournament(proPlayer, challenger, 20, 11)).toBe(true);
    expect(canSignUpForTournament(proPlayer, iemOpenQualifier, 20, 6)).toBe(false);
  });

  it('allows ranking bypass for qualifying pro and top teams', () => {
    const tournaments = buildYearTournaments(1);
    const pglClosed = tournaments.find((tournament) => tournament.id === 'y1-s-closed-02');
    const pglMajor = tournaments.find((tournament) => tournament.id === 'y1-major-02');
    const iemMain = tournaments.find((tournament) => tournament.id === 'y1-s-main-01');
    if (!pglClosed || !pglMajor || !iemMain) throw new Error('missing fixtures');

    const proPlayer = makePlayer('pro', 'pro');
    const topPlayer = makePlayer('pro', 'top');
    const lowPlayer = makePlayer('pro', 'semi-pro');

    expect(canSignUpForTournament(proPlayer, pglClosed, 90, 43)).toBe(true);
    expect(canSignUpForTournament(topPlayer, pglMajor, 150, 48)).toBe(true);
    expect(canSignUpForTournament(proPlayer, iemMain, 95, 11)).toBe(true);
    expect(canSignUpForTournament(lowPlayer, pglClosed, 90, 11)).toBe(false);
  });
});
