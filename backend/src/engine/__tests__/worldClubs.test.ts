import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { getEventById } from '../../data/events/index.js';
import { createSession, initPlayer, respondTeamOffer, applyChoice } from '../gameEngine.js';
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
import { createTournamentInstance } from '../tournamentInstance.js';
import type { PendingMatch } from '../../types.js';
import { toPublicEvent } from '../events.js';

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

    expect(initialized.worldClubsVersion).toBe(2);
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

  it('generates world player starters with age and unified stat axes', () => {
    const runtime = previewClubRuntime(session(), 'club-cyber-academy');
    const starter = runtime.fullRoster[0]!;

    expect(starter.clubId).toBe('club-cyber-academy');
    expect(starter.region).toBe('亚太');
    expect(starter.age).toBeGreaterThanOrEqual(16);
    expect(starter.age).toBeLessThanOrEqual(24);
    expect(starter.stats.constitution).toBeTypeOf('number');
    expect(starter.form).toBe(0);
    expect(starter.reputation).toBeGreaterThanOrEqual(0);
    expect(starter.archetype).toBeDefined();
  });

  it('previews a runtime without mutating the session', () => {
    const base = ensureWorldClubPool(session());
    const preview = previewClubRuntime(base, 'club-local-wolves');

    expect(preview.fullRoster).toHaveLength(5);
    expect(base.worldClubs?.runtimeByClubId['club-local-wolves']).toBeUndefined();
  });

  it('assigns pending match opponents from an active tournament instance path', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing fixture tournament');
    const base = {
      ...session(),
      player: {
        ...session().player,
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
    const instance = createTournamentInstance(base, tournament);
    const pendingMatch: PendingMatch = {
      tournamentId: tournament.id,
      tier: tournament.tier,
      name: tournament.name,
      resolveYear: 1,
      resolveWeek: 21,
      stageIndex: 0,
      tournamentInstanceId: instance.id,
    };

    const assigned = assignPendingMatchOpponent({ ...base, activeTournamentInstance: instance }, pendingMatch);

    expect(assigned.pendingMatch.opponent?.clubId).toBe(instance.playerPath?.[0]?.opponentClubId);
  });

  it('applies club identity to initial runtime state', () => {
    const s = session();
    const legacy = previewClubRuntime(s, 'club-zenith-legacy');
    const capital = previewClubRuntime(s, 'club-meteor-prime');
    const fallen = previewClubRuntime(s, 'club-steppe-titan');

    expect(legacy.clubTrust).toBeGreaterThanOrEqual(64);
    expect(legacy.rosterStability).toBeGreaterThanOrEqual(66);
    expect(legacy.baselineVrsScore).toBeGreaterThanOrEqual(128);
    expect(capital.rosterStability).toBeLessThanOrEqual(46);
    expect(capital.currentForm).toBeGreaterThanOrEqual(12);
    expect(fallen.currentForm).toBeLessThanOrEqual(-6);
    expect(fallen.rosterStability).toBeLessThanOrEqual(62);
    for (const runtime of [legacy, capital, fallen]) {
      expect(runtime.clubTrust).toBeGreaterThanOrEqual(0);
      expect(runtime.clubTrust).toBeLessThanOrEqual(100);
      expect(runtime.rosterStability).toBeGreaterThanOrEqual(0);
      expect(runtime.rosterStability).toBeLessThanOrEqual(100);
      expect(runtime.internalChemistry).toBeGreaterThanOrEqual(0);
      expect(runtime.internalChemistry).toBeLessThanOrEqual(100);
    }
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
    expect(joined.roster?.map((tm) => tm.id)).toEqual(runtime.fullRoster.slice(0, 4).map((tm) => tm.id));
    expect(joined.team?.teamStatus).toBe('trial');
    expect(joined.team?.teamStatusUntilRound).toBe(joined.round + 8);
    expect(joined.team?.joinMode).toBe('trial-sixth');
    expect(joined.team?.joinReason).toContain('试训');
    expect(joined.team?.roleOverlap).toBeDefined();
  });

  it('creates a season goal in club runtime and player team snapshot when joining', () => {
    const activated = activateClubRuntime(session(), 'club-cyber-academy', 'test');
    const offer = {
      clubId: 'club-cyber-academy',
      clubName: '赛博学院',
      tag: 'CYA',
      tier: 'youth' as const,
      region: '亚太',
      monthlySalary: 10,
    };
    const offerSession = {
      ...activated,
      player: {
        ...activated.player,
        pendingOffer: offer,
      },
    };
    const joined = respondTeamOffer(offerSession, true);
    const runtimeGoal = offerSession.worldClubs?.runtimeByClubId['club-cyber-academy']?.seasonGoal;

    expect(runtimeGoal?.season).toBe(joined.year);
    expect(joined.team?.seasonGoal?.id).toBe(runtimeGoal?.id);
    expect(joined.team?.managementPatience).toBeGreaterThan(0);
    expect(joined.team?.rebuildPressure).toBe(0);
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

  it('settles current team season goal and creates the next one at season rollover', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        team: {
          clubId: 'club-meteor-prime',
          name: 'Meteor Prime',
          tag: 'MTP',
          region: '欧洲',
          tier: 'top' as const,
          monthlySalary: 100,
          joinedRound: 1,
          seasonGoal: undefined,
        },
      },
    }, 'club-meteor-prime', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-meteor-prime']!;
    const previousSeason = activated.worldClubs!.season;
    const goal = {
      id: 'club-meteor-prime:1:reach-s-event',
      type: 'reach-s-event' as const,
      label: '打进 S 级赛事',
      season: previousSeason,
      targetTier: 's-class' as const,
      status: 'active' as const,
      progress: 0,
      baseline: {
        tierParticipations: {},
        tierChampionships: {},
        vrsScore: 0,
        startYear: previousSeason,
      },
    };

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
          'club-meteor-prime': {
            ...runtime,
            seasonGoal: goal,
            managementPatience: 60,
            rebuildPressure: 0,
          },
        },
      },
    }, 49, 'round');

    const rolledRuntime = nextSeason.worldClubs?.runtimeByClubId['club-meteor-prime'];
    expect(rolledRuntime?.seasonGoal?.season).toBe(previousSeason + 1);
    expect(rolledRuntime?.rebuildPressure).toBeGreaterThan(0);
    expect(rolledRuntime?.managementPatience).toBeLessThan(60);
    expect(nextSeason.player.team?.seasonGoal?.id).toBe(rolledRuntime?.seasonGoal?.id);
    expect(nextSeason.player.team?.rebuildPressure).toBe(rolledRuntime?.rebuildPressure);
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
    const rosterBefore = runtime.fullRoster.map((tm) => ({ id: tm.id, name: tm.name, agility: tm.stats.agility, age: tm.age }));
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
    expect(nextSeason.weeklyNews?.some((item) => item.eventId.startsWith('stage-floor-sync:'))).toBe(true);
    expect(nextSeason.player.teamQualificationSlots).toEqual({});
    expect(nextSeason.player.teamQualificationSlotBatches).toEqual([]);
    expect(nextSeason.player.pendingMatch).toBeNull();
    const rosterAfter = nextSeason.worldClubs?.runtimeByClubId['club-cyber-academy']?.fullRoster ?? [];
    expect(rosterAfter.map((tm) => tm.id)).toEqual(rosterBefore.map((tm) => tm.id));
    expect(rosterAfter[0]?.name).toBe(rosterBefore[0]?.name);
    expect(rosterAfter[0]?.age).toBe(rosterBefore[0]!.age + 1);
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

  it('records watch-level stage pressure at season rollover', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'second',
        fame: 12,
        year: 2,
        round: 49,
        team: {
          clubId: 'club-cyber-academy',
          name: '赛博学院',
          tag: 'CYA',
          region: '亚太',
          tier: 'youth' as const,
          monthlySalary: 10,
          joinedRound: 40,
        },
      },
      history: [38, 40, 42].map((round, index) => ({
        round,
        eventId: `tournament-y1-a-0${index + 1}--0`,
        eventType: 'match' as const,
        eventTitle: 'A test',
        choiceId: 'x',
        choiceLabel: 'x',
        success: false,
        roll: 1,
        dc: 10,
        narrative: 'loss',
        statChanges: {},
        newStats: baseSession.player.stats,
        stageBefore: 'second' as const,
        stageAfter: 'second' as const,
        tagsAdded: [],
        tagsRemoved: [],
        passiveEffects: [],
        qualificationChanges: [],
        stressChange: 0,
        fameChange: 0,
        feelChange: 0,
        tiltChange: 0,
        fatigueChange: 0,
        buffsAdded: [],
        createdAt: new Date(0).toISOString(),
      })),
    }, 'club-cyber-academy', 'test');
    const previousSeason = activated.worldClubs!.season;

    const nextSeason = tickWorldClubRuntimes({
      ...activated,
      worldClubs: {
        ...activated.worldClubs!,
        season: previousSeason,
      },
    }, 49, 'round');

    expect(nextSeason.player.stagePressure).toMatchObject({
      level: 'watch',
      score: 3,
      season: 2,
    });
    expect(nextSeason.weeklyNews?.some((item) => item.eventId.startsWith('stage-pressure:'))).toBe(true);
  });

  it('marks at-risk pressure without demotion on the first high-risk season', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'pro',
        fame: 12,
        stress: 90,
        year: 2,
        round: 49,
        team: {
          clubId: 'club-dragon-corp',
          name: 'Dragon Corp',
          tag: 'DRG',
          region: '中国',
          tier: 'pro' as const,
          monthlySalary: 65,
          joinedRound: 1,
        },
        stagePressure: {
          level: 'none',
          season: 1,
          score: 0,
          reasons: [],
          evaluatedRound: 48,
        },
      },
    }, 'club-dragon-corp', 'test');

    const nextSeason = tickWorldClubRuntimes(activated, 49, 'round');

    expect(nextSeason.player.stage).toBe('pro');
    expect(nextSeason.player.stagePressure).toMatchObject({
      level: 'at_risk',
      score: 5,
      season: 2,
    });
  });

  it('demotes stage after consecutive at-risk season pressure', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'pro',
        fame: 12,
        stress: 90,
        year: 2,
        round: 49,
        tags: ['cheat'],
        team: {
          clubId: 'club-dragon-corp',
          name: 'Dragon Corp',
          tag: 'DRG',
          region: '中国',
          tier: 'pro' as const,
          monthlySalary: 65,
          joinedRound: 1,
        },
        stagePressure: {
          level: 'at_risk',
          season: 1,
          score: 5,
          reasons: ['previous'],
          evaluatedRound: 48,
        },
      },
    }, 'club-dragon-corp', 'test');

    const nextSeason = tickWorldClubRuntimes(activated, 49, 'round');

    expect(nextSeason.player.stage).toBe('second');
    expect(nextSeason.player.stagePressure).toMatchObject({
      level: 'none',
      score: 0,
      season: 2,
    });
    expect(nextSeason.weeklyNews?.some((item) => item.eventId.startsWith('stage-demotion:'))).toBe(true);
  });

  it('demotes from the newly synced pro stage when pressure wins the same rollover', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'second',
        fame: 0,
        stress: 90,
        year: 2,
        round: 49,
        tags: ['cheat'],
        team: {
          clubId: 'club-rising-force',
          name: '崛起之力',
          tag: 'RF',
          region: '亚太',
          tier: 'semi-pro' as const,
          monthlySalary: 20,
          joinedRound: 1,
        },
        stagePressure: {
          level: 'at_risk',
          season: 1,
          score: 5,
          reasons: ['previous'],
          evaluatedRound: 48,
        },
      },
    }, 'club-rising-force', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-rising-force']!;

    const nextSeason = tickWorldClubRuntimes({
      ...activated,
      worldClubs: {
        ...activated.worldClubs!,
        runtimeByClubId: {
          ...activated.worldClubs!.runtimeByClubId,
          'club-rising-force': {
            ...runtime,
            seasonPoints: 40,
            currentForm: 35,
          },
        },
      },
    }, 49, 'round');

    expect(nextSeason.worldClubs?.runtimeByClubId['club-rising-force']?.tier).toBe('pro');
    expect(nextSeason.player.team?.tier).toBe('pro');
    expect(nextSeason.player.stage).toBe('second');
    expect(nextSeason.player.stagePressure).toMatchObject({
      level: 'none',
      score: 0,
      season: 2,
    });
    expect(nextSeason.weeklyNews?.some((item) => item.eventId.startsWith('stage-demotion:'))).toBe(true);
    expect(nextSeason.weeklyNews?.some((item) => item.eventId.startsWith('stage-floor-sync:'))).toBe(false);
  });

  it('evaluates a newly synced pro stage against pro pressure immediately', () => {
    const baseSession = session();
    const activated = activateClubRuntime({
      ...baseSession,
      player: {
        ...baseSession.player,
        stage: 'second',
        fame: 12,
        stress: 0,
        year: 2,
        round: 49,
        tags: [],
        team: {
          clubId: 'club-rising-force',
          name: '崛起之力',
          tag: 'RF',
          region: '亚太',
          tier: 'semi-pro' as const,
          monthlySalary: 20,
          joinedRound: 1,
        },
        stagePressure: {
          level: 'none',
          season: 1,
          score: 0,
          reasons: [],
          evaluatedRound: 48,
        },
      },
      history: [{
        round: 40,
        eventId: 'tournament-y1-a-01--1',
        eventType: 'match' as const,
        eventTitle: 'A test',
        choiceId: 'x',
        choiceLabel: 'x',
        success: true,
        roll: 20,
        dc: 10,
        narrative: 'deep run',
        statChanges: {},
        newStats: baseSession.player.stats,
        stageBefore: 'second' as const,
        stageAfter: 'second' as const,
        tagsAdded: [],
        tagsRemoved: [],
        passiveEffects: [],
        qualificationChanges: [],
        stressChange: 0,
        fameChange: 0,
        feelChange: 0,
        tiltChange: 0,
        fatigueChange: 0,
        buffsAdded: [],
        createdAt: new Date(0).toISOString(),
      }],
    }, 'club-rising-force', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-rising-force']!;

    const nextSeason = tickWorldClubRuntimes({
      ...activated,
      worldClubs: {
        ...activated.worldClubs!,
        runtimeByClubId: {
          ...activated.worldClubs!.runtimeByClubId,
          'club-rising-force': {
            ...runtime,
            seasonPoints: 40,
            currentForm: 35,
          },
        },
      },
    }, 49, 'round');

    expect(nextSeason.player.stage).toBe('pro');
    expect(nextSeason.player.stagePressure).toMatchObject({
      level: 'at_risk',
      score: 4,
      season: 2,
    });
    expect(nextSeason.weeklyNews?.some((item) => item.eventId.startsWith('stage-pressure:'))).toBe(true);
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

  it('records a final-week tournament result before season rollover promotion checks', () => {
    const tournament = getTournament('y1-c-01');
    if (!tournament) throw new Error('missing fixture tournament');
    const event = getEventById(`tournament-${tournament.id}--${tournament.bracket.length - 1}`);
    if (!event) throw new Error('missing final event');
    const baseSession = session();
    const withTeam = {
      ...baseSession,
      phase: 'event' as const,
      player: {
        ...baseSession.player,
        stage: 'youth' as const,
        round: 48,
        year: 1,
        week: 48,
        forceMatchResult: 'win' as const,
        stats: {
          ...baseSession.player.stats,
          agility: 20,
          intelligence: 20,
          experience: 20,
          mentality: 20,
        },
        team: {
          clubId: 'club-cyber-academy',
          name: '赛博学院',
          tag: 'CYA',
          region: '亚太',
          tier: 'youth' as const,
          monthlySalary: 10,
          joinedRound: 1,
        },
        pendingMatch: {
          tournamentId: tournament.id,
          tier: tournament.tier,
          name: tournament.displayName,
          displayName: tournament.displayName,
          resolveYear: 1,
          resolveWeek: 48,
          stageIndex: tournament.bracket.length - 1,
        },
      },
      currentEvent: toPublicEvent(event, []),
    };
    const activated = activateClubRuntime(withTeam, 'club-cyber-academy', 'test');
    const runtime = activated.worldClubs!.runtimeByClubId['club-cyber-academy']!;
    const prepared = {
      ...activated,
      worldClubs: {
        ...activated.worldClubs!,
        runtimeByClubId: {
          ...activated.worldClubs!.runtimeByClubId,
          'club-cyber-academy': {
            ...runtime,
            seasonPoints: 35,
            currentForm: 35,
          },
        },
      },
    };

    const choiceId = event.choices[0]?.id;
    if (!choiceId) throw new Error('missing final choice');
    const updated = applyChoice(prepared, choiceId, 20).session;

    expect(updated.player.year).toBe(2);
    expect(updated.worldClubs?.runtimeByClubId['club-cyber-academy']?.tier).toBe('semi-pro');
    expect(updated.player.team?.tier).toBe('semi-pro');
    expect(updated.worldClubs?.seasonSummaries?.[0]?.promotedClubIds).toContain('club-cyber-academy');
  });
});
