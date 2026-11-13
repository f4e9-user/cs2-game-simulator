import { Hono } from 'hono';
import { getEventById } from '../data/events/index.js';
import { buildLeaderboard } from '../data/leaderboard.js';
import { LlmLogger } from '../ai/logger.js';
import { makeStorage } from '../storage/index.js';
import { createClubRuntimeState } from '../engine/worldClubs.js';
import { buildSessionPayload } from '../engine/insights/index.js';
import { buildRoleDebug, buildTeamIdentityDebug } from '../engine/debugPayload.js';
import { detectRoleOverlap } from '../engine/team.js';
import { refreshVisibleTeamIdentities } from '../engine/teamIdentity.js';
import {
  aiEventCacheKey,
  aiEventsFromCache,
  legacyAiEventCacheKey,
  parseAiEventCache,
} from '../ai/eventCache.js';
import { computeClubVrsScore } from '../engine/worldClubs.js';
import { normalizeRoleTransition } from '../engine/roleTransition.js';
import { finalizeGameSessionCareerSnapshot } from '../engine/careerSnapshot.js';
import type {
  ClubTier,
  Env,
  ForcedMatchResult,
  PendingMatch,
  Stage,
  ClubRuntimeState,
  PlayerTeam,
  Teammate,
  WorldPlayer,
} from '../types.js';

const app = new Hono<{ Bindings: Env }>();

const STAGES: Stage[] = ['rookie', 'youth', 'second', 'pro', 'retired'];
const CLUB_TIERS: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
const TEAM_STATUSES: NonNullable<PlayerTeam['teamStatus']>[] = ['starter', 'trial', 'rotation'];
const PLAYER_JOIN_MODES: NonNullable<PlayerTeam['joinMode']>[] = ['replace-starter', 'fill-vacancy', 'trial-sixth', 'rotation'];
const TEAM_PERSONALITIES = ['strict', 'supportive', 'star', 'grinder', 'drama'] as const;
const TEAM_ROLES = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'] as const;
const TEAM_IDENTITIES = ['caller', 'star', 'glue', 'problem', 'veteran', 'rookie', 'star-caller'] as const;
const FORCED_MATCH_RESULTS: ForcedMatchResult[] = ['win', 'loss'];
const DEBUG_CORE_STATS = ['intelligence', 'agility', 'experience', 'mentality', 'constitution'] as const;
const DEBUG_PLAYER_STAT_KEYS = ['agility', 'intelligence', 'mentality', 'experience'] as const;

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

