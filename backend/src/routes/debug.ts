import { Hono } from 'hono';
import { getEventById } from '../data/events/index.js';
import { buildLeaderboard } from '../data/leaderboard.js';
import { LlmLogger } from '../ai/logger.js';
import { makeStorage } from '../storage/index.js';
import { createClubRuntimeState } from '../engine/worldClubs.js';
import {
  aiEventCacheKey,
  aiEventsFromCache,
  legacyAiEventCacheKey,
  parseAiEventCache,
} from '../ai/eventCache.js';
import { computeClubVrsScore } from '../engine/worldClubs.js';
import { normalizeRoleTransition } from '../engine/roleTransition.js';
import type {
  ClubTier,
  Env,
  ForcedMatchResult,
  PendingMatch,
  Stage,
} from '../types.js';

const app = new Hono<{ Bindings: Env }>();

const STAGES: Stage[] = ['rookie', 'youth', 'second', 'pro', 'retired'];
const CLUB_TIERS: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
const FORCED_MATCH_RESULTS: ForcedMatchResult[] = ['win', 'loss'];
const DEBUG_CORE_STATS = ['intelligence', 'agility', 'experience', 'mentality', 'constitution'] as const;

function isLocalDebugRequest(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    return true;
  }
  if (hostname.endsWith('.local')) return true;
  if (hostname.startsWith('192.168.')) return true;
  if (hostname.startsWith('10.')) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function isPendingMatch(value: unknown): value is PendingMatch {
  if (!value || typeof value !== 'object') return false;
  const pendingMatch = value as Record<string, unknown>;
  return typeof pendingMatch.tournamentId === 'string'
    && typeof pendingMatch.tier === 'string'
    && typeof pendingMatch.name === 'string'
    && Number.isInteger(pendingMatch.resolveYear)
    && Number.isInteger(pendingMatch.resolveWeek)
    && Number.isInteger(pendingMatch.stageIndex);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

app.post('/debug/:sessionId', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) {
    return c.json({ error: 'not found' }, 404);
  }

  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);

  if (!session) return c.json({ error: 'session not found' }, 404);
  if (session.activeEventSequence?.status === 'active' && Object.keys(body ?? {}).length > 0) {
    return c.json({ error: '当前事件流程未结束，不能通过 debug 修改 session' }, 400);
  }

  const {
    money,
    stage,
    fame,
    stress,
    ownedItems,
    round,
    consecutiveLosses,
    pendingMatch,
    forceNextEvent,
    forceMatchResult,
    roleTransition,
    stats,
    tags,
    teamMonthlySalary,
    teamTier,
    teamVrsScore,
  } = body ?? {};

  if (money !== undefined && !Number.isFinite(money)) {
    return c.json({ error: 'money 必须是数字' }, 400);
  }
  if (stage !== undefined && (typeof stage !== 'string' || !STAGES.includes(stage as Stage))) {
    return c.json({ error: 'stage 无效' }, 400);
  }
  if (fame !== undefined && !Number.isFinite(fame)) {
    return c.json({ error: 'fame 必须是数字' }, 400);
  }
  if (stress !== undefined && !Number.isFinite(stress)) {
    return c.json({ error: 'stress 必须是数字' }, 400);
  }
  if (ownedItems !== undefined && (!Array.isArray(ownedItems) || ownedItems.some((item) => typeof item !== 'string'))) {
    return c.json({ error: 'ownedItems 必须是字符串数组' }, 400);
  }
  if (round !== undefined && !Number.isInteger(round)) {
    return c.json({ error: 'round 必须是整数' }, 400);
  }
  if (consecutiveLosses !== undefined && (!Number.isInteger(consecutiveLosses) || consecutiveLosses < 0)) {
    return c.json({ error: 'consecutiveLosses 必须是非负整数' }, 400);
  }
  if (pendingMatch !== undefined && pendingMatch !== null && !isPendingMatch(pendingMatch)) {
    return c.json({ error: 'pendingMatch 结构无效' }, 400);
  }
  if (forceNextEvent !== undefined) {
    if (forceNextEvent !== null && (typeof forceNextEvent !== 'string' || !getEventById(forceNextEvent))) {
      return c.json({ error: 'forceNextEvent 无效' }, 400);
    }
  }
  if (forceMatchResult !== undefined) {
    if (forceMatchResult !== null && (typeof forceMatchResult !== 'string' || !FORCED_MATCH_RESULTS.includes(forceMatchResult as ForcedMatchResult))) {
      return c.json({ error: 'forceMatchResult 必须为 win 或 loss' }, 400);
    }
  }
  if (stats !== undefined) {
    if (!isObject(stats)) {
      return c.json({ error: 'stats 必须是对象' }, 400);
    }
    const allowed = new Set<string>(DEBUG_CORE_STATS);
    for (const [key, value] of Object.entries(stats)) {
      if (!allowed.has(key)) {
        return c.json({ error: `stats.${key} 不支持调试修改` }, 400);
      }
      if (!Number.isFinite(value)) {
        return c.json({ error: `stats.${key} 必须是数字` }, 400);
      }
    }
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    return c.json({ error: 'tags 必须是字符串数组' }, 400);
  }
  if (roleTransition !== undefined) {
    if (
      roleTransition !== null &&
      (
        !isObject(roleTransition) ||
        typeof roleTransition.targetRole !== 'string' ||
        !Number.isInteger(roleTransition.startedRound) ||
        !Number.isInteger(roleTransition.resolveRound)
      )
    ) {
      return c.json({ error: 'roleTransition 结构无效' }, 400);
    }
  }

  if ((teamMonthlySalary !== undefined || teamTier !== undefined || teamVrsScore !== undefined) && !session.player.team) {
    return c.json({ error: '玩家当前没有战队，不能覆盖战队合同字段' }, 400);
  }
  if (teamMonthlySalary !== undefined && !Number.isFinite(teamMonthlySalary)) {
    return c.json({ error: 'teamMonthlySalary 必须是数字' }, 400);
  }
  if (teamTier !== undefined && (typeof teamTier !== 'string' || !CLUB_TIERS.includes(teamTier as ClubTier))) {
    return c.json({ error: 'teamTier 无效' }, 400);
  }
  if (teamVrsScore !== undefined && (!Number.isFinite(teamVrsScore) || teamVrsScore < 0)) {
    return c.json({ error: 'teamVrsScore 必须是非负数字' }, 400);
  }

  if (money !== undefined) session.player.stats.money = money;
  if (stage !== undefined) session.player.stage = stage;
  if (fame !== undefined) session.player.fame = fame;
  if (stress !== undefined) session.player.stress = stress;
  if (ownedItems !== undefined) session.player.ownedItems = [...new Set(ownedItems as string[])];
  if (tags !== undefined) session.player.tags = [...new Set((tags as string[]).map((tag) => tag.trim()).filter(Boolean))];
  if (round !== undefined) session.player.round = round;
  if (consecutiveLosses !== undefined) session.player.consecutiveLosses = consecutiveLosses;
  if (pendingMatch !== undefined) session.player.pendingMatch = pendingMatch;
  if (forceNextEvent !== undefined) session.player.forceNextEvent = forceNextEvent === null ? null : forceNextEvent;
  if (forceMatchResult !== undefined) session.player.forceMatchResult = forceMatchResult === null ? null : forceMatchResult;
  if (roleTransition !== undefined) session.player.roleTransition = normalizeRoleTransition(roleTransition as never);
  if (stats !== undefined && isObject(stats)) {
    for (const key of DEBUG_CORE_STATS) {
      const value = stats[key];
      if (value !== undefined && typeof value === 'number') {
        session.player.stats[key] = value;
      }
    }
  }

  if (session.player.team) {
    if (teamMonthlySalary !== undefined) session.player.team.monthlySalary = teamMonthlySalary;
    if (teamTier !== undefined) session.player.team.tier = teamTier;
    if (teamVrsScore !== undefined) {
      const clubId = session.player.team.clubId;
      const worldClubs = session.worldClubs ?? {
        season: session.player.year ?? 1,
        activeClubIds: [],
        relevantClubIds: [],
        staticClubIds: [],
        runtimeByClubId: {},
        processedTickKeysByClubId: {},
      };
      const existing = worldClubs.runtimeByClubId[clubId] ?? createClubRuntimeState(session, clubId);
      const targetVrs = Math.round(teamVrsScore);
      const computedWithoutBaseline = computeClubVrsScore({
        ...existing,
        baselineVrsScore: 0,
      });
      worldClubs.runtimeByClubId[clubId] = {
        ...existing,
        baselineVrsScore: targetVrs - computedWithoutBaseline,
        vrsScore: targetVrs,
        updatedRound: session.player.round ?? existing.updatedRound,
      };
      if (!worldClubs.activeClubIds.includes(clubId)) worldClubs.activeClubIds = [...worldClubs.activeClubIds, clubId];
      session.worldClubs = worldClubs;
      session.leaderboard = buildLeaderboard(session);
    }
  }

  session.updatedAt = new Date().toISOString();
  await storage.sessions.save(session);

  return c.json({ player: session.player, leaderboard: session.leaderboard });
});

