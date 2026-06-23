import type { EventDef, EventType, Player, RoundResult } from '../types.js';
import { validateAiEvents } from '../validation/guard.js';

export const AI_EVENT_CACHE_KEY_PREFIX = 'ai-events-v2';
export const LEGACY_AI_EVENT_CACHE_KEY_PREFIX = 'ai-events';
export const AI_EVENT_CACHE_VERSION = 2;
export const MAX_AI_EVENT_CACHE = 6;
export const AI_EVENT_TTL_ROUNDS = 24;
export const AI_EVENT_PICK_COOLDOWN = 8;
export const AI_EVENT_MAX_USES = 2;

const AI_EVENT_CATEGORIES = new Set(['stress', 'team', 'media', 'rival', 'life', 'tournament-context']);

export type AiEventCategory = 'stress' | 'team' | 'media' | 'rival' | 'life' | 'tournament-context';

export interface AiEventTriggerSnapshot {
  stress: number;
  fatigue: number;
  fame: number;
  teamTrust: number | null;
  hasTeam: boolean;
  teamClubId: string | null;
  hasRival: boolean;
  lastMatchResult?: 'win' | 'loss';
}

export interface AiEventMeta {
  category: AiEventCategory;
  generatedRound: number;
  generatedFor: AiEventTriggerSnapshot;
  usedCount: number;
  lastPickedRound: number | null;
}

export interface CachedAiEvent {
  event: EventDef;
  meta: AiEventMeta;
}

export interface AiEventCacheEnvelope {
  version: typeof AI_EVENT_CACHE_VERSION;
  active: CachedAiEvent | null;
  entries: CachedAiEvent[];
}

export interface AiEventPickCandidate {
  event: EventDef;
  weightMultiplier: number;
}

export interface ParsedAiEventCache {
  cache: AiEventCacheEnvelope;
  migrated: boolean;
  invalid: unknown[];
}

export function aiEventCacheKey(sessionId: string): string {
  return `${AI_EVENT_CACHE_KEY_PREFIX}:${sessionId}`;
}

export function legacyAiEventCacheKey(sessionId: string): string {
  return `${LEGACY_AI_EVENT_CACHE_KEY_PREFIX}:${sessionId}`;
}

export function emptyAiEventCache(): AiEventCacheEnvelope {
  return {
    version: AI_EVENT_CACHE_VERSION,
    active: null,
    entries: [],
  };
}

export function createAiEventTriggerSnapshot(player: Player, history: RoundResult[] = []): AiEventTriggerSnapshot {
  const lastMatch = [...history].reverse().find((r) => r.eventId.startsWith('tournament-') || r.eventType === 'match');
  return {
    stress: player.stress ?? 0,
    fatigue: player.volatile?.fatigue ?? 0,
    fame: player.fame ?? 0,
    teamTrust: player.team ? (player.teamTrust ?? null) : null,
    hasTeam: Boolean(player.team),
    teamClubId: player.team?.clubId ?? null,
    hasRival: (player.rivals ?? []).length > 0,
    lastMatchResult: lastMatch ? (lastMatch.success ? 'win' : 'loss') : undefined,
  };
}

export function makeCachedAiEvent(event: EventDef, player: Player, history: RoundResult[] = []): CachedAiEvent {
  return {
    event,
    meta: {
      category: eventCategory(event.type),
      generatedRound: player.round ?? 0,
      generatedFor: createAiEventTriggerSnapshot(player, history),
      usedCount: 0,
      lastPickedRound: null,
    },
  };
}

