import { describe, expect, it } from 'vitest';
import app from '../../index.js';
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

  it('allows trait rolling before a session exists', async () => {
    const res = await app.request('https://localhost/api/game/roll-traits', { method: 'POST' });
    const body = await res.json() as { traits?: unknown[]; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.traits).toHaveLength(3);
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
    expect(body.player?.stats.money).toBe(0);
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