app.get('/debug/sessions', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) return c.json({ error: 'not found' }, 404);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '200', 10) || 200, 500);
  const storage = makeStorage(c.env);
  const sessions = await storage.sessions.list(limit);
  return c.json({ sessions, total: sessions.length });
});

// ── LLM log endpoints (local-only) ───────────────────────────────

app.get('/debug/llm-logs', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) return c.json({ error: 'not found' }, 404);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);
  const logger = new LlmLogger(c.env.KV);
  const logs = await logger.listRecent(limit);
  return c.json({ logs, total: logs.length });
});

app.get('/debug/llm-logs/:id', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) return c.json({ error: 'not found' }, 404);

  const logger = new LlmLogger(c.env.KV);
  const entry = await logger.getById(c.req.param('id'));
  if (!entry) return c.json({ error: 'not found' }, 404);
  return c.json(entry);
});

// Write a synthetic log entry to verify the KV pipeline is working end-to-end
app.post('/debug/llm-logs/test', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) return c.json({ error: 'not found' }, 404);

  const logger = new LlmLogger(c.env.KV);
  await logger.log({
    method: 'test',
    provider: 'debug',
    model: 'test-model',
    systemPrompt: '这是一条测试 system prompt，用来验证 KV 日志管道正常工作。',
    userPrompt: '这是一条测试 user prompt。',
    response: '这是一条测试 response，如果你能在调试面板看到这条记录，说明日志管道工作正常。',
    latencyMs: 42,
    stream: false,
  });
  return c.json({ ok: true, message: '测试日志已写入，请刷新调试面板' });
});

