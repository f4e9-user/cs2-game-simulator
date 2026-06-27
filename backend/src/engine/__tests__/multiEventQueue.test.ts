import { describe, expect, it } from 'vitest';
import { applyChoice, createSession, endActionPhase, initPlayer } from '../gameEngine.js';
import { getEventRegistry } from '../../data/events/index.js';
import { tickWorldClubRuntimes } from '../worldClubs.js';
import type { EventDef, Player } from '../../types.js';

function player(): Player {
  return {
    ...initPlayer({
      name: 'QueueTester',
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
    round: 12,
    year: 1,
    week: 12,
    actionPoints: 100,
    stage: 'rookie',
    tags: [
      'club-origin-mismatch',
      'club-exception-strength',
      'major-broadcast',
    ],
    pendingApplication: {
      clubId: 'club-cyber-academy',
      clubName: '赛博学院',
      appliedRound: 10,
      responseRound: 12,
    },
  };
}

describe('multi event queue', () => {
  it('drops suppressed minor events instead of turning them into weekly news', () => {
    const registry = getEventRegistry();
    const minorEvent: EventDef = {
      id: 'test-minor-media-note',
      type: 'media',
      title: '普通社区评论',
      narrative: '有人随手提到了你的天梯表现。',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      weight: 1000,
      severity: 'minor',
      choices: [
        {
          id: 'ignore',
          label: '不管',
          description: '这不值得分心。',
          check: { primary: 'mentality', dc: 0 },
          success: { narrative: '你没有被这些碎片信息影响。' },
          failure: { narrative: '你没有被这些碎片信息影响。' },
        },
      ],
    };
    registry.register('media', [minorEvent]);
    try {
      const session = createSession({
        ...player(),
        tags: ['club-origin-mismatch', 'club-exception-strength'],
      }, 3);
      session.player.stage = 'youth';
      session.phase = 'action';

      const eventPhase = endActionPhase(session);

      expect(eventPhase.pickedEvent?.id).toBe('chain-club-response');
      expect(eventPhase.session.queuedEvents ?? []).toHaveLength(0);
      expect(eventPhase.session.weeklyNews?.map((item) => item.eventId)).not.toContain('test-minor-media-note');
    } finally {
      registry.unregister('media', (event) => event.id === minorEvent.id);
    }
  });

  it('summarizes world club season changes into weekly news without queuing them as decisions', () => {
    const session = createSession({
      ...player(),
      tags: ['major-broadcast'],
      pendingApplication: null,
    }, 4);
    session.phase = 'action';
    session.player.round = 13;
    session.player.week = 13;
    session.worldClubs = {
      season: 1,
      activeClubIds: ['club-cyber-academy'],
      relevantClubIds: ['club-rival-semi'],
      staticClubIds: [],
      runtimeByClubId: {},
      processedTickKeysByClubId: {},
      seasonSummaries: [{
        season: 1,
        round: 13,
        darkHorseClubIds: ['club-rival-semi'],
        fallenClubIds: [],
        promotedClubIds: ['club-cyber-academy'],
        majorNewFaceClubIds: [],
      }],
    };
    session.worldClubsVersion = 1;

    const eventPhase = endActionPhase(session);
    const newsIds = eventPhase.session.weeklyNews?.map((item) => item.eventId) ?? [];
    const decisionIds = [
      eventPhase.session.currentEvent?.id,
      ...(eventPhase.session.queuedEvents ?? []).map((event) => event.id),
    ].filter(Boolean);

    expect(newsIds).toContain('world-club-season-summary:1:13');
    expect(decisionIds).not.toContain('world-club-season-summary:1:13');
  });

  it('summarizes real external world tournament snapshots into weekly news', () => {
    let session = createSession({
      ...player(),
      tags: [],
      pendingApplication: null,
    }, 5);
    session.phase = 'action';
    session.player.round = 21;
    session.player.week = 21;
    session = tickWorldClubRuntimes(session, 21, 'round');

    const eventPhase = endActionPhase(session);
    const tournamentNews = eventPhase.session.weeklyNews?.find((item) => item.source?.tournamentId === 'y1-major-01');

    expect(tournamentNews?.eventId).toBe('world-tournament-result:y1-major-01:1:21');
    expect(tournamentNews?.source?.clubId).toBeTruthy();
  });

  it('does not queue minor decisions behind a long interaction week', () => {
    const session = createSession(player(), 1);
    session.player.stage = 'youth';
    session.phase = 'action';

    const eventPhase = endActionPhase(session);

    expect(eventPhase.pickedEvent?.id).toBe('chain-club-response');
    expect(eventPhase.session.phase).toBe('event');
    expect(eventPhase.session.currentEvent?.id).toBe('chain-club-response');
    expect(eventPhase.session.queuedEvents ?? []).toHaveLength(0);
    expect((eventPhase.session as any).weeklyNews?.map((item: { eventId: string }) => item.eventId)).toContain('broadcast-major-result');

    const first = applyChoice(eventPhase.session, 'accept-interview', 99);
    expect(first.session.player.round).toBe(12);
    expect(first.session.phase).toBe('event');
    expect(first.session.currentEvent?.id).not.toBe('chain-club-response');
    expect(first.session.queuedEvents ?? []).toHaveLength(0);

    let cursor = first.session;
    let safety = 0;
    while (cursor.phase === 'event' && safety < 10) {
      const choiceId = cursor.currentEvent?.choices[0]?.id;
      expect(choiceId).toBeTruthy();
      const next = applyChoice(cursor, choiceId!);
      cursor = next.session;
      safety += 1;
    }

    expect(safety).toBeGreaterThan(0);
    expect(cursor.phase).toBe('action');
    expect(cursor.player.round).toBeGreaterThan(12);
    expect((cursor as any).weeklyNews?.length).toBeGreaterThan(0);
    expect((cursor as any).weeklyNews?.some((item: { eventId: string }) => item.eventId.startsWith('world-tournament-'))).toBe(true);
  });

  it('materializes the next decision only after the current one resolves', () => {
    const registry = getEventRegistry();
    const firstEvent: EventDef = {
      id: 'test-team-drama-start',
      type: 'team',
      title: '队伍气氛紧绷',
      narrative: '一场普通但紧绷的队内对话。',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      weight: 1000,
      severity: 'important',
      choices: [
        {
          id: 'continue',
          label: '继续',
          description: '把这件事说完。',
          check: { primary: 'mentality', dc: 0 },
          success: { narrative: '你把话说明白了。' },
          failure: { narrative: '你把话说明白了。' },
        },
      ],
    };
    const secondEvent: EventDef = {
      id: 'test-team-drama-followup',
      type: 'team',
      title: '队内余波',
      narrative: '刚才的话题还没有完全结束。',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      weight: 999,
      severity: 'important',
      choices: [
        {
          id: 'continue',
          label: '继续',
          description: '继续处理余波。',
          check: { primary: 'mentality', dc: 0 },
          success: { narrative: '余波被压了下去。' },
          failure: { narrative: '余波被压了下去。' },
        },
      ],
    };
    registry.register('team', [firstEvent, secondEvent]);
    try {
      const session = createSession({
        ...player(),
        stage: 'youth',
        pendingApplication: null,
        team: {
          clubId: 'club-cyber-academy',
          name: '赛博学院',
          tag: 'CBA',
          region: 'CN',
          tier: 'semi-pro',
          monthlySalary: 10,
          joinedRound: 10,
        },
        forceNextEvent: 'test-team-drama-start',
      }, 2);
      session.phase = 'action';

      const eventPhase = endActionPhase(session);
      expect(eventPhase.session.currentEvent?.id).toBe('test-team-drama-start');
      expect(eventPhase.session.queuedEvents ?? []).toHaveLength(0);

      const first = applyChoice(eventPhase.session, 'continue', 99);
      expect(first.session.player.round).toBe(12);
      expect(first.session.phase).toBe('event');
      expect(first.session.currentEvent?.id).toBe('test-team-drama-followup');

      const second = applyChoice(first.session, 'continue', 99);
      expect(second.session.phase).toBe('action');
      expect(second.session.player.round).toBe(13);
    } finally {
      registry.unregister('team', (event) => event.id === firstEvent.id || event.id === secondEvent.id);
    }
  });

  it('caps how many decision events can stack in the same week', () => {
    const registry = getEventRegistry();
    const minorEvents: EventDef[] = Array.from({ length: 6 }, (_, index) => ({
      id: `test-minor-stack-${index}`,
      type: 'media',
      title: `碎片事件 ${index + 1}`,
      narrative: '一条普通但高频的碎片事件。',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 1,
      weight: 1000 - index,
      severity: 'minor',
      choices: [
        {
          id: 'ignore',
          label: '忽略',
          description: '这不值得分心。',
          check: { primary: 'mentality', dc: 0 },
          success: { narrative: '你没被这些碎片打断节奏。' },
          failure: { narrative: '你没被这些碎片打断节奏。' },
        },
      ],
    }));
    registry.register('media', minorEvents);
    try {
      const session = createSession({
        ...player(),
        tags: ['club-origin-mismatch', 'club-exception-strength'],
        pendingApplication: null,
      }, 6);
      session.player.stage = 'youth';
      session.phase = 'action';

      const eventPhase = endActionPhase(session);
      const decisionEvents = [
        eventPhase.session.currentEvent,
        ...(eventPhase.session.queuedEvents ?? []),
      ].filter((event): event is NonNullable<typeof event> => Boolean(event));

      expect(decisionEvents.length).toBeLessThanOrEqual(3);
    } finally {
      registry.unregister('media', (event) => event.id.startsWith('test-minor-stack-'));
    }
  });
});
