import { describe, expect, it } from 'vitest';
import app from '../../index.js';
import { RULES_META } from '../../engine/constants.js';
import { activateClubRuntime } from '../../engine/worldClubs.js';
import { buildYearTournaments } from '../../data/tournaments.js';
import type { Env, GameSession, RoundResult } from '../../types.js';

class MemoryStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sessions: Map<string, GameSession>,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): MemoryStatement {
    this.values = values;
    return this;
  }

  async run(): Promise<object> {
    if (this.query.includes('INSERT INTO sessions')) {
      for (const data of this.values) {
        if (typeof data !== 'string') continue;
        try {
          const session = JSON.parse(data) as Partial<GameSession>;
          if (typeof session.id === 'string' && session.player) {
            this.sessions.set(session.id, session as GameSession);
            break;
          }
        } catch {
          // Non-JSON bind values include id/name/stage fields.
        }
      }
    }
    return {};
  }

  async first<T>(): Promise<T | null> {
    if (this.query.includes('SELECT data FROM sessions WHERE id = ?')) {
      const id = this.values[0];
      const session = typeof id === 'string' ? this.sessions.get(id) : undefined;
      return session ? ({ data: JSON.stringify(session) } as T) : null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }
}

function makeEnv(): Env {
  const sessions = new Map<string, GameSession>();
  return {
    DB: {
      prepare(query: string) {
        return new MemoryStatement(sessions, query);
      },
    } as unknown as D1Database,
    KV: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
      list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
    } as unknown as KVNamespace,
    AI_PROVIDER: 'none',
  } as Env;
}