// Current AI provider info (does not require local-only)
app.get('/debug/ai-status', (c) => {
  const provider = c.env.AI_PROVIDER ?? 'none';
  const active = provider !== 'none'
    && ((provider === 'anthropic' && !!c.env.ANTHROPIC_API_KEY)
      || (provider === 'openai' && !!c.env.OPENAI_API_KEY));
  return c.json({
    provider,
    model: c.env.AI_MODEL ?? null,
    active,
    kvBound: !!c.env.KV,
  });
});

app.get('/debug/ai-events/:sessionId', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) return c.json({ error: 'not found' }, 404);

  const id = c.req.param('sessionId');
  try {
    const storage = makeStorage(c.env);
    const session = await storage.sessions.load(id);
    if (!session) return c.json({ error: 'session not found' }, 404);

    const cached = await c.env.KV.get(aiEventCacheKey(id));
    const legacy = cached ? null : await c.env.KV.get(legacyAiEventCacheKey(id));
    const source = cached ? 'v2' : legacy ? 'legacy' : null;
    if (!cached && !legacy) return c.json({ events: [], message: 'KV 中无此 session 的 AI 事件' });
    const parsed = parseAiEventCache(cached ?? legacy, session.player, session.history);
    const events = aiEventsFromCache(parsed.cache);
    return c.json({
      source,
      active: parsed.cache.active,
      events,
      entries: parsed.cache.entries,
      validCount: events.length,
      invalidCount: parsed.invalid.length,
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

export default app;
