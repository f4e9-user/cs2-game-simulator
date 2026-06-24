import { describe, expect, it } from 'vitest';
import { buildYearTournaments } from '../../data/tournaments.js';
import { initPlayer } from '../player.js';
import { tournamentTravelContext } from '../travel.js';

describe('travel region mapping', () => {
  it('keeps city-based tournament venues out of the global fallback', () => {
    const seen = new Set<string>();

    for (let year = 1; year <= 30; year += 1) {
      for (const tournament of buildYearTournaments(year)) {
        if (!tournament.city || seen.has(tournament.city)) continue;
        seen.add(tournament.city);

        const player = initPlayer({
          name: `TravelMapping-${tournament.city}`,
          traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
          backgroundId: '',
        });
        player.year = year;
        player.week = 1;
        player.pendingMatch = {
          tournamentId: tournament.id,
          tier: tournament.tier,
          name: tournament.displayName,
          resolveYear: year,
          resolveWeek: 1,
          stageIndex: 0,
        };

        const context = tournamentTravelContext(player);
        expect(context).toBeTruthy();
        expect(context?.hasCityVenue).toBe(true);
        expect(context?.venueKey).not.toBe('global');
      }
    }

    expect(seen.size).toBeGreaterThan(0);
  });
});
