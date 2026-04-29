import { EVENT_POOL, PROMOTION_EVENTS } from '../data/events/index.js';
import { getGate } from './stages.js';
import type { EventDef, Player, Rival } from '../types.js';

export interface EventContext {
  player: Player;
  recentEventIds: string[];
  rng: () => number;
}

function dynamicTags(player: Player): string[] {
  const out: string[] = [];
  // Stress is now 0-100; 60+ counts as "stressed".
  if (player.stress >= 60) out.push('stressed');
  if (player.fame >= 15) out.push('famous');
  if (player.stats.money <= 1) out.push('cash-strapped');
  if (player.stats.constitution <= 2) out.push('frail');
  // Major aftermath weeks: surface broadcast events to the non-participant.
  // Major signups close at week 22/46; matches resolve week 23/47; we show
  // broadcast at week 24/48 to give it space.
  const w = player.week ?? 1;
  const isMajorAftermath = w === 24 || w === 48;
  const inMajorMatch =
    player.pendingMatch?.tournamentId === 't-major';
  if (isMajorAftermath && !inMajorMatch) out.push('major-broadcast');
  return out;
}

function stateWeight(e: EventDef, player: Player): number {
  let w = e.weight ?? 1;
  if (player.fame >= 15 && e.type === 'media') w *= 1.6;
  if (player.stats.money <= 1) {
    if (e.type === 'betting') w *= 1.8;
    if (e.type === 'cheat') w *= 1.5;
  }
  if (player.stats.constitution <= 2 && e.type === 'life') w *= 1.4;
  if (player.stress >= 60 && e.requireTags?.includes('stressed')) w *= 2;
  // Force broadcast events to dominate when in Major aftermath.
  if (e.requireTags?.includes('major-broadcast')) w *= 5;
  return Math.max(0.05, w);
}

export function pickEvent(ctx: EventContext): EventDef | null {
  const { player, recentEventIds, rng } = ctx;
  const realTags = new Set(player.tags);
  const synthTags = new Set([...player.tags, ...dynamicTags(player)]);

  if ((player.restRounds ?? 0) > 0) {
    const restPool = EVENT_POOL.filter((e) => e.type === 'rest');
    if (restPool.length > 0) return weightedPick(restPool, rng, () => 1);
  }

  // Promotion pending: inject the stage-specific narrative event.
  if (player.promotionPending) {
    const gate = getGate(player.stage);
    if (gate) {
      const ev = PROMOTION_EVENTS.find((e) => e.id === gate.promotionEventId);
      if (ev) return ev;
    }
  }

  const eligible = EVENT_POOL.filter((e) => {
    if (e.type === 'rest') return false;
    if (!e.stages.includes(player.stage)) return false;
    if (recentEventIds.includes(e.id)) return false;
    if (e.requireTags?.some((t) => !synthTags.has(t))) return false;
    if (e.forbidTags?.some((t) => realTags.has(t))) return false;
    return true;
  });

  if (eligible.length === 0) {
    const fallback = EVENT_POOL.filter(
      (e) => e.type !== 'rest' && e.stages.includes(player.stage),
    );
    if (fallback.length === 0) return null;
    return weightedPick(fallback, rng, (e) => stateWeight(e, player));
  }

  return weightedPick(eligible, rng, (e) => stateWeight(e, player));
}

function weightedPick(
  events: EventDef[],
  rng: () => number,
  weightFn: (e: EventDef) => number,
): EventDef {
  const weights = events.map((e) => Math.max(0.01, weightFn(e)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < events.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return events[i]!;
  }
  return events[events.length - 1]!;
}

// Replace {rival0}/{rival1}/... placeholders with actual rival names. Falls
// back to "某队" when index is out of range.
export function substituteRivals(text: string, rivals: Rival[]): string {
  return text.replace(/\{rival(\d+)\}/g, (_, i) => {
    const idx = Number(i);
    return rivals[idx]?.name ?? '某队';
  });
}

export function toPublicEvent(e: EventDef, rivals: Rival[] = []) {
  const sub = (s: string) => substituteRivals(s, rivals);
  return {
    id: e.id,
    type: e.type,
    title: sub(e.title),
    narrative: sub(e.narrative),
    choices: e.choices.map((c) => ({
      id: c.id,
      label: sub(c.label),
      description: sub(c.description),
    })),
  };
}