export function parseAiEventCache(raw: string | null, player: Player, history: RoundResult[] = []): ParsedAiEventCache {
  if (!raw) return { cache: emptyAiEventCache(), migrated: false, invalid: [] };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isEnvelopeLike(parsed)) {
      const invalid: unknown[] = [];
      const active = parseCachedEntry(parsed.active, player, history, invalid);
      const entries = Array.isArray(parsed.entries)
        ? parsed.entries.flatMap((entry) => {
            const cached = parseCachedEntry(entry, player, history, invalid);
            return cached ? [cached] : [];
          })
        : [];
      return {
        cache: {
          version: AI_EVENT_CACHE_VERSION,
          active,
          entries: dedupeCachedEntries(entries),
        },
        migrated: false,
        invalid,
      };
    }

    const { valid, invalid } = validateAiEvents(Array.isArray(parsed) ? parsed : []);
    return {
      cache: {
        version: AI_EVENT_CACHE_VERSION,
        active: null,
        entries: valid.map((event) => makeCachedAiEvent(event, player, history)),
      },
      migrated: valid.length > 0 || invalid.length > 0,
      invalid,
    };
  } catch {
    return { cache: emptyAiEventCache(), migrated: false, invalid: raw ? [raw] : [] };
  }
}

export function mergeGeneratedAiEvents(
  cache: AiEventCacheEnvelope,
  generated: EventDef[],
  player: Player,
  history: RoundResult[] = [],
): AiEventCacheEnvelope {
  const generatedEntries = generated.map((event) => makeCachedAiEvent(event, player, history));
  const byId = new Map<string, CachedAiEvent>();

  for (const entry of pruneAiEventEntries(cache.entries, player)) {
    byId.set(entry.event.id, entry);
  }
  for (const entry of generatedEntries) {
    byId.set(entry.event.id, entry);
  }

  const activeId = cache.active?.event.id;
  const entries = [...byId.values()]
    .filter((entry) => entry.event.id !== activeId)
    .sort(compareCachePriority(player.round ?? 0))
    .slice(0, MAX_AI_EVENT_CACHE);

  return {
    version: AI_EVENT_CACHE_VERSION,
    active: cache.active,
    entries,
  };
}

export function markAiEventActive(cache: AiEventCacheEnvelope, event: EventDef | null): AiEventCacheEnvelope {
  if (!event?.id.startsWith('ai-')) {
    return { ...cache, active: null };
  }

  const fromCache = cache.entries.find((entry) => entry.event.id === event.id);
  const active = fromCache ?? (cache.active?.event.id === event.id ? cache.active : null);
  return {
    version: AI_EVENT_CACHE_VERSION,
    active,
    entries: cache.entries.filter((entry) => entry.event.id !== event.id),
  };
}

export function resolveAiEventById(cache: AiEventCacheEnvelope | null | undefined, eventId: string): EventDef | undefined {
  if (!cache) return undefined;
  if (cache.active?.event.id === eventId) return cache.active.event;
  return cache.entries.find((entry) => entry.event.id === eventId)?.event;
}

export function recordAiEventUsed(cache: AiEventCacheEnvelope, eventId: string, round: number): AiEventCacheEnvelope {
  const update = (entry: CachedAiEvent): CachedAiEvent => ({
    ...entry,
    meta: {
      ...entry.meta,
      usedCount: entry.meta.usedCount + 1,
      lastPickedRound: round,
    },
  });

  const active = cache.active?.event.id === eventId ? update(cache.active) : cache.active;
  const entries = cache.entries.map((entry) => entry.event.id === eventId ? update(entry) : entry);
  return {
    version: AI_EVENT_CACHE_VERSION,
    active,
    entries,
  };
}

export function releaseActiveAiEvent(cache: AiEventCacheEnvelope, player: Player): AiEventCacheEnvelope {
  if (!cache.active) {
    return {
      version: AI_EVENT_CACHE_VERSION,
      active: null,
      entries: pruneAiEventEntries(cache.entries, player).slice(0, MAX_AI_EVENT_CACHE),
    };
  }

  const active = cache.active;
  const entries = active.meta.usedCount >= AI_EVENT_MAX_USES
    ? cache.entries
    : [active, ...cache.entries.filter((entry) => entry.event.id !== active.event.id)];

  return {
    version: AI_EVENT_CACHE_VERSION,
    active: null,
    entries: pruneAiEventEntries(entries, player)
      .sort(compareCachePriority(player.round ?? 0))
      .slice(0, MAX_AI_EVENT_CACHE),
  };
}

