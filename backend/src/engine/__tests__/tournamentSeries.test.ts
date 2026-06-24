import { describe, expect, it } from 'vitest';
import { aggregateSeriesMatchResult, applyChoice, createSession, endActionPhase, initPlayer } from '../gameEngine.js';
import type { TournamentSeriesContext } from '../tournamentSeries.js';
import type { PendingMatch, Player } from '../../types.js';

function player(): Player {
  return {
    ...initPlayer({
      name: 'SeriesTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stats: {
      agility: 24,
      intelligence: 18,
      mentality: 18,
      experience: 18,
      constitution: 18,
      money: 20,
    },
    volatile: { feel: 2, tilt: 0, fatigue: 10 },
    round: 20,
    year: 1,
    week: 20,
    actionPoints: 0,
    stage: 'youth',
    forceMatchResult: 'win',
  };
}

function unforcedPlayer(): Player {
  return {
    ...player(),
    forceMatchResult: null,
  };
}

function pendingFinal(): PendingMatch {
  return {
    tournamentId: 'y1-b-01',
    tier: 'b',
    name: 'Academy League',
    displayName: 'Academy League Season 1',
    progressionTier: 'b',
    entryType: 'direct_signup',
    resolveYear: 1,
    resolveWeek: 20,
    stageIndex: 1,
  };
}

function pendingPglMajorFinal(): PendingMatch {
  return {
    tournamentId: 'y1-major-02',
    tier: 'major',
    name: 'PGL Major',
    displayName: 'PGL Major',
    progressionTier: 'major',
    entryType: 'invite',
    resolveYear: 1,
    resolveWeek: 20,
    stageIndex: 5,
  };
}

function pendingSClassGroup(): PendingMatch {
  return {
    tournamentId: 'y1-s-main-01',
    tier: 's-class',
    name: 'IEM',
    displayName: 'IEM Test',
    progressionTier: 's-main',
    entryType: 'invite',
    resolveYear: 1,
    resolveWeek: 20,
    stageIndex: 1,
  };
}

function resolveForcedGroupLoss(stageLosses = 0) {
  const p = {
    ...player(),
    forceMatchResult: 'loss' as const,
    pendingMatch: {
      ...pendingSClassGroup(),
      stageLosses,
    },
  };
  const session = {
    ...createSession(p, 1),
    phase: 'action' as const,
  };

  const eventPhase = endActionPhase(session).session;
  const map1 = applyChoice(eventPhase, 'match-play');
  const map2 = applyChoice(map1.session, 'match-play');
  return applyChoice(map2.session, 'series-confirm');
}

describe('tournament series', () => {
  it('runs a bo3 in one round and pays rewards only on final step', () => {
    const p = {
      ...player(),
      pendingMatch: pendingFinal(),
    };
    const session = {
      ...createSession(p, 1),
      phase: 'action' as const,
    };

    const eventPhase = endActionPhase(session).session;
    expect(eventPhase.activeEventSequence?.type).toBe('tournament-series');
    expect(eventPhase.currentEvent?.id).toContain('map-1');

    const map1 = applyChoice(eventPhase, 'match-play');
    expect(map1.session.player.round).toBe(20);
    expect(map1.session.player.stats.money).toBe(20);
    expect(map1.session.currentEvent?.id).toContain('map-2');

    const map2 = applyChoice(map1.session, 'match-play');
    expect(map2.session.player.round).toBe(20);
    expect(map2.session.player.stats.money).toBe(20);
    expect(map2.session.currentEvent?.id).toBe('tournament-y1-b-01--1');
    expect(map2.session.activeEventSequence?.currentIndex).toBe(3);

    const final = applyChoice(map2.session, 'series-confirm');
    expect(final.session.phase).toBe('action');
    expect(final.session.player.round).toBe(21);
    expect(final.session.player.pendingMatch).toBeNull();
    expect(final.session.player.stats.money).toBeGreaterThan(20);
    expect(final.session.player.tournamentChampionships).toBeGreaterThan(0);
    expect(final.result.sequenceFinal).toBe(true);
    expect(final.result.matchStats?.kills).toBeGreaterThan(0);
  });

  it('does not add extra fatigue on series confirmation after completed maps', () => {
    const p = {
      ...player(),
      pendingMatch: pendingFinal(),
    };
    const session = {
      ...createSession(p, 1),
      phase: 'action' as const,
    };

    const eventPhase = endActionPhase(session).session;
    const map1 = applyChoice(eventPhase, 'match-play');
    const map2 = applyChoice(map1.session, 'match-play');
    const final = applyChoice(map2.session, 'series-confirm');

    expect(final.result.fatigueChange).toBe(0);
  });

  it('uses a different simulation stream for each map in the same bo3 round', () => {
    const p = {
      ...unforcedPlayer(),
      pendingMatch: pendingFinal(),
    };
    const session = {
      ...createSession(p, 1),
      phase: 'action' as const,
    };

    const eventPhase = endActionPhase(session).session;
    const map1 = applyChoice(eventPhase, 'match-play');
    const map2 = applyChoice(map1.session, 'match-play');

    expect(map1.session.player.round).toBe(map2.session.player.round);
    expect(map1.result.matchStats).toBeDefined();
    expect(map2.result.matchStats).toBeDefined();
    expect(map2.result.matchStats).not.toEqual(map1.result.matchStats);
  });

  it('does not repeat map simulation when a bo3 step is restored in the same round', () => {
    const p = {
      ...unforcedPlayer(),
      pendingMatch: pendingFinal(),
    };
    const session = {
      ...createSession(p, 1),
      phase: 'action' as const,
    };

    const eventPhase = endActionPhase(session).session;
    const map1 = applyChoice(eventPhase, 'match-play');
    const restoredMap2Session = {
      ...map1.session,
      activeEventSequence: undefined,
    };
    const map2 = applyChoice(restoredMap2Session, 'match-play');

    expect(map2.result.eventId).toContain('map-2');
    expect(map2.result.matchStats).not.toEqual(map1.result.matchStats);
  });

  it('records championship counts by tier and S-tier series', () => {
    const p = {
      ...player(),
      stage: 'pro' as const,
      pendingMatch: pendingPglMajorFinal(),
    };
    const session = {
      ...createSession(p, 1),
      phase: 'action' as const,
    };

    const eventPhase = endActionPhase(session).session;
    const map1 = applyChoice(eventPhase, 'match-play');
    const map2 = applyChoice(map1.session, 'match-play');
    const map3 = applyChoice(map2.session, 'match-play');
    const final = applyChoice(map3.session, 'series-confirm');

    expect(final.session.player.tierChampionships.major).toBe(1);
    expect(final.session.player.tierChampionships.s).toBe(1);
    expect(final.session.player.championshipSeries?.pgl).toBe(1);
    expect(final.session.player.championshipSeries?.major).toBe(1);
  });

  it('keeps a player alive after one group-stage loss and eliminates on the second', () => {
    const firstLoss = resolveForcedGroupLoss(0);

    expect(firstLoss.result.success).toBe(false);
    expect(firstLoss.session.player.pendingMatch?.stageIndex).toBe(1);
    expect(firstLoss.session.player.pendingMatch?.stageLosses).toBe(1);

    const secondLoss = resolveForcedGroupLoss(1);

    expect(secondLoss.result.success).toBe(false);
    expect(secondLoss.session.player.pendingMatch).toBeNull();
  });

  it('requires PGL, BLAST, and Major championships for the legend ending', () => {
    const base = {
      ...player(),
      stage: 'pro' as const,
      round: 575,
      fame: 100,
      pendingMatch: null,
    };
    const event = {
      id: 'test-final-week',
      type: 'life' as const,
      title: '最后一周',
      narrative: '赛季结束前，你做最后一次复盘。',
      stages: ['pro' as const],
      difficulty: 1,
      choices: [{
        id: 'finish',
        label: '结束',
        description: '结束生涯。',
        check: { primary: 'mentality' as const, dc: 1 },
        success: { narrative: '你完成了最后一周。' },
        failure: { narrative: '你完成了最后一周。' },
      }],
    };

    const missingBlast = applyChoice({
      ...createSession({
        ...base,
        championshipSeries: { pgl: 1, major: 1 },
      }, 1),
      currentEvent: event,
      phase: 'event' as const,
    }, 'finish', 20, [event]);
    const grandSlam = applyChoice({
      ...createSession({
        ...base,
        championshipSeries: { pgl: 1, blast: 1, major: 1 },
      }, 1),
      currentEvent: event,
      phase: 'event' as const,
    }, 'finish', 20, [event]);

    expect(missingBlast.session.ending).not.toBe('legend');
    expect(grandSlam.session.ending).toBe('legend');
  });

  it('rejects a tied series because overtime should prevent that state', () => {
    const context: TournamentSeriesContext = {
      tournamentId: 'y1-b-01',
      stageIndex: 1,
      seriesType: 'bo3',
      mapPool: ['Mirage', 'Inferno', 'Nuke'],
      maps: [
        { mapName: 'Mirage', won: true, teamScore: 13, enemyScore: 10, kills: 20, deaths: 15, assists: 5, headshotRate: 0.45, rating: 1.12 },
        { mapName: 'Inferno', won: false, teamScore: 10, enemyScore: 13, kills: 16, deaths: 18, assists: 6, headshotRate: 0.39, rating: 0.98 },
      ],
      playerMapWins: 1,
      opponentMapWins: 1,
    };

    expect(() => aggregateSeriesMatchResult(player(), context)).toThrow(/tied map wins/);
  });
});