function isWorldPlayer(value: unknown): value is WorldPlayer {
  if (!isObject(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.region === 'string'
    && Number.isFinite(value.age)
    && typeof value.clubId === 'string'
    && typeof value.role === 'string'
    && isObject(value.stats)
    && DEBUG_PLAYER_STAT_KEYS.every((key) => Number.isFinite((value.stats as Record<string, unknown>)[key]))
    && Number.isFinite((value.stats as Record<string, unknown>).constitution)
    && typeof value.archetype === 'string'
    && Number.isFinite(value.form)
    && Number.isFinite(value.reputation)
    && Array.isArray(value.traits)
    && value.traits.every((trait) => typeof trait === 'string')
    && typeof value.personality === 'string'
    && Number.isFinite(value.joinedRound)
    && typeof value.status === 'string';
}

function normalizeWorldPlayerPatch(player: WorldPlayer, patch: unknown): WorldPlayer {
  if (!isObject(patch)) return player;
  const next: WorldPlayer = {
    ...player,
    ...('id' in patch && typeof patch.id === 'string' ? { id: patch.id } : {}),
    ...('name' in patch && typeof patch.name === 'string' ? { name: patch.name } : {}),
    ...('region' in patch && typeof patch.region === 'string' ? { region: patch.region } : {}),
    ...('age' in patch && Number.isFinite(patch.age) ? { age: Math.round(Number(patch.age)) } : {}),
    ...('clubId' in patch && typeof patch.clubId === 'string' ? { clubId: patch.clubId } : {}),
    ...('role' in patch && typeof patch.role === 'string' ? { role: patch.role as WorldPlayer['role'] } : {}),
    ...('personality' in patch && typeof patch.personality === 'string' ? { personality: patch.personality as WorldPlayer['personality'] } : {}),
    ...('joinedRound' in patch && Number.isFinite(patch.joinedRound) ? { joinedRound: Math.round(Number(patch.joinedRound)) } : {}),
    ...('status' in patch && typeof patch.status === 'string' ? { status: patch.status as WorldPlayer['status'] } : {}),
    ...('archetype' in patch && typeof patch.archetype === 'string' ? { archetype: patch.archetype as WorldPlayer['archetype'] } : {}),
    ...('form' in patch && Number.isFinite(patch.form) ? { form: Number(patch.form) } : {}),
    ...('reputation' in patch && Number.isFinite(patch.reputation) ? { reputation: Number(patch.reputation) } : {}),
    ...('internalChemistry' in patch && patch.internalChemistry !== undefined ? { internalChemistry: Number(patch.internalChemistry) } : {}),
  };
  if (isObject(patch.stats)) {
    next.stats = {
      ...player.stats,
      ...Object.fromEntries(
        [...DEBUG_PLAYER_STAT_KEYS, 'constitution' as const]
          .filter((key) => patch.stats && Number.isFinite((patch.stats as Record<string, unknown>)[key]))
          .map((key) => [key, Number((patch.stats as Record<string, unknown>)[key])]),
      ),
    };
  }
  if (Array.isArray((patch as { traits?: unknown }).traits)) {
    next.traits = (patch as { traits: unknown[] }).traits.filter((trait): trait is string => typeof trait === 'string');
  }
  return next;
}

function isTeammate(value: unknown): value is Teammate {
  if (!isObject(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.role === 'string'
    && TEAM_ROLES.includes(value.role as Teammate['role'])
    && typeof value.personality === 'string'
    && TEAM_PERSONALITIES.includes(value.personality as NonNullable<Teammate['personality']>)
    && isObject(value.stats)
    && DEBUG_PLAYER_STAT_KEYS.every((key) => Number.isFinite((value.stats as Record<string, unknown>)[key]))
    && Array.isArray(value.traits)
    && value.traits.every((trait) => typeof trait === 'string')
    && Number.isFinite(value.growthSpent)
    && (value.chemistry === undefined || Number.isFinite(value.chemistry))
    && (value.visibleIdentity === undefined || (typeof value.visibleIdentity === 'string' && TEAM_IDENTITIES.includes(value.visibleIdentity as (typeof TEAM_IDENTITIES)[number])))
    && (value.identitySinceRound === undefined || Number.isInteger(value.identitySinceRound));
}

function normalizeTeammatePatch(teammate: Teammate, patch: unknown): Teammate {
  if (!isObject(patch)) return teammate;
  const next: Teammate = {
    ...teammate,
    ...('id' in patch && typeof patch.id === 'string' ? { id: patch.id } : {}),
    ...('name' in patch && typeof patch.name === 'string' ? { name: patch.name } : {}),
    ...('role' in patch && typeof patch.role === 'string' ? { role: patch.role as Teammate['role'] } : {}),
    ...('personality' in patch && typeof patch.personality === 'string' ? { personality: patch.personality as Teammate['personality'] } : {}),
    ...('growthSpent' in patch && Number.isFinite(patch.growthSpent) ? { growthSpent: Math.max(0, Math.round(Number(patch.growthSpent))) } : {}),
    ...('chemistry' in patch && Number.isFinite(patch.chemistry) ? { chemistry: Math.round(Number(patch.chemistry)) } : {}),
    ...('visibleIdentity' in patch && typeof patch.visibleIdentity === 'string' ? { visibleIdentity: patch.visibleIdentity as Teammate['visibleIdentity'] } : {}),
    ...('identitySinceRound' in patch && Number.isInteger(patch.identitySinceRound) ? { identitySinceRound: Math.round(Number(patch.identitySinceRound)) } : {}),
  };
  if (isObject(patch.stats)) {
    next.stats = {
      ...teammate.stats,
      ...Object.fromEntries(
        DEBUG_PLAYER_STAT_KEYS
          .filter((key) => patch.stats && Number.isFinite((patch.stats as Record<string, unknown>)[key]))
          .map((key) => [key, Number((patch.stats as Record<string, unknown>)[key])]),
      ),
    };
  }
  if (Array.isArray((patch as { traits?: unknown }).traits)) {
    next.traits = (patch as { traits: unknown[] }).traits.filter((trait): trait is string => typeof trait === 'string');
  }
  return next;
}

function normalizePlayerTeamPatch(team: PlayerTeam | null, patch: unknown): PlayerTeam | null {
  if (patch === null) return null;
  if (!isObject(patch)) return team;
  const base: PlayerTeam = team ?? {
    clubId: '',
    name: '',
    tag: '',
    region: '',
    tier: 'youth',
    monthlySalary: 0,
    joinedRound: 0,
  };
  const next: PlayerTeam = {
    ...base,
    ...('clubId' in patch && typeof patch.clubId === 'string' ? { clubId: patch.clubId } : {}),
    ...('name' in patch && typeof patch.name === 'string' ? { name: patch.name } : {}),
    ...('tag' in patch && typeof patch.tag === 'string' ? { tag: patch.tag } : {}),
    ...('region' in patch && typeof patch.region === 'string' ? { region: patch.region } : {}),
    ...('tier' in patch && typeof patch.tier === 'string' ? { tier: patch.tier as ClubTier } : {}),
    ...('monthlySalary' in patch && Number.isFinite(patch.monthlySalary) ? { monthlySalary: Math.round(Number(patch.monthlySalary)) } : {}),
    ...('joinedRound' in patch && Number.isFinite(patch.joinedRound) ? { joinedRound: Math.round(Number(patch.joinedRound)) } : {}),
    ...('teamStatus' in patch && typeof patch.teamStatus === 'string' ? { teamStatus: patch.teamStatus as PlayerTeam['teamStatus'] } : {}),
    ...('teamStatusUntilRound' in patch && Number.isInteger(patch.teamStatusUntilRound) ? { teamStatusUntilRound: Math.round(Number(patch.teamStatusUntilRound)) } : {}),
    ...('joinMode' in patch && typeof patch.joinMode === 'string' ? { joinMode: patch.joinMode as PlayerTeam['joinMode'] } : {}),
    ...('joinReason' in patch && typeof patch.joinReason === 'string' ? { joinReason: patch.joinReason } : {}),
  };
  return next;
}

function normalizePlayerRosterPatch(roster: Teammate[] | null, patch: unknown): Teammate[] | null {
  if (patch === null) return null;
  if (!Array.isArray(patch)) return roster;
  const baseRoster = roster ?? [];
  return patch
    .map((item, index) => {
      if (isTeammate(item)) return item;
      if (!isObject(item)) return null;
      const base = baseRoster[index];
      return base ? normalizeTeammatePatch(base, item) : null;
    })
    .filter((item): item is Teammate => Boolean(item));
}

function applyClubRuntimePatch(runtime: ClubRuntimeState, patch: unknown): ClubRuntimeState {
  if (!isObject(patch)) return runtime;
  const next: ClubRuntimeState = { ...runtime };
  if (patch.clubTrust !== undefined && Number.isFinite(patch.clubTrust)) next.clubTrust = Math.round(Number(patch.clubTrust));
  if (patch.currentForm !== undefined && Number.isFinite(patch.currentForm)) next.currentForm = Math.round(Number(patch.currentForm));
  if (patch.rosterStability !== undefined && Number.isFinite(patch.rosterStability)) next.rosterStability = Math.round(Number(patch.rosterStability));
  if (patch.internalChemistry !== undefined && Number.isFinite(patch.internalChemistry)) next.internalChemistry = Math.round(Number(patch.internalChemistry));
  if (patch.vrsScore !== undefined && Number.isFinite(patch.vrsScore)) next.vrsScore = Math.round(Number(patch.vrsScore));
  if (Array.isArray((patch as { fullRoster?: unknown }).fullRoster)) {
    const roster = (patch as { fullRoster: unknown[] }).fullRoster;
    next.fullRoster = roster
      .map((item, index) => {
        if (isWorldPlayer(item)) return item;
        if (!isObject(item)) return null;
        const base = runtime.fullRoster[index];
        return base ? normalizeWorldPlayerPatch(base, item) : null;
      })
      .filter((item): item is WorldPlayer => Boolean(item));
  }
  return next;
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
    playerTeam,
    playerRoster,
    teamMonthlySalary,
    teamTier,
    teamVrsScore,
    worldClubUpdates,
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
  if (playerTeam !== undefined && playerTeam !== null && !isObject(playerTeam)) {
    return c.json({ error: 'playerTeam 必须是对象或 null' }, 400);
  }
  if (playerRoster !== undefined && playerRoster !== null) {
    if (!Array.isArray(playerRoster)) {
      return c.json({ error: 'playerRoster 必须是数组或 null' }, 400);
    }
    for (const [index, teammate] of playerRoster.entries()) {
      if (teammate !== null && !isObject(teammate)) {
        return c.json({ error: `playerRoster[${index}] 必须是对象或 null` }, 400);
      }
    }
  }

  const nextPlayerTeam = playerTeam !== undefined
    ? normalizePlayerTeamPatch(session.player.team, playerTeam)
    : session.player.team;

  if ((teamMonthlySalary !== undefined || teamTier !== undefined || teamVrsScore !== undefined) && !nextPlayerTeam) {
    return c.json({ error: '玩家当前没有战队，不能覆盖战队合同字段' }, 400);
  }
  if (nextPlayerTeam) {
    if (nextPlayerTeam.clubId.trim() === '' || nextPlayerTeam.name.trim() === '' || nextPlayerTeam.tag.trim() === '' || nextPlayerTeam.region.trim() === '') {
      return c.json({ error: 'playerTeam 的 clubId/name/tag/region 不能为空' }, 400);
    }
    if (!CLUB_TIERS.includes(nextPlayerTeam.tier)) {
      return c.json({ error: 'playerTeam.tier 无效' }, 400);
    }
    if (!Number.isFinite(nextPlayerTeam.monthlySalary) || nextPlayerTeam.monthlySalary < 0) {
      return c.json({ error: 'playerTeam.monthlySalary 必须是非负数字' }, 400);
    }
    if (!Number.isInteger(nextPlayerTeam.joinedRound)) {
      return c.json({ error: 'playerTeam.joinedRound 必须是整数' }, 400);
    }
    if (nextPlayerTeam.teamStatus !== undefined && !TEAM_STATUSES.includes(nextPlayerTeam.teamStatus)) {
      return c.json({ error: 'playerTeam.teamStatus 无效' }, 400);
    }
    if (nextPlayerTeam.joinMode !== undefined && !PLAYER_JOIN_MODES.includes(nextPlayerTeam.joinMode)) {
      return c.json({ error: 'playerTeam.joinMode 无效' }, 400);
    }
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
  if (worldClubUpdates !== undefined) {
    if (!isObject(worldClubUpdates)) {
      return c.json({ error: 'worldClubUpdates 必须是对象' }, 400);
    }
    for (const [clubId, patch] of Object.entries(worldClubUpdates)) {
      if (typeof clubId !== 'string' || !clubId) {
        return c.json({ error: 'worldClubUpdates 的 key 必须是战队 ID' }, 400);
      }
      if (patch !== null && !isObject(patch)) {
        return c.json({ error: `worldClubUpdates.${clubId} 必须是对象` }, 400);
      }
    }
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

  if (playerTeam !== undefined) {
    session.player.team = nextPlayerTeam;
  }
  if (playerRoster !== undefined) {
    session.player.roster = normalizePlayerRosterPatch(session.player.roster, playerRoster);
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
    }
  }

  if (worldClubUpdates !== undefined) {
    const worldClubs = session.worldClubs ?? {
      season: session.player.year ?? 1,
      activeClubIds: [],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {},
      processedTickKeysByClubId: {},
    };
    for (const [clubId, patch] of Object.entries(worldClubUpdates as Record<string, unknown>)) {
      const existing = worldClubs.runtimeByClubId[clubId] ?? createClubRuntimeState(session, clubId);
      worldClubs.runtimeByClubId[clubId] = applyClubRuntimePatch(existing, patch);
      if (!worldClubs.activeClubIds.includes(clubId)) {
        worldClubs.activeClubIds = [...worldClubs.activeClubIds, clubId];
      }
    }
    session.worldClubs = worldClubs;
  }

  session.player = refreshVisibleTeamIdentities(session.player, true);
  if (session.player.team) {
    session.player.team = {
      ...session.player.team,
      roleOverlap: detectRoleOverlap(session.player, session.player.roster ?? []),
    };
  }
  session.leaderboard = buildLeaderboard(session);

  session.updatedAt = new Date().toISOString();
  await storage.sessions.save(finalizeGameSessionCareerSnapshot(session));

  return c.json({ player: session.player, leaderboard: session.leaderboard });
});

app.get('/debug/sessions/:sessionId', async (c) => {
  if (!isLocalDebugRequest(c.req.url)) {
    return c.json({ error: 'not found' }, 404);
  }

  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);

  if (!session) return c.json({ error: 'session not found' }, 404);
  return c.json(buildSessionPayload(session, {
    phase: session.phase,
    debugTeamIdentity: buildTeamIdentityDebug(session.player),
    debugRole: buildRoleDebug(session.player, session.history),
    includeDebugFields: true,
  }));
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
