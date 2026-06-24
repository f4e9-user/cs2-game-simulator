import { describe, expect, it } from 'vitest';
import app from '../../index.js';
import { activateClubRuntime } from '../../engine/worldClubs.js';
import type { Env, GameSession } from '../../types.js';

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
