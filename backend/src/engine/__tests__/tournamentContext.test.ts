import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { applyChoice, createSession, initPlayer } from '../gameEngine.js';
import { pickEvent, toPublicEvent } from '../events.js';
import { createTournamentContext, pickTournamentContextEvent } from '../tournamentContext.js';
import type { PendingMatch, Player, Stage } from '../../types.js';

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
});
