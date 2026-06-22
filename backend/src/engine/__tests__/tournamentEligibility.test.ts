import { describe, expect, it } from 'vitest';
import { buildYearTournaments } from '../../data/tournaments.js';
import { canSignUpForTournament } from '../tournamentEligibility.js';
import { createSession, initPlayer } from '../gameEngine.js';

function makePlayer(stage: 'second' | 'pro', tier: 'semi-pro' | 'pro' | 'top') {
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