export function buildAiPickCandidates(
  cache: AiEventCacheEnvelope | null | undefined,
  player: Player,
  history: RoundResult[] = [],
): AiEventPickCandidate[] {
  if (!cache) return [];
  return cache.entries.flatMap((entry) => {
    const multiplier = aiEventWeightMultiplier(entry, player, history);
    return multiplier > 0 ? [{ event: entry.event, weightMultiplier: multiplier }] : [];
  });
}

export function aiEventsFromCache(cache: AiEventCacheEnvelope | null | undefined): EventDef[] {
  if (!cache) return [];
  return [
    ...(cache.active ? [cache.active.event] : []),
    ...cache.entries.map((entry) => entry.event),
  ];
}

function eventCategory(type: EventType): AiEventCategory {
  return AI_EVENT_CATEGORIES.has(type) ? type as AiEventCategory : 'life';
}

function isEnvelopeLike(value: unknown): value is { active?: unknown; entries?: unknown[]; version?: unknown } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { entries?: unknown }).entries);
}

function parseCachedEntry(
  value: unknown,
  player: Player,
  history: RoundResult[],
  invalid: unknown[],
): CachedAiEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const { valid } = validateAiEvents([obj.event]);
  const event = valid[0];
  if (!event) {
    if (obj.event !== undefined) invalid.push(obj.event);
    return null;
  }

  return {
    event,
    meta: normalizeMeta(obj.meta, event, player, history),
  };
}

function normalizeMeta(raw: unknown, event: EventDef, player: Player, history: RoundResult[]): AiEventMeta {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const generatedFor = obj.generatedFor && typeof obj.generatedFor === 'object' && !Array.isArray(obj.generatedFor)
    ? obj.generatedFor as Partial<AiEventTriggerSnapshot>
    : {};
  const fallbackSnapshot = createAiEventTriggerSnapshot(player, history);

  return {
    category: typeof obj.category === 'string' && AI_EVENT_CATEGORIES.has(obj.category)
      ? obj.category as AiEventCategory
      : eventCategory(event.type),
    generatedRound: typeof obj.generatedRound === 'number' ? obj.generatedRound : player.round ?? 0,
    generatedFor: {
      stress: typeof generatedFor.stress === 'number' ? generatedFor.stress : fallbackSnapshot.stress,
      fatigue: typeof generatedFor.fatigue === 'number' ? generatedFor.fatigue : fallbackSnapshot.fatigue,
      fame: typeof generatedFor.fame === 'number' ? generatedFor.fame : fallbackSnapshot.fame,
      teamTrust: typeof generatedFor.teamTrust === 'number' ? generatedFor.teamTrust : fallbackSnapshot.teamTrust,
      hasTeam: typeof generatedFor.hasTeam === 'boolean' ? generatedFor.hasTeam : fallbackSnapshot.hasTeam,
      teamClubId: typeof generatedFor.teamClubId === 'string' ? generatedFor.teamClubId : fallbackSnapshot.teamClubId,
      hasRival: typeof generatedFor.hasRival === 'boolean' ? generatedFor.hasRival : fallbackSnapshot.hasRival,
      lastMatchResult: generatedFor.lastMatchResult === 'win' || generatedFor.lastMatchResult === 'loss'
        ? generatedFor.lastMatchResult
        : fallbackSnapshot.lastMatchResult,
    },
    usedCount: typeof obj.usedCount === 'number' ? Math.max(0, obj.usedCount) : 0,
    lastPickedRound: typeof obj.lastPickedRound === 'number' ? obj.lastPickedRound : null,
  };
}

function pruneAiEventEntries(entries: CachedAiEvent[], player: Player): CachedAiEvent[] {
  const round = player.round ?? 0;
  return dedupeCachedEntries(entries).filter((entry) => {
    if (entry.meta.usedCount >= AI_EVENT_MAX_USES) return false;
    if (round - entry.meta.generatedRound > AI_EVENT_TTL_ROUNDS) return false;
    return true;
  });
}

function dedupeCachedEntries(entries: CachedAiEvent[]): CachedAiEvent[] {
  const byId = new Map<string, CachedAiEvent>();
  for (const entry of entries) {
    if (!byId.has(entry.event.id)) byId.set(entry.event.id, entry);
  }
  return [...byId.values()];
}

