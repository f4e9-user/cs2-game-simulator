import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { applyChoice, createSession, initPlayer } from '../gameEngine.js';
import { pickEvent, toPublicEvent } from '../events.js';
import { createTournamentContext, pickTournamentContextEvent, recordTournamentContextMatchResult } from '../tournamentContext.js';
import type { EventDef, MatchStats, PendingMatch, Player, Stage } from '../../types.js';

function player(): Player {
  return {
    ...initPlayer({
      name: 'TournamentContextTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stats: {
      agility: 10,
      intelligence: 10,
      mentality: 10,
      experience: 10,
      constitution: 10,
      money: 20,
    },
    round: 4,
    year: 1,
    week: 4,
    actionPoints: 100,
    stage: 'rookie',
    team: null,
    roster: null,
    teamTrust: 0,
  };
}

function pendingMatch(): PendingMatch {
  return {
    tournamentId: 'y1-c-01',
    tier: 'c',
    name: 'Faceit Rookie Night',
    displayName: 'Faceit Rookie Night Asia',
    progressionTier: 'c',
    entryType: 'direct_signup',
    resolveYear: 1,
    resolveWeek: 6,
    stageIndex: 0,
  };
}

function awayPendingMatch(): PendingMatch {
  return {
    tournamentId: 'y1-c-02',
    tier: 'c',
    name: 'Community Open Hangzhou',
    displayName: 'Community Open Hangzhou 2026',
    progressionTier: 'c',
    entryType: 'direct_signup',
    resolveYear: 1,
    resolveWeek: 6,
    stageIndex: 0,
  };
}

function teamPlayer(overrides: Partial<Player> = {}): Player {
  return {
    ...player(),
    stage: 'second',
    team: {
      clubId: 'club-cyber-academy',
      name: 'NA Test',
      tag: 'NAT',
      region: 'North America',
      tier: 'youth',
      monthlySalary: 10,
      joinedRound: 1,
    },
    roster: [],
    teamTrust: 80,
    ...overrides,
  };
}

function sClassPendingMatch(stageIndex = 1): PendingMatch {
  return {
    tournamentId: 'y1-s-main-01',
    tier: 's-class',
    name: 'IEM',
    displayName: 'IEM Test',
    progressionTier: 's-main',
    entryType: 'invite',
    resolveYear: 1,
    resolveWeek: 6,
    stageIndex,
  };
}

function matchStats(overrides: Partial<MatchStats> = {}): MatchStats {
  return {
    kills: 14,
    deaths: 18,
    assists: 5,
    headshotRate: 0.45,
    rating: 0.95,
    teamScore: 10,
    enemyScore: 13,
    ...overrides,
  };
}

function playerWithPostMatchContext(
  match: MatchStats,
  options: {
    won?: boolean;
    finalStage?: boolean;
    player?: Player;
    pending?: PendingMatch;
    aiEvents?: EventDef[];
  } = {},
): Player {
  const pm = options.pending ?? sClassPendingMatch(options.finalStage ? 5 : 1);
  const t = getTournament(pm.tournamentId)!;
  const p = {
    ...(options.player ?? teamPlayer()),
    pendingMatch: pm,
  };
  p.tournamentContext = createTournamentContext(p, pm, t);
  const withResult = recordTournamentContextMatchResult(
    p,
    match,
    options.won ?? false,
    options.finalStage ?? false,
    (options.finalStage ?? false) && (options.won ?? false),
    options.aiEvents ?? [],
  );
  return withResult;
}

function queuedPostMatchIds(p: Player): string[] {
  return p.tournamentContext?.contextEventQueue
    .filter((ref) => ref.phase === 'post-match')
    .map((ref) => ref.eventId) ?? [];
}

describe('tournament context events', () => {
  it('picks tournament context before default prep during pending match', () => {
    const t = getTournament('y1-c-01');
    expect(t).toBeDefined();
    const pm = pendingMatch();
    const p = {
      ...player(),
      team: {
        clubId: 'club-test-na',
        name: 'NA Test',
        tag: 'NAT',
        region: 'North America',
        tier: 'youth' as const,
        monthlySalary: 10,
        joinedRound: 1,
      },
      pendingMatch: pm,
    };
    p.tournamentContext = createTournamentContext(p, pm, t!);

    const picked = pickEvent({
      player: p,
      recentEventIds: [],
      rng: () => 0.1,
    });

    expect(picked?.type).toBe('tournament-context');
    expect(picked?.id).toBe('tournament-context-goal-setting');
  });

  it('keeps preregistered middle weeks quiet until the week before match', () => {
    const t = getTournament('y1-c-01');
    expect(t).toBeDefined();
    const pm = {
      ...pendingMatch(),
      resolveWeek: 14,
    };
    const p = {
      ...player(),
      round: 5,
      week: 7,
      pendingMatch: pm,
    };
    p.tournamentContext = {
      ...createTournamentContext(p, pm, t!),
      phase: 'signup',
      signedUpAtRound: 4,
    };
    expect(pickTournamentContextEvent(p, [])).toBeNull();

    p.week = 13;
    p.tournamentContext = {
      ...p.tournamentContext!,
      phase: 'pre-match',
    };

    const picked = pickTournamentContextEvent(p, []);
    expect(picked?.type).toBe('tournament-context');
    expect(['tournament-context-baseline-prep', 'tournament-context-locker-silence', 'tournament-context-travel-hotel-noise']).toContain(picked?.id);
  });

  it('does not write team fields for no-team tournament context settlement', () => {
    const t = getTournament('y1-c-01')!;
    const pm = pendingMatch();
    const p = {
      ...player(),
      week: 5,
      housing: { tier: 'shared-housing' as const, movedAtRound: 0, cityId: 'regional-hub' as const },
      pendingMatch: pm,
    };
    p.tournamentContext = {
      ...createTournamentContext(p, pm, t),
      phase: 'pre-match',
      consumedContextEventIds: ['tournament-context-goal-setting'],
      contextEventQueue: [],
    };
    const event = pickEvent({
      player: p,
      recentEventIds: [],
      rng: () => 0.1,
    });
    expect(event).toBeDefined();

    const session = {
      ...createSession(p, 1),
      phase: 'event' as const,
      currentEvent: toPublicEvent(event!),
    };
    const settled = applyChoice(session, event!.choices[0]!.id);

    expect(settled.session.player.team).toBeNull();
    expect(settled.session.player.roster).toBeNull();
    expect(settled.session.player.teamTrust).toBe(0);
    expect(settled.session.player.tournamentContext?.consumedContextEventIds)
      .toContain('tournament-context-goal-setting');
  });

  it('uses baseline prep from tournament context queue instead of dynamic prep fallback', () => {
    const t = getTournament('y1-c-01')!;
    const pm = pendingMatch();
    const p = {
      ...player(),
      week: 9,
      team: {
        clubId: 'club-test-na',
        name: 'NA Test',
        tag: 'NAT',
        region: 'North America',
        tier: 'youth' as const,
        monthlySalary: 10,
        joinedRound: 1,
      },
      pendingMatch: pm,
    };
    p.tournamentContext = {
      ...createTournamentContext(p, pm, t),
      phase: 'pre-match',
      consumedContextEventIds: ['tournament-context-goal-setting'],
    };

    const event = pickEvent({
      player: p,
      recentEventIds: [],
      rng: () => 0.1,
    });
    expect(event).toBeDefined();
    expect(event?.type).toBe('ranked');
    expect(event?.id).not.toContain('tournament-context');
  });

  it('injects travel recovery context events before baseline prep for cross-region tournaments', () => {
    const t = getTournament('y1-c-02')!;
    const pm = awayPendingMatch();
    const p = {
      ...player(),
      week: 5,
      housing: { tier: 'shared-housing' as const, movedAtRound: 0, cityId: 'local-city' as const },
      pendingMatch: pm,
    };
    p.tournamentContext = {
      ...createTournamentContext(p, pm, t),
      phase: 'pre-match',
      consumedContextEventIds: ['tournament-context-goal-setting'],
    };

    const event = pickEvent({
      player: p,
      recentEventIds: [],
      rng: () => 0.1,
    });

    expect(event).toBeDefined();
    expect(event?.type).toBe('tournament-context');
    expect(event?.id).toBe('tournament-context-travel-hotel-noise');
  });

  it('enqueues and consumes ai tournament-context events', () => {
    const t = getTournament('y1-c-01')!;
    const pm = pendingMatch();
    const aiEvent = {
      id: 'ai-tournament-context-1',
      type: 'tournament-context' as const,
      title: 'AI 赛前试探',
      narrative: 'AI generated',
      stages: ['rookie'] as Stage[],
      difficulty: 1,
      contextPhase: ['pre-match'],
      triggerReason: 'test',
      choices: [
        {
          id: 'choose',
          label: '选择',
          description: 'test',
          check: { primary: 'mentality' as const, dc: 0 },
          success: { narrative: 'ok' },
          failure: { narrative: 'nope' },
        },
      ],
    };
    const p = {
      ...player(),
      pendingMatch: pm,
    };
    p.tournamentContext = {
      ...createTournamentContext(p, pm, t),
      phase: 'pre-match',
      consumedContextEventIds: ['tournament-context-goal-setting'],
      contextEventQueue: [
        {
          eventId: 'ai-tournament-context-1',
          phase: 'pre-match',
          stageIndex: 0,
          priority: 99,
          generatedEvent: aiEvent,
        },
      ],
    };

    const session = {
      ...createSession(p, 1),
      phase: 'event' as const,
      currentEvent: toPublicEvent(aiEvent),
      activeEventSequence: undefined,
    };
    const settled = applyChoice(session, 'choose', 0, [aiEvent]);

    expect(settled.session.player.tournamentContext?.consumedContextEventIds)
      .toContain('ai-tournament-context-1');
  });

  it('matches close losses by round diff without enqueuing blowout events', () => {
    const p = playerWithPostMatchContext(matchStats({ teamScore: 11, enemyScore: 13, rating: 1.0 }));
    const ids = queuedPostMatchIds(p);

    expect(ids).toContain('tournament-context-loss-close-rounds');
    expect(ids).not.toContain('tournament-context-loss-system-exposed');
  });

  it('matches blowout losses by round diff or low team score without enqueuing close loss events', () => {
    const p = playerWithPostMatchContext(matchStats({ teamScore: 5, enemyScore: 13, rating: 0.9 }));
    const ids = queuedPostMatchIds(p);

    expect(ids).toContain('tournament-context-loss-system-exposed');
    expect(ids).not.toContain('tournament-context-loss-close-rounds');
  });

  it('matches carried and underperformed losses using rating or K-D alternatives', () => {
    const carried = playerWithPostMatchContext(matchStats({ teamScore: 9, enemyScore: 13, rating: 1.25, kills: 24, deaths: 18 }));
    const badMap = playerWithPostMatchContext(matchStats({ teamScore: 9, enemyScore: 13, rating: 0.92, kills: 8, deaths: 15 }));

    expect(queuedPostMatchIds(carried)).toContain('tournament-context-loss-carry-not-enough');
    expect(queuedPostMatchIds(carried)).not.toContain('tournament-context-loss-underperformed');
    expect(queuedPostMatchIds(badMap)).toContain('tournament-context-loss-underperformed');
    expect(queuedPostMatchIds(badMap)).not.toContain('tournament-context-loss-carry-not-enough');
  });

  it('limits ordinary post-loss queues to two events with one severe negative and one growth event', () => {
    const p = playerWithPostMatchContext(
      matchStats({ teamScore: 5, enemyScore: 13, rating: 0.75, kills: 7, deaths: 16 }),
      { player: teamPlayer({ teamTrust: 35, stress: 75, consecutiveLosses: 2 }) },
    );
    const ids = queuedPostMatchIds(p);
    const severe = ids.filter((id) => [
      'tournament-context-loss-locker-blame',
      'tournament-context-loss-underperformed',
      'tournament-context-loss-system-exposed',
      'tournament-context-loss-public-pressure',
    ].includes(id));
    const growth = ids.filter((id) => [
      'tournament-context-loss-demo-review',
      'tournament-context-loss-close-rounds',
      'tournament-context-loss-clutch-regret',
      'tournament-context-loss-system-exposed',
      'tournament-context-loss-coach-review',
      'tournament-context-loss-carry-not-enough',
    ].includes(id));

    expect(ids).toHaveLength(2);
    expect(severe.length).toBeLessThanOrEqual(1);
    expect(growth.length).toBeLessThanOrEqual(1);
    expect(ids).not.toEqual(expect.arrayContaining([
      'tournament-context-loss-locker-blame',
      'tournament-context-loss-team-rally',
    ]));
  });

  it('allows final-stage losses to queue up to three events including the elimination walkout', () => {
    const p = playerWithPostMatchContext(
      matchStats({ teamScore: 11, enemyScore: 13, rating: 1.2, kills: 24, deaths: 18 }),
      { finalStage: true, player: teamPlayer({ teamTrust: 80 }) },
    );
    const ids = queuedPostMatchIds(p);

    expect(ids.length).toBeLessThanOrEqual(3);
    expect(ids).toContain('tournament-context-loss-elimination-walkout');
  });

  it('uses consecutiveLosses for recent tournament loss matching', () => {
    const withoutStreak = playerWithPostMatchContext(
      matchStats({ teamScore: 9, enemyScore: 13, rating: 1.0 }),
      { player: { ...player(), stage: 'second', stress: 75, consecutiveLosses: 1 } },
    );
    const withStreak = playerWithPostMatchContext(
      matchStats({ teamScore: 9, enemyScore: 13, rating: 1.0 }),
      { player: { ...player(), stage: 'second', stress: 75, consecutiveLosses: 2 } },
    );

    expect(queuedPostMatchIds(withoutStreak)).not.toContain('tournament-context-loss-public-pressure');
    expect(queuedPostMatchIds(withStreak)).toContain('tournament-context-loss-public-pressure');
  });

  it('keeps hand-authored profile events ahead of AI post-loss filler events', () => {
    const aiEvent: EventDef = {
      id: 'ai-post-loss-filler',
      type: 'tournament-context',
      title: 'AI 赛后补位',
      narrative: 'AI generated',
      stages: ['second'],
      difficulty: 1,
      choices: [
        {
          id: 'choose',
          label: '选择',
          description: 'test',
          check: { primary: 'mentality', dc: 0 },
          success: { narrative: 'ok' },
          failure: { narrative: 'nope' },
        },
      ],
    };
    const p = playerWithPostMatchContext(
      matchStats({ teamScore: 11, enemyScore: 13, rating: 1.0 }),
      { aiEvents: [aiEvent] },
    );

    expect(queuedPostMatchIds(p)).toContain('tournament-context-loss-close-rounds');
    expect(queuedPostMatchIds(p)).not.toContain('ai-post-loss-filler');
  });

  it('threads AI post-loss filler events through tournament match resolution', () => {
    const pm = pendingMatch();
    const t = getTournament(pm.tournamentId)!;
    const p = {
      ...player(),
      forceMatchResult: 'loss' as const,
      pendingMatch: pm,
    };
    p.tournamentContext = createTournamentContext(p, pm, t);
    const session = createSession(p, 1);
    session.currentEvent = toPublicEvent({
      id: `tournament-${pm.tournamentId}--${pm.stageIndex}`,
      type: 'match',
      title: '测试赛事',
      narrative: '测试赛事',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      choices: [
        {
          id: 'match-play',
          label: '上场比赛',
          description: '测试',
          check: { primary: 'agility', dc: 0 },
          success: { narrative: '' },
          failure: { narrative: '' },
        },
      ],
    }, []);
    const aiEvent: EventDef & { contextPhase: ['post-match']; postMatchAny: true } = {
      id: 'ai-post-loss-apply-choice-filler',
      type: 'tournament-context',
      title: 'AI 赛后补位',
      narrative: 'AI generated',
      stages: ['rookie'],
      difficulty: 1,
      contextPhase: ['post-match'],
      postMatchAny: true,
      choices: [
        {
          id: 'choose',
          label: '选择',
          description: 'test',
          check: { primary: 'mentality', dc: 0 },
          success: { narrative: 'ok' },
          failure: { narrative: 'nope' },
        },
      ],
    };

    const updated = applyChoice(session, 'match-play', 0, [aiEvent]);

    expect(queuedPostMatchIds(updated.session.player)).toContain('ai-post-loss-apply-choice-filler');
  });

  it('keeps public pressure outcomes from adding fame', () => {
    const p = playerWithPostMatchContext(
      matchStats({ teamScore: 9, enemyScore: 13, rating: 1.0 }),
      { player: { ...player(), stage: 'second', stress: 75, consecutiveLosses: 2 } },
    );
    const event = pickTournamentContextEvent({ ...p, pendingMatch: null }, []);
    const publicPressure = event?.id === 'tournament-context-loss-public-pressure'
      ? event
      : undefined;

    expect(publicPressure).toBeDefined();
    expect(publicPressure!.choices[0]!.success.resourceDelta?.fame ?? 0).toBe(0);
    for (const choice of publicPressure!.choices) {
      expect(choice.success.resourceDelta?.fame ?? 0).toBeLessThanOrEqual(0);
      expect(choice.failure.resourceDelta?.fame ?? 0).toBeLessThanOrEqual(0);
    }
  });

  it('maps legacy post-loss blame queue refs to the new locker blame event', () => {
    const p = playerWithPostMatchContext(
      matchStats({ teamScore: 9, enemyScore: 13, rating: 1.0 }),
      { player: teamPlayer({ teamTrust: 35 }) },
    );
    p.pendingMatch = null;
    p.tournamentContext = {
      ...p.tournamentContext!,
      contextEventQueue: [
        {
          eventId: 'tournament-context-post-loss-blame',
          phase: 'post-match',
          stageIndex: p.tournamentContext!.stageIndex,
          priority: 99,
          expiresAtRound: p.round + 2,
        },
      ],
    };

    const event = pickTournamentContextEvent(p, []);
    expect(event?.id).toBe('tournament-context-loss-locker-blame');

    const session = {
      ...createSession(p, 1),
      phase: 'event' as const,
      currentEvent: toPublicEvent(event!),
      activeEventSequence: undefined,
    };
    const settled = applyChoice(session, 'take-responsibility', 20);
    expect(settled.session.player.tournamentContext?.contextEventQueue ?? []).toHaveLength(0);
  });

  it('does not apply post-loss queue limits to win and champion context events', () => {
    const p = playerWithPostMatchContext(
      matchStats({ teamScore: 13, enemyScore: 11, rating: 1.2 }),
      { won: true, finalStage: true, player: teamPlayer({ stage: 'second' }) },
    );
    const ids = queuedPostMatchIds(p);

    expect(ids).toContain('tournament-context-close-win-silence');
    expect(ids).toContain('tournament-context-champion-resource-split');
    expect(ids.some((id) => id.startsWith('tournament-context-loss-'))).toBe(false);
  });
});
