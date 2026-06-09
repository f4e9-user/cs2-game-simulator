import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { createSession, initPlayer, respondTeamOffer } from '../gameEngine.js';
import {
  activateClubRuntime,
  calculateClubPower,
  deriveRosterNeed,
  ensureWorldClubPool,
  previewClubRuntime,
  recordWorldTournamentResult,
  tickWorldClubRuntimes,
} from '../worldClubs.js';

function session() {
  const player = initPlayer({
    name: 'WorldTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return createSession({
    ...player,
    stage: 'youth',
    round: 12,
    year: 1,
    week: 12,
  }, 1);
}

describe('world club runtime', () => {
  it('initializes a session-scoped world club pool without runtimes', () => {
    const initialized = ensureWorldClubPool(session());

    expect(initialized.worldClubsVersion).toBe(1);
    expect(initialized.worldClubs?.activeClubIds).toContain('club-rival-semi');
    expect(initialized.worldClubs?.relevantClubIds).toContain('club-local-wolves');
    expect(initialized.worldClubs?.runtimeByClubId).toEqual({});
  });

  it('activates a club runtime and keeps club id lists mutually exclusive', () => {
    const activated = activateClubRuntime(session(), 'club-cyber-academy', 'test');
    const pool = activated.worldClubs!;

    expect(pool.activeClubIds).toContain('club-cyber-academy');
    expect(pool.relevantClubIds).not.toContain('club-cyber-academy');
    expect(pool.staticClubIds).not.toContain('club-cyber-academy');
    expect(pool.runtimeByClubId['club-cyber-academy']?.fullRoster).toHaveLength(5);
    expect(pool.runtimeByClubId['club-cyber-academy']?.qualificationState.eligibleTiers).toEqual(['c', 'b']);
  });

  it('previews a runtime without mutating the session', () => {
    const base = ensureWorldClubPool(session());
    const preview = previewClubRuntime(base, 'club-local-wolves');

    expect(preview.fullRoster).toHaveLength(5);
    expect(base.worldClubs?.runtimeByClubId['club-local-wolves']).toBeUndefined();
  });

  it('derives roster needs from club runtime instead of the player', () => {
    const runtime = {
      ...previewClubRuntime(session(), 'club-local-wolves'),
      currentForm: -30,
      internalChemistry: 35,
    };
    const need = deriveRosterNeed(runtime);

    expect(need.neededIdentities).toContain('star');
    expect(need.neededIdentities).toContain('glue');
    expect(need.reasons.length).toBeGreaterThan(0);
  });

  it('calculates abstract club power from roster and runtime context', () => {
    const runtime = previewClubRuntime(session(), 'club-cyber-academy');
    const weak = calculateClubPower({
      ...runtime,
      currentForm: -50,
      internalChemistry: 20,
      clubTrust: 20,
      activeStorylines: ['chemistry-crisis'],
    });
    const strong = calculateClubPower({
      ...runtime,
      currentForm: 50,
      internalChemistry: 80,
      clubTrust: 80,
      activeStorylines: ['dark-horse-run', 'system-clicking'],
    });

    expect(strong).toBeGreaterThan(weak);
  });

  it('ticks relevant clubs idempotently on scheduled rounds', () => {
    const base = ensureWorldClubPool(session());
    const ticked = tickWorldClubRuntimes(base, 12, 'round');
    const tickedAgain = tickWorldClubRuntimes(ticked, 12, 'round');

    expect(Object.keys(ticked.worldClubs?.runtimeByClubId ?? {}).length).toBeGreaterThan(0);
    expect(ticked.worldClubs?.processedTickKeysByClubId['club-local-wolves']).toContain('round:12');
    expect(tickedAgain.worldClubs?.runtimeByClubId).toEqual(ticked.worldClubs?.runtimeByClubId);
  });

  it('records tournament results for the player club and a recent opponent', () => {
    const tournament = getTournament('y1-b-01');
    if (!tournament) throw new Error('missing fixture tournament');
    const baseSession = session();
    const base = {
      ...baseSession,
      player: {
        ...baseSession.player,
        team: {
          clubId: 'club-cyber-academy',
          name: '赛博学院',
          tag: 'CYA',
          region: '亚太',
          tier: 'youth' as const,
          monthlySalary: 10,
          joinedRound: 1,
        },
      },
    };
    const activated = activateClubRuntime(base, 'club-cyber-academy', 'test');
    const recorded = recordWorldTournamentResult(activated, tournament, true, false);
    const playerRuntime = recorded.worldClubs?.runtimeByClubId['club-cyber-academy'];

    expect(playerRuntime?.recentResults[0]?.tournamentId).toBe(tournament.id);
    expect(playerRuntime?.seasonPoints).toBeGreaterThan(0);
    expect(recorded.worldClubs?.activeClubIds.length).toBeGreaterThan(1);
  });

  it('maps club runtime starters into the player roster when joining', () => {
    const activated = activateClubRuntime(session(), 'club-cyber-academy', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-cyber-academy']!;
    const offer = {
      clubId: 'club-cyber-academy',
      clubName: '赛博学院',
      tag: 'CYA',
      tier: 'youth' as const,
      region: '亚太',
      monthlySalary: 10,
    };
    const joined = respondTeamOffer({
      ...activated,
      player: {
        ...activated.player,
        pendingOffer: offer,
      },
    }, true);

    expect(joined.roster?.map((tm) => tm.name)).toEqual(runtime.fullRoster.slice(0, 4).map((tm) => tm.name));
    expect(joined.roster?.every((tm) => tm.id.startsWith('slot-'))).toBe(true);
    expect(joined.team?.teamStatus).toBe('trial');
    expect(joined.team?.teamStatusUntilRound).toBe(joined.round + 8);
    expect(joined.team?.joinMode).toBe('trial-sixth');
    expect(joined.team?.joinReason).toContain('试训');
    expect(joined.team?.roleOverlap).toBeDefined();
  });

  it('rolls world clubs into a new season with a season summary', () => {
    const activated = activateClubRuntime(session(), 'club-cyber-academy', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-cyber-academy']!;
    const previousSeason = activated.worldClubs!.season;
    const nextSeason = tickWorldClubRuntimes({
      ...activated,
      player: {
        ...activated.player,
        year: previousSeason + 1,
        round: 49,
      },
      worldClubs: {
        ...activated.worldClubs!,
        runtimeByClubId: {
          ...activated.worldClubs!.runtimeByClubId,
          'club-cyber-academy': {
            ...runtime,
            seasonPoints: 40,
            currentForm: 35,
          },
        },
      },
    }, 49, 'round');

    const summary = nextSeason.worldClubs?.seasonSummaries?.[0];
    const rolledRuntime = nextSeason.worldClubs?.runtimeByClubId['club-cyber-academy'];
    expect(nextSeason.worldClubs?.season).toBe(previousSeason + 1);
    expect(summary?.season).toBe(previousSeason);
    expect(summary?.promotedClubIds).toContain('club-cyber-academy');
    expect(rolledRuntime?.activeStorylines).toContain('promoted-after-breakout-season');
    expect(rolledRuntime?.seasonPoints).toBe(0);
  });

  it('ticks rival mapped clubs as active world clubs', () => {
    const base = ensureWorldClubPool(session());
    const ticked = tickWorldClubRuntimes(base, 12, 'round');

    expect(ticked.worldClubs?.activeClubIds).toContain('club-rival-semi');
    expect(ticked.worldClubs?.runtimeByClubId['club-rival-semi']).toBeDefined();
  });
});