function compareCachePriority(round: number): (a: CachedAiEvent, b: CachedAiEvent) => number {
  return (a, b) => cachePriority(b, round) - cachePriority(a, round);
}

function cachePriority(entry: CachedAiEvent, round: number): number {
  const age = Math.max(0, round - entry.meta.generatedRound);
  const cooled = entry.meta.lastPickedRound === null || round - entry.meta.lastPickedRound >= AI_EVENT_PICK_COOLDOWN;
  let score = 100 - age;
  if (entry.meta.usedCount === 0) score += 100;
  if (entry.meta.usedCount === 1 && cooled) score += 40;
  score += entry.meta.generatedRound / 1000;
  return score;
}

function aiEventWeightMultiplier(entry: CachedAiEvent, player: Player, history: RoundResult[]): number {
  const { event, meta } = entry;
  const round = player.round ?? 0;
  const synthTags = new Set(player.tags ?? []);

  if (!event.stages.includes(player.stage)) return 0;
  if (meta.usedCount >= AI_EVENT_MAX_USES) return 0;
  if (meta.lastPickedRound !== null && round - meta.lastPickedRound < AI_EVENT_PICK_COOLDOWN) return 0;
  if (round - meta.generatedRound > AI_EVENT_TTL_ROUNDS) return 0;
  if (event.requireTags?.some((tag) => !synthTags.has(tag))) return 0;
  if (event.forbidTags?.some((tag) => synthTags.has(tag))) return 0;

  const relevance = relevanceScore(meta, player, history);
  if (relevance <= 0) return 0;

  const age = Math.max(0, round - meta.generatedRound);
  const freshness = age <= 6 ? 1.2 : age <= 12 ? 1.0 : 0.5;
  const reuse = meta.usedCount === 0 ? 1.0 : 0.35;
  return relevance * freshness * reuse;
}

function relevanceScore(meta: AiEventMeta, player: Player, history: RoundResult[]): number {
  const stress = player.stress ?? 0;
  const fatigue = player.volatile?.fatigue ?? 0;
  const fame = player.fame ?? 0;
  const teamTrust = player.team ? player.teamTrust ?? 50 : null;
  const recent = history.slice(-3);
  const recentMatch = recent.some((r) => r.eventId.startsWith('tournament-') || r.eventType === 'match');
  const recentLoss = recent.some((r) => (r.eventId.startsWith('tournament-') || r.eventType === 'match') && !r.success);
  const recentFameChange = recent.some((r) => Math.abs(r.fameChange ?? 0) >= 8);
  const recentHighPressure = recent.some((r) => Math.abs(r.stressChange ?? 0) >= 10 || (r.eventType === 'match' && !r.success));

  if (meta.generatedFor.hasTeam && meta.generatedFor.teamClubId && player.team?.clubId !== meta.generatedFor.teamClubId) return 0;
  if (meta.generatedFor.hasTeam && !player.team) return 0;

  switch (meta.category) {
    case 'stress':
      if (stress <= meta.generatedFor.stress - 30) return 0;
      if (stress >= 80) return 1.5;
      if (stress >= 60 || player.volatile?.tilt >= 2 || recentHighPressure) return 1.0;
      if (stress >= 45) return 0.4;
      return 0;
    case 'life':
      if (fatigue >= 85) return 1.5;
      if (fatigue >= 65 || recentLoss) return 1.0;
      if (fatigue >= 50) return 0.4;
      return 0.7;
    case 'team':
      if (!player.team || teamTrust === null) return 0;
      if (teamTrust <= 25) return 1.5;
      if (teamTrust <= 40 || teamTrust >= 45 || recentMatch) return 1.0;
      return 0.5;
    case 'media':
      if (fame >= 45) return 1.5;
      if (fame >= 20 || recentMatch || recentFameChange) return 1.0;
      return 0;
    case 'rival':
      if ((player.rivals ?? []).length === 0) return 0;
      if (recentMatch || recentLoss || (player.consecutiveLosses ?? 0) >= 2) return 1.2;
      return 0.8;
    case 'tournament-context':
      if (player.pendingMatch) return 1.5;
      if (recentMatch || recentLoss) return 1.0;
      return 0.5;
  }
}
