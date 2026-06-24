import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { createSession, initPlayer, respondTeamOffer } from '../gameEngine.js';
import {
  assignPendingMatchOpponent,
  activateClubRuntime,
  calculateClubPower,
  computeClubVrsScore,
  deriveRosterNeed,
  ensureWorldClubPool,
  previewClubRuntime,
  recordWorldTournamentResult,
  tickWorldClubRuntimes,
} from '../worldClubs.js';
import type { PendingMatch } from '../../types.js';

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
    expect(tickedAgain.worldClubs?.processedTickKeysByClubId['club-local-wolves']).toContain('round:12');
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

  it('syncs player team tier and stage when their club is promoted at season rollover', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
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
        teamQualificationSlots: { 'a-main': 1 },
        teamQualificationSlotBatches: [{ slot: 'a-main', count: 1, expiresAt: { year: 2, week: 12 } }],
        pendingMatch: {
          tournamentId: 'y1-a-01',
          tier: 'a',
          name: 'A Main',
          displayName: 'A Main',
          resolveYear: 1,
          resolveWeek: 6,
          stageIndex: 0,
          qualificationSlotUsed: 'a-main',
          qualificationSlotOwner: 'team',
        },
      },
    }, 'club-cyber-academy', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-cyber-academy']!;
    const rosterBefore = runtime.fullRoster.map((tm) => ({ id: tm.id, name: tm.name, agility: tm.stats.agility }));
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

    expect(nextSeason.worldClubs?.runtimeByClubId['club-cyber-academy']?.tier).toBe('semi-pro');
    expect(nextSeason.player.team?.tier).toBe('semi-pro');
    expect(nextSeason.player.stage).toBe('second');
    expect(nextSeason.player.team?.monthlySalary).toBe(20);
    expect(nextSeason.player.team?.lastTierChange).toMatchObject({
      season: previousSeason,
      fromTier: 'youth',
      toTier: 'semi-pro',
      direction: 'promotion',
    });
    expect(nextSeason.player.teamQualificationSlots).toEqual({});
    expect(nextSeason.player.teamQualificationSlotBatches).toEqual([]);
    expect(nextSeason.player.pendingMatch).toBeNull();
    const rosterAfter = nextSeason.worldClubs?.runtimeByClubId['club-cyber-academy']?.fullRoster ?? [];
    expect(rosterAfter.map((tm) => tm.id)).toEqual(rosterBefore.map((tm) => tm.id));
    expect(rosterAfter[0]?.name).toBe(rosterBefore[0]?.name);
    expect(rosterAfter[0]?.stats.agility).toBeGreaterThanOrEqual(rosterBefore[0]!.agility);
  });

  it('syncs player team tier without downgrading player stage when their club is relegated', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'pro',
        team: {
          clubId: 'club-dragon-corp',
          name: 'Dragon Corp',
          tag: 'DRG',
          region: '中国',
          tier: 'pro' as const,
          monthlySalary: 65,
          joinedRound: 1,
        },
      },
    }, 'club-dragon-corp', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-dragon-corp']!;
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
          'club-dragon-corp': {
            ...runtime,
            seasonPoints: 0,
            currentForm: -45,
          },
        },
      },
    }, 49, 'round');

    expect(nextSeason.worldClubs?.runtimeByClubId['club-dragon-corp']?.tier).toBe('semi-pro');
    expect(nextSeason.player.team?.tier).toBe('semi-pro');
    expect(nextSeason.player.stage).toBe('pro');
    expect(nextSeason.player.team?.monthlySalary).toBe(50);
    expect(nextSeason.player.team?.lastTierChange).toMatchObject({
      season: previousSeason,
      fromTier: 'pro',
      toTier: 'semi-pro',
      direction: 'relegation',
    });
  });

  it('ticks rival mapped clubs as active world clubs', () => {
    const base = ensureWorldClubPool(session());
    const ticked = tickWorldClubRuntimes(base, 12, 'round');

    expect(ticked.worldClubs?.activeClubIds).toContain('club-rival-semi');
    expect(ticked.worldClubs?.runtimeByClubId['club-rival-semi']).toBeDefined();
  });

  it('materializes rival mapped clubs with generated display identity', () => {
    const base = session();
    const activated = activateClubRuntime(base, 'club-rival-semi', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-rival-semi']!;
    const rival = base.player.rivals[0]!;

    expect(runtime.displayName).toBe(rival.name);
    expect(runtime.displayTag).toBe(rival.tag);
    expect(runtime.displayRegion).toBe(rival.region);
    expect(runtime.displayName).not.toBe('（对手映射）');
    expect(runtime.displayTag).not.toBe('???');
  });

  it('creates pro and top clubs with tier-appropriate baseline VRS', () => {
    const base = session();
    const pro = previewClubRuntime(base, 'club-dragon-corp');
    const top = previewClubRuntime(base, 'club-titan-corp');

    expect(pro.baselineVrsScore).toBeGreaterThanOrEqual(45);
    expect(computeClubVrsScore(pro)).toBeGreaterThan(0);
    expect(top.baselineVrsScore).toBeGreaterThan(pro.baselineVrsScore ?? 0);
    expect(computeClubVrsScore(top)).toBeGreaterThan(computeClubVrsScore(pro));
  });

  it('assigns a concrete opponent snapshot for a pending tournament match', () => {
    const baseSession = session();
    const pending: PendingMatch = {
      tournamentId: 'y1-b-01',
      tier: 'b',
      name: 'Academy League',
      displayName: 'Academy League Season 1',
      progressionTier: 'b',
      entryType: 'direct_signup',
      resolveYear: 1,
      resolveWeek: 14,
      stageIndex: 0,
    };
    const withTeam = {
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

    const { session: updated, pendingMatch } = assignPendingMatchOpponent(withTeam, pending);

    expect(pendingMatch.opponent).toBeDefined();
    expect(pendingMatch.opponent?.clubId).not.toBe('club-cyber-academy');
    expect(pendingMatch.opponent?.name).toBeTruthy();
    expect(pendingMatch.opponent?.tag).not.toBe('???');
    expect(pendingMatch.opponent?.vrsScore).toBeGreaterThanOrEqual(0);
    expect(pendingMatch.opponent?.power).toBeGreaterThan(0);
    expect(updated.worldClubs?.runtimeByClubId[pendingMatch.opponent!.clubId]).toBeDefined();
  });

  it('gives top clubs meaningful VRS movement from abstract world tournament participation', () => {
    const baseSession = session();
    const base = {
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'pro' as const,
        round: 48,
        week: 48,
      },
    };
    const withTop = activateClubRuntime(base, 'club-titan-corp', 'test');
    const before = {
      ...withTop.worldClubs!.runtimeByClubId['club-titan-corp']!,
      seasonPoints: 0,
    };
    const boosted = {
      ...withTop,
      worldClubs: {
        ...withTop.worldClubs!,
        runtimeByClubId: {
          ...withTop.worldClubs!.runtimeByClubId,
          'club-titan-corp': {
            ...before,
            currentForm: 80,
            internalChemistry: 90,
            clubTrust: 90,
            seasonPoints: 30,
          },
        },
      },
    };

    const ticked = tickWorldClubRuntimes(boosted, 48, 'round');
    const after = ticked.worldClubs!.runtimeByClubId['club-titan-corp']!;

    expect(after.seasonPoints).toBeGreaterThan(before.seasonPoints);
    expect(computeClubVrsScore(after)).toBeGreaterThan(computeClubVrsScore(before));
  });
});
