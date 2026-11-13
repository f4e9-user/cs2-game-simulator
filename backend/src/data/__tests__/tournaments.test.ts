import { describe, expect, it } from 'vitest';
import { buildYearTournaments, tournamentInitialStageIndex } from '../tournaments.js';

describe('tournament data', () => {
  it('does not reward same-tier S main tickets from S main events', () => {
    const sMainEvents = buildYearTournaments(1).filter((tournament) => tournament.progressionTier === 's-main');

    expect(sMainEvents.length).toBeGreaterThan(0);
    for (const tournament of sMainEvents) {
      const milestoneRewards = tournament.qualificationMilestones?.flatMap((milestone) => milestone.rewards) ?? [];
      const finalRewards = tournament.qualificationRewards ?? [];

      expect([...milestoneRewards, ...finalRewards]).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ slot: 's-main' })]),
      );
    }
  });

  it('uses direct entry bypass for high-tier qualifier chains', () => {
    const tournaments = buildYearTournaments(1);
    const pglClosed = tournaments.find((tournament) => tournament.id === 'y1-s-closed-02');
    const pglMajor = tournaments.find((tournament) => tournament.id === 'y1-major-02');
    const iemMain = tournaments.find((tournament) => tournament.id === 'y1-s-main-01');

    expect(pglClosed?.directEntryBypass?.minTeamTier).toBe('pro');
    expect(pglMajor?.directEntryBypass?.minTeamTier).toBe('top');
    expect(iemMain?.directEntryBypass?.minTeamTier).toBe('pro');
  });

  it('starts top teams after S-class and Major play-ins', () => {
    const sMain = buildYearTournaments(1).find((tournament) => tournament.id === 'y1-s-main-01');
    const major = buildYearTournaments(1).find((tournament) => tournament.id === 'y1-major-01');

    expect(sMain).toBeDefined();
    expect(major).toBeDefined();
    expect(tournamentInitialStageIndex(sMain!, 'top')).toBe(1);
    expect(tournamentInitialStageIndex(major!, 'top')).toBe(1);
    expect(tournamentInitialStageIndex(sMain!, 'semi-pro')).toBe(0);
  });
});