function makeExecutionContext(): ExecutionContext {
  return {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext;
}

describe('game routes', () => {
  it('returns backend role profile metadata without money stats', async () => {
    const res = await app.request('https://localhost/api/game/meta/role-profiles');
    const body = await res.json() as {
      roleProfiles?: Array<{
        role: string;
        primaryStats: string[];
        secondaryStats: string[];
        eventThemes: string[];
      }>;
      error?: string;
    };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.roleProfiles).toHaveLength(5);
    expect(body.roleProfiles?.map((profile) => profile.role).sort()).toEqual([
      'AWPer',
      'Entry',
      'IGL',
      'Lurker',
      'Support',
    ]);
    expect(body.roleProfiles?.flatMap((profile) => [
      ...profile.primaryStats,
      ...profile.secondaryStats,
    ])).not.toContain('money');
  });

  it('returns centralized game rules metadata', async () => {
    const res = await app.request('https://localhost/api/game/meta/rules');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(RULES_META);
  });

  it('returns all tournaments for the current year', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Tournament List Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };

    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const year = session.player.year ?? 1;
    const currentWeek = 13;
    const tournament = buildYearTournaments(year)[0]!;
    const endedSession: GameSession = {
      ...session,
      player: {
        ...session.player,
        week: currentWeek,
      },
      worldClubs: {
        season: session.worldClubs?.season ?? year,
        activeClubIds: session.worldClubs?.activeClubIds ?? [],
        relevantClubIds: session.worldClubs?.relevantClubIds ?? [],
        staticClubIds: session.worldClubs?.staticClubIds ?? [],
        runtimeByClubId: session.worldClubs?.runtimeByClubId ?? {},
        processedTickKeysByClubId: session.worldClubs?.processedTickKeysByClubId ?? {},
        seasonSummaries: session.worldClubs?.seasonSummaries,
        tournamentSnapshots: [{
          id: 'snapshot-test',
          tournamentId: tournament.id,
          tournamentName: tournament.displayName,
          tier: tournament.tier,
          year,
          signupWeek: 1,
          resultYear: year,
          resultWeek: 2,
          round: 99,
          participants: [],
          championClubId: 'club-cyber-academy',
          runnerUpClubId: 'club-apex-gaming',
          finalScore: '2-1',
          createdAt: new Date(0).toISOString(),
        }],
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(endedSession.id, endedSession.player.name, endedSession.player.stage, endedSession.player.round, endedSession.status, endedSession.ending ?? null, JSON.stringify(endedSession), endedSession.createdAt, endedSession.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/tournaments/all`, {}, env);
    const body = await res.json() as {
      year?: number;
      week?: number;
      playerStage?: string;
      tournaments?: Array<{ id: string; isEnded?: boolean; championName?: string | null; runnerUpName?: string | null }>;
      error?: string;
    };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.year).toBe(year);
    expect(body.week).toBe(currentWeek);
    expect(body.tournaments).toHaveLength(buildYearTournaments(year).length);
    expect(body.tournaments?.[0]).toMatchObject({
      isEnded: true,
      championName: '赛博学院',
      runnerUpName: 'Apex Gaming',
    });
  });

  it('derives opening experience from traits when starting with client stats', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Scene Kid Starter',
        traitIds: ['scene-kid', 'aim-god', 'tactical-mind'],
        stats: {
          intelligence: 5,
          agility: 6,
          mentality: 4,
          constitution: 3,
          experience: 0,
          money: 0,
        },
      }),
    }, env);
    const body = await startRes.json() as { player?: GameSession['player']; error?: string };

    expect(startRes.status, JSON.stringify(body)).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.stats.experience).toBe(1);
  });

  it('replays last-week routine actions through the game route and persists partial success', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Routine Route Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        actionPoints: 40,
        lastWeekRoutineActions: ['action-meditation', 'action-fitness'],
        currentWeekRoutineActions: [],
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/replay-last-week-actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.apiToken}`,
      },
    }, env);
    const body = await res.json() as {
      player?: GameSession['player'];
      replayResults?: Array<{ actionId: string }>;
      replayStopped?: { index: number; actionId: string; reason: string } | null;
      error?: string;
    };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.replayResults?.map((result) => result.actionId)).toEqual(['action-meditation']);
    expect(body.replayStopped).toEqual({
      index: 1,
      actionId: 'action-fitness',
      reason: '行动力不足',
    });
    expect(body.player?.currentWeekRoutineActions).toEqual(['action-meditation']);

    const saved = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const savedBody = await saved.json() as GameSession;
    expect(savedBody.player.currentWeekRoutineActions).toEqual(['action-meditation']);
  });

  it('persists queued events and weekly news when ending the action phase', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Queue Route Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      phase: 'action',
      weeklyNews: [
        {
          id: 'seed-news',
          eventId: 'seed-news',
          type: 'broadcast',
          title: '种子新闻',
          narrative: '种子新闻内容',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      player: {
        ...session.player,
        round: 12,
        week: 12,
        tags: ['club-origin-mismatch', 'club-exception-strength', 'major-broadcast'],
        pendingApplication: {
          clubId: 'club-cyber-academy',
          clubName: '赛博学院',
          appliedRound: 10,
          responseRound: 12,
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/end-action-phase`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
    }, env);
    const raw = await res.text();
    const body = JSON.parse(raw) as GameSession & { error?: string };

    expect(res.status, raw).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.currentEvent?.id).toBe('chain-club-response');
    expect(body.queuedEvents ?? []).toHaveLength(0);
    expect(body.weeklyNews?.map((item) => item.eventId)).toContain('seed-news');

    const saved = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const savedBody = await saved.json() as GameSession;
    expect(savedBody.queuedEvents ?? []).toHaveLength(0);
    expect(savedBody.weeklyNews?.map((item) => item.eventId)).toContain('seed-news');
  });

  it('ends a career in place and exposes the final summary afterwards', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Summary Route Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const history: RoundResult[] = [
      {
        round: 1,
        eventId: 'round-1',
        eventType: 'daily',
        eventTitle: '首周磨合',
        choiceId: 'choice-1',
        choiceLabel: '稳住节奏',
        success: true,
        roll: 18,
        dc: 10,
        narrative: '你稳住了开局。',
        statChanges: {},
        newStats: session.player.stats,
        stageBefore: 'rookie',
        stageAfter: 'rookie',
        tagsAdded: [],
        tagsRemoved: [],
        passiveEffects: [],
        qualificationChanges: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      } as unknown as RoundResult,
      {
        round: 2,
        eventId: 'round-2',
        eventType: 'daily',
        eventTitle: '继续推进',
        choiceId: 'choice-2',
        choiceLabel: '继续冲',
        success: false,
        roll: 6,
        dc: 12,
        narrative: '你在后半程吃到了一次失败。',
        statChanges: {},
        newStats: session.player.stats,
        stageBefore: 'rookie',
        stageAfter: 'rookie',
        tagsAdded: [],
        tagsRemoved: [],
        passiveEffects: [],
        qualificationChanges: [],
        createdAt: '2026-01-02T00:00:00.000Z',
      } as unknown as RoundResult,
    ];
    const seeded: GameSession = {
      ...session,
      phase: 'event',
      currentEvent: {
        id: 'seed-event',
        type: 'daily',
        title: '暂存事件',
        narrative: '临时事件',
        choices: [],
      } as unknown as NonNullable<GameSession['currentEvent']>,
      queuedEvents: [
        {
          id: 'seed-queued-event',
          type: 'daily',
          title: '队列事件',
          narrative: '队列中的事件',
          choices: [],
        } as unknown as NonNullable<GameSession['currentEvent']>,
      ],
      history,
      player: {
        ...session.player,
        stage: 'pro',
        round: 22,
        tournamentChampionships: 2,
        championshipSeries: { pgl: 1, blast: 0, major: 0 },
        pendingMatch: {
          tournamentId: 't1',
          tier: 's',
          name: '预留赛事',
          resolveYear: 1,
          resolveWeek: 1,
          stageIndex: 0,
        },
        pendingApplication: {
          clubId: 'club-x',
          clubName: '测试战队',
          appliedRound: 20,
          responseRound: 22,
        },
        pendingOffer: {
          clubId: 'club-y',
          clubName: '另一个战队',
          tag: 'TY',
          region: 'EU',
          tier: 'pro',
        } as GameSession['player']['pendingOffer'],
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const endRes = await app.request(`https://localhost/api/game/${started.sessionId}/end-career`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
    }, env);
    const endBody = await endRes.json() as GameSession & { error?: string };

    expect(endRes.status).toBe(200);
    expect(endBody.error).toBeUndefined();
    expect(endBody.status).toBe('ended');
    expect(endBody.ending).toBe('career_ended');
    expect(endBody.player.stage).toBe('retired');
    expect(endBody.currentEvent).toBeNull();
    expect(endBody.queuedEvents ?? []).toHaveLength(0);
    expect(endBody.player.pendingMatch).toBeNull();
    expect(endBody.player.pendingApplication).toBeNull();
    expect(endBody.player.pendingOffer).toBeNull();

    const saved = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const savedBody = await saved.json() as GameSession;
    expect(savedBody.status).toBe('ended');
    expect(savedBody.ending).toBe('career_ended');
    expect(savedBody.player.stage).toBe('retired');

    const summaryRes = await app.request(`https://localhost/api/game/${started.sessionId}/summary`, {
      headers: {
        authorization: `Bearer ${started.apiToken}`,
      },
    }, env);
    const summaryBody = await summaryRes.json() as { summary?: string; ending?: string; error?: string };

    expect(summaryRes.status).toBe(200);
    expect(summaryBody.error).toBeUndefined();
    expect(summaryBody.ending).toBe('career_ended');
    expect(summaryBody.summary).toContain('完成了 2 轮生涯');
    expect(summaryBody.summary).toContain('career_ended');
  });

  it('creates bank loans with the requested repayment duration', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Loan Route Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'youth',
        round: 10,
        creditScore: 80,
        loans: [],
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/loan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ amount: 40, durationRounds: 8 }),
    }, env);
    const body = await res.json() as { loan?: GameSession['player']['loans'][number]; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.loan).toMatchObject({
      principal: 40,
      durationRounds: 8,
      interestRate: 0.18,
      issuedRound: 10,
      dueRound: 18,
    });
  });

  it('lets qualified pro teams sign up for A-tier tournaments without qualification tickets', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'A Tier Signup Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'pro',
        year: 1,
        week: 11,
        fame: 40,
        team: {
          clubId: 'club-dragon-corp',
          name: '龙腾电竞',
          tag: 'DRG',
          region: 'CN',
          tier: 'pro',
          monthlySalary: 65,
          joinedRound: session.player.round,
        },
        qualificationSlots: {},
        teamQualificationSlots: {},
      },
      leaderboard: [{ name: '龙腾电竞', tag: 'DRG', region: 'CN', points: 20, isPlayer: true }],
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ tournamentId: 'y1-a-01' }),
    }, env);
    const body = await res.json() as {
      player?: GameSession['player'];
      activeTournamentInstance?: GameSession['activeTournamentInstance'];
      error?: string;
    };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.pendingMatch?.tournamentId).toBe('y1-a-01');
    expect(body.player?.pendingMatch?.tournamentInstanceId).toBe('y1-a-01:1');
    expect(body.activeTournamentInstance?.playerTeamClubId).toBe('club-dragon-corp');
    expect(body.player?.pendingMatch?.qualificationSlotUsed).toBeUndefined();
  });

  it('lets higher-tier teams sign up for B-tier tournaments without qualification tickets', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'B Tier Signup Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'second',
        year: 1,
        week: 12,
        fame: 12,
        team: {
          clubId: 'dragon-raiders',
          name: '龙腾电竞',
          tag: 'DRG',
          region: 'CN',
          tier: 'semi-pro',
          monthlySalary: 28,
          joinedRound: session.player.round,
        },
        qualificationSlots: {},
        teamQualificationSlots: {},
      },
      leaderboard: [{ name: '龙腾电竞', tag: 'DRG', region: 'CN', points: 8, isPlayer: true }],
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ tournamentId: 'y1-b-main-01' }),
    }, env);
    const body = await res.json() as { player?: GameSession['player']; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.pendingMatch?.tournamentId).toBe('y1-b-main-01');
    expect(body.player?.pendingMatch?.qualificationSlotUsed).toBeUndefined();
  });

  it('lets rookie players use A-open tickets to bypass stage requirements when signing up', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'A Open Signup Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'rookie',
        year: 1,
        week: 4,
        fame: 10,
        team: {
          clubId: 'dragon-raiders',
          name: '龙腾电竞',
          tag: 'DRG',
          region: 'CN',
          tier: 'semi-pro',
          monthlySalary: 28,
          joinedRound: session.player.round,
        },
        qualificationSlots: { 'a-open': 1 },
        teamQualificationSlots: {},
      },
      leaderboard: [{ name: '龙腾电竞', tag: 'DRG', region: 'CN', points: 4, isPlayer: true }],
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ tournamentId: 'y1-a-open-01' }),
    }, env);
    const body = await res.json() as { player?: GameSession['player']; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.pendingMatch?.tournamentId).toBe('y1-a-open-01');
    expect(body.player?.pendingMatch?.qualificationSlotUsed).toBe('a-open');
  });

  it('allows future preregistration and keeps the middle weeks as normal action weeks', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Future Signup Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'pro',
        year: 1,
        week: 6,
        fame: 40,
        team: {
          clubId: 'dragon-raiders',
          name: '龙腾电竞',
          tag: 'DRG',
          region: 'CN',
          tier: 'pro',
          monthlySalary: 65,
          joinedRound: session.player.round,
        },
        qualificationSlots: {},
        teamQualificationSlots: {},
      },
      leaderboard: [{ name: '龙腾电竞', tag: 'DRG', region: 'CN', points: 20, isPlayer: true }],
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ tournamentId: 'y1-s-main-02' }),
    }, env);
    const body = await res.json() as { player?: GameSession['player']; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.pendingMatch?.tournamentId).toBe('y1-s-main-02');
    expect(body.player?.pendingMatch?.resolveWeek).toBe(14);

    const updatedRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {
      headers: { authorization: `Bearer ${started.apiToken}` },
    }, env);
    const updated = await updatedRes.json() as GameSession & { careerInsight?: import('../../engine/insights/types.js').CareerInsight };
    expect(updated.player.tournamentContext?.phase).toBe('signup');
    expect(updated.careerInsight?.calendarBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'commitment', week: 7, status: '等待比赛' }),
      expect.objectContaining({ kind: 'commitment', week: 13, status: '备赛周' }),
      expect.objectContaining({ kind: 'match', week: 14, status: '比赛周' }),
    ]));
  });

  it('returns housing metadata and lets action-phase players switch housing', async () => {
    const env = makeEnv();
    const metaRes = await app.request('https://localhost/api/game/meta/housing');
    const meta = await metaRes.json() as {
      tiers?: Array<{ id: string; weeklyCost: number; moveCost: number }>;
      homeFacilities?: Array<{ id: string; upgradeCost: number }>;
      cityProfiles?: Array<{ id: string; costMultiplier: number }>;
      weeklyLivingExpense?: number;
      error?: string;
    };

    expect(metaRes.status).toBe(200);
    expect(meta.error).toBeUndefined();
    expect(meta.weeklyLivingExpense).toBe(1);
    expect(meta.tiers?.map((tier) => tier.id)).toEqual([
      'shared-housing',
      'basic-rental',
      'standard-apartment',
      'high-end-apartment',
      'owned-home',
    ]);
    expect(meta.homeFacilities?.map((facility) => facility.id)).toEqual([
      'training-room',
      'review-room',
      'rest-room',
    ]);
    expect(meta.cityProfiles?.map((city) => city.id)).toEqual([
      'local-city',
      'regional-hub',
      'major-hub',
      'low-cost-city',
    ]);

    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Housing Route Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/housing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ tierId: 'basic-rental' }),
    }, env);
    const body = await res.json() as { player?: GameSession['player']; message?: string; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.message).toContain('搬家成本 -6K');
    expect(body.player?.housing?.tier).toBe('basic-rental');
    expect(body.player?.stats.money).toBe(14);
  });

  it('upgrades owned-home facilities through the housing API', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Home Facility Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stats: { ...session.player.stats, money: 50 },
        housing: {
          tier: 'owned-home',
          movedAtRound: 0,
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/home-facility`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ facilityId: 'training-room' }),
    }, env);
    const body = await res.json() as { player?: GameSession['player']; message?: string; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.message).toContain('训练室');
    expect(body.player?.stats.money).toBe(38);
    expect(body.player?.housing?.assets?.facilities.trainingRoom).toBe(1);
  });

  it('runs owned-home asset actions through the housing API', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Home Asset Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stats: { ...session.player.stats, money: 50 },
        housing: {
          tier: 'owned-home',
          movedAtRound: 0,
          cityId: 'regional-hub',
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/home-asset`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({ actionId: 'rent-out' }),
    }, env);
    const body = await res.json() as { player?: GameSession['player']; message?: string; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.message).toContain('出租');
    expect(body.player?.housing?.assets?.rentalActive).toBe(true);
  });

  it('keeps normal session responses free of debug-only payload fields while debug details include them', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Role Debugger',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };

    await app.request(`https://localhost/api/debug/${started.sessionId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${started.apiToken}`,
      },
      body: JSON.stringify({
        roleTransition: {
          targetRole: 'IGL',
          startedRound: 7,
          resolveRound: 10,
        },
      }),
    }, env);

    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const body = await sessionRes.json() as Record<string, unknown>;

    expect(sessionRes.status).toBe(200);
    expect(body).toHaveProperty('careerInsight');
    expect(body).not.toHaveProperty('debugTeamIdentity');
    expect(body).not.toHaveProperty('debugRole');

    const debugSessionRes = await app.request(`https://localhost/api/debug/sessions/${started.sessionId}`, {}, env);
    const debugBody = await debugSessionRes.json() as Record<string, unknown>;

    expect(debugSessionRes.status).toBe(200);
    expect(debugBody).toHaveProperty('careerInsight');
    expect(debugBody).toHaveProperty('debugTeamIdentity');
    expect(debugBody).toHaveProperty('debugRole');
  });

  it('allows trait rolling before a session exists', async () => {
    const res = await app.request('https://localhost/api/game/roll-traits', { method: 'POST' });
    const body = await res.json() as { traits?: unknown[]; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.traits).toHaveLength(3);
  });

  it('uses materialized rival display identity in world club social posts', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Social Rival',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };

    const initialRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const initial = await initialRes.json() as GameSession;
    const withRivalRuntime = activateClubRuntime(initial, 'club-rival-semi', 'test');
    const rival = withRivalRuntime.player.rivals[0]!;
    const runtime = withRivalRuntime.worldClubs!.runtimeByClubId['club-rival-semi']!;
    const seeded: GameSession = {
      ...withRivalRuntime,
      worldClubs: {
        ...withRivalRuntime.worldClubs!,
        runtimeByClubId: {
          ...withRivalRuntime.worldClubs!.runtimeByClubId,
          'club-rival-semi': {
            ...runtime,
            activeStorylines: ['dark-horse-run'],
            updatedRound: withRivalRuntime.player.round,
          },
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const feedRes = await app.request(`https://localhost/api/game/${started.sessionId}/social-feed`, {
      headers: { authorization: `Bearer ${started.apiToken}` },
    }, env, makeExecutionContext());
    const body = await feedRes.json() as { posts?: Array<{ author: string; handle: string; content: string }> };
    const rivalPost = body.posts?.find((post) => post.content.includes(rival.name));

    expect(feedRes.status).toBe(200);
    expect(rivalPost).toBeDefined();
    expect(rivalPost?.author).toBe(`${rival.tag} Watch`);
    expect(rivalPost?.handle).toBe(`@${rival.tag.toLowerCase()}_watch`);
    expect(rivalPost?.author).not.toContain('???');
    expect(rivalPost?.handle).not.toContain('???');
  });

  it('keeps world news out of social feed copy', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Feed Separation Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string; apiToken: string };

    const initialRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const initial = await initialRes.json() as GameSession;
    const seeded: GameSession = {
      ...initial,
      weeklyNews: [{
        id: 'news-1',
        eventId: 'world-tournament-result:test',
        type: 'broadcast',
        title: 'Y1 W12 BLAST Bounty Season 1 开赛',
        narrative: 'BLAST Bounty Season 1 开赛，签表和首轮对阵已经出炉。',
        createdAt: new Date(0).toISOString(),
      }],
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const feedRes = await app.request(`https://localhost/api/game/${started.sessionId}/social-feed`, {
      headers: { authorization: `Bearer ${started.apiToken}` },
    }, env, makeExecutionContext());
    const body = await feedRes.json() as { posts?: Array<{ content: string }> };

    expect(feedRes.status).toBe(200);
    expect(body.posts?.some((post) => post.content.includes('BLAST Bounty Season 1 开赛'))).toBe(false);
  });

  it('updates core stats through the local debug endpoint', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Debug Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };

    const debugRes = await app.request(`https://localhost/api/debug/${started.sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stats: {
          intelligence: 11,
          agility: 12,
          experience: 13,
          mentality: 14,
          constitution: 15,
        },
      }),
    }, env);
    const body = await debugRes.json() as { player?: GameSession['player']; error?: string };

    expect(debugRes.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.stats).toMatchObject({
      intelligence: 11,
      agility: 12,
      experience: 13,
      mentality: 14,
      constitution: 15,
    });
    expect(body.player?.stats.money).toBe(20);
  });

  it('updates the player team and roster through the local debug endpoint', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Team Debugger',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };

    const debugRes = await app.request(`https://localhost/api/debug/${started.sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerTeam: {
          clubId: 'club-debug-unit',
          name: '调试战队',
          tag: 'DBG',
          region: 'CN',
          tier: 'semi-pro',
          monthlySalary: 42,
          joinedRound: 8,
          teamStatus: 'starter',
          joinMode: 'fill-vacancy',
          joinReason: 'debug-only',
        },
        playerRoster: [{
          id: 'tm-debug-1',
          name: 'Alpha',
          role: 'IGL',
          personality: 'supportive',
          growthSpent: 2,
          chemistry: 73,
          visibleIdentity: 'caller',
          identitySinceRound: 8,
          stats: {
            agility: 10,
            intelligence: 11,
            mentality: 12,
            experience: 13,
          },
          traits: ['igl', 'tactical'],
        }],
      }),
    }, env);
    const body = await debugRes.json() as { player?: GameSession['player']; error?: string; leaderboard?: GameSession['leaderboard'] };

    expect(debugRes.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.team).toMatchObject({
      clubId: 'club-debug-unit',
      name: '调试战队',
      tag: 'DBG',
      region: 'CN',
      tier: 'semi-pro',
      monthlySalary: 42,
      joinedRound: 8,
      teamStatus: 'starter',
      joinMode: 'fill-vacancy',
      joinReason: 'debug-only',
    });
    expect(body.player?.roster).toHaveLength(1);
    expect(body.player?.roster?.[0]).toMatchObject({
      id: 'tm-debug-1',
      name: 'Alpha',
      role: 'IGL',
      personality: 'supportive',
      chemistry: 73,
      visibleIdentity: 'caller',
    });
    expect(body.leaderboard?.find((row) => row.isPlayer)?.clubId).toBe('club-debug-unit');
  });

  it('refreshes leaderboard VRS after debug updates the player club VRS', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'VRS Debugger',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };

    const initialRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const initial = await initialRes.json() as GameSession;
    const clubId = 'club-cyber-academy';
    const team = {
      clubId,
      name: '赛博学院',
      tag: 'CYA',
      region: 'CN',
      tier: 'youth' as const,
      monthlySalary: 12,
      joinedRound: initial.player.round,
    };
    await app.request(`https://localhost/api/debug/${started.sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'youth',
        teamTier: 'youth',
        teamMonthlySalary: 12,
      }),
    }, env);

    const seeded: GameSession = {
      ...initial,
      player: {
        ...initial.player,
        stage: 'youth',
        team,
      },
      leaderboard: [],
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const debugRes = await app.request(`https://localhost/api/debug/${started.sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamVrsScore: 33 }),
    }, env);
    const body = await debugRes.json() as { leaderboard?: GameSession['leaderboard']; error?: string };

    expect(debugRes.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.leaderboard?.find((row) => row.isPlayer)?.points).toBe(33);
  });

  it('starts team onboarding event immediately after accepting a team offer', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Offer Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        pendingOffer: {
          clubId: 'club-cyber-academy',
          clubName: '赛博学院',
          tag: 'CYA',
          region: '亚太',
          tier: 'youth',
          monthlySalary: 12,
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/team-response`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.apiToken}`,
      },
      body: JSON.stringify({ accept: true }),
    }, env);
    const body = await res.json() as {
      player?: GameSession['player'];
      phase?: GameSession['phase'];
      currentEvent?: GameSession['currentEvent'];
      activeEventSequence?: GameSession['activeEventSequence'];
      error?: string;
    };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.player?.team).toBeTruthy();
    expect(body.phase).toBe('event');
    expect(body.currentEvent?.id).toBe('chain-team-joined');
    expect(body.activeEventSequence?.type).toBe('team-onboarding');
  });

  it('starts promotion onboarding when accepting a higher-tier team offer from an existing team', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Promotion Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'youth',
        everHadTeam: true,
        team: {
          clubId: 'club-cyber-academy',
          name: '赛博学院',
          tag: 'CYA',
          region: '亚太',
          tier: 'youth',
          monthlySalary: 12,
          joinedRound: session.player.round - 10,
        },
        pendingOffer: {
          clubId: 'club-titan-corp',
          clubName: 'Titan Corp',
          tag: 'TIT',
          region: '欧洲',
          tier: 'semi-pro',
          monthlySalary: 25,
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/team-response`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.apiToken}`,
      },
      body: JSON.stringify({ accept: true }),
    }, env);
    const body = await res.json() as GameSession & { error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.currentEvent?.id).toBe('chain-team-promotion-onboarding');
    expect(body.activeEventSequence?.context).toMatchObject({ onboardingKind: 'promotion' });
  });

  it('starts transfer onboarding when accepting another team offer without a tier promotion', async () => {
    const env = makeEnv();
    const startRes = await app.request('https://localhost/api/game/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Transfer Tester',
        traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      }),
    }, env);
    const started = await startRes.json() as { sessionId: string };
    const sessionRes = await app.request(`https://localhost/api/game/${started.sessionId}`, {}, env);
    const session = await sessionRes.json() as GameSession;
    const seeded: GameSession = {
      ...session,
      player: {
        ...session.player,
        stage: 'second',
        everHadTeam: true,
        team: {
          clubId: 'club-titan-corp',
          name: 'Titan Corp',
          tag: 'TIT',
          region: '欧洲',
          tier: 'semi-pro',
          monthlySalary: 25,
          joinedRound: session.player.round - 12,
        },
        pendingOffer: {
          clubId: 'club-neon-dynasty',
          clubName: 'Neon Dynasty',
          tag: 'NEO',
          region: '亚太',
          tier: 'semi-pro',
          monthlySalary: 26,
        },
      },
    };
    await env.DB.prepare(
      'INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(seeded.id, seeded.player.name, seeded.player.stage, seeded.player.round, seeded.status, seeded.ending ?? null, JSON.stringify(seeded), seeded.createdAt, seeded.updatedAt)
      .run();

    const res = await app.request(`https://localhost/api/game/${started.sessionId}/team-response`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.apiToken}`,
      },
      body: JSON.stringify({ accept: true }),
    }, env);
    const body = await res.json() as GameSession & { error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.currentEvent?.id).toBe('chain-team-transfer-onboarding');
    expect(body.activeEventSequence?.context).toMatchObject({ onboardingKind: 'transfer' });
  });
});
