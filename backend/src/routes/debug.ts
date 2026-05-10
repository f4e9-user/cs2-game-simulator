import { Hono } from 'hono';
import { getEventById } from '../data/events/index.js';
import { LlmLogger } from '../ai/logger.js';
import { makeStorage } from '../storage/index.js';
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

app.post('/debug/:sessionId', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) {
    return c.json({ error: 'not found' }, 404);
  }

  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);

  if (!session) return c.json({ error: 'session not found' }, 404);

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
    teamMonthlySalary,
    teamTier,
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
    if (typeof forceNextEvent !== 'string' || !getEventById(forceNextEvent)) {
      return c.json({ error: 'forceNextEvent 无效' }, 400);
    }
  }
  if (forceMatchResult !== undefined) {
    if (typeof forceMatchResult !== 'string' || !FORCED_MATCH_RESULTS.includes(forceMatchResult as ForcedMatchResult)) {
      return c.json({ error: 'forceMatchResult 必须为 win 或 loss' }, 400);
    }
  }

  if ((teamMonthlySalary !== undefined || teamTier !== undefined) && !session.player.team) {
    return c.json({ error: '玩家当前没有战队，不能覆盖战队合同字段' }, 400);
  }
  if (teamMonthlySalary !== undefined && !Number.isFinite(teamMonthlySalary)) {
    return c.json({ error: 'teamMonthlySalary 必须是数字' }, 400);
  }
  if (teamTier !== undefined && (typeof teamTier !== 'string' || !CLUB_TIERS.includes(teamTier as ClubTier))) {
    return c.json({ error: 'teamTier 无效' }, 400);
  }

  if (money !== undefined) session.player.stats.money = money;
  if (stage !== undefined) session.player.stage = stage;
  if (fame !== undefined) session.player.fame = fame;
  if (stress !== undefined) session.player.stress = stress;
  if (ownedItems !== undefined) session.player.ownedItems = [...new Set(ownedItems as string[])];
  if (round !== undefined) session.player.round = round;
  if (consecutiveLosses !== undefined) session.player.consecutiveLosses = consecutiveLosses;
  if (pendingMatch !== undefined) session.player.pendingMatch = pendingMatch;
  if (forceNextEvent !== undefined) session.player.forceNextEvent = forceNextEvent;
  if (forceMatchResult !== undefined) session.player.forceMatchResult = forceMatchResult;

  if (session.player.team) {
    if (teamMonthlySalary !== undefined) session.player.team.monthlySalary = teamMonthlySalary;
    if (teamTier !== undefined) session.player.team.tier = teamTier;
  }

  session.updatedAt = new Date().toISOString();
  await storage.sessions.save(session);

  return c.json({ player: session.player });
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

export default app;
