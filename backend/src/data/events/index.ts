import type { EventDef, EventType } from '../../types.js';
import { getTournament, synthesizeMatchEvent } from '../tournaments.js';
import { TRAINING_EVENTS } from './training.js';
import { RANKED_EVENTS } from './ranked.js';
import { TEAM_EVENTS } from './team.js';
import { TRYOUT_EVENTS, PROMOTION_EVENTS } from './tryout.js';
import { MATCH_EVENTS } from './match.js';
import { MEDIA_EVENTS } from './media.js';
import { LIFE_EVENTS } from './life.js';
import { BETTING_EVENTS } from './betting.js';
import { CHEAT_EVENTS } from './cheat.js';
import { REST_EVENTS } from './rest.js';
import { STRESS_EVENTS } from './stress.js';
import { RIVAL_EVENTS } from './rival.js';
import { BROADCAST_EVENTS } from './broadcast.js';
import { DAILY_EVENTS } from './daily.js';
import { BAILOUT_EVENTS } from './bailout.js';
import { CHAIN_EVENTS } from './chains.js';
import { SKIN_EVENTS } from './skins.js';
import { AGENT_EVENTS } from './agent.js';
import { HOUSING_EVENTS } from './housing.js';
import { TOURNAMENT_CONTEXT_EVENTS } from './tournamentContext.js';

export { PROMOTION_EVENTS };

export class EventRegistry {
  private pools = new Map<string, EventDef[]>();

  register(type: string, events: EventDef[]) {
    const existing = this.pools.get(type) ?? [];
    this.pools.set(type, [...existing, ...events]);
  }

  unregister(type: string, predicate: (e: EventDef) => boolean) {
    const existing = this.pools.get(type);
    if (!existing) return;
    this.pools.set(type, existing.filter((e) => !predicate(e)));
  }

  getByType(type: string): EventDef[] {
    return this.pools.get(type) ?? [];
  }

  getAll(): EventDef[] {
    return Array.from(this.pools.values()).flat();
  }

  getTypes(): string[] {
    return Array.from(this.pools.keys());
  }

  clearType(type: string) {
    this.pools.delete(type);
  }

  clearAll() {
    this.pools.clear();
  }
}

const registry = new EventRegistry();
registry.register('training', TRAINING_EVENTS);
registry.register('ranked', RANKED_EVENTS);
registry.register('team', TEAM_EVENTS);
registry.register('tryout', TRYOUT_EVENTS);
registry.register('match', MATCH_EVENTS);
registry.register('media', MEDIA_EVENTS);
registry.register('life', LIFE_EVENTS);
registry.register('betting', BETTING_EVENTS);
registry.register('cheat', CHEAT_EVENTS);
registry.register('rest', REST_EVENTS);
registry.register('stress', STRESS_EVENTS);
registry.register('rival', RIVAL_EVENTS);
registry.register('broadcast', BROADCAST_EVENTS);
registry.register('daily', DAILY_EVENTS);
registry.register('bailout', BAILOUT_EVENTS);
registry.register('chains', CHAIN_EVENTS);
registry.register('skins', SKIN_EVENTS);
registry.register('agent', AGENT_EVENTS);
registry.register('life', HOUSING_EVENTS);
registry.register('tournament-context', TOURNAMENT_CONTEXT_EVENTS);

export const EVENT_POOL: EventDef[] = registry.getAll();

export function getEventById(id: string): EventDef | undefined {
  if (id.startsWith('promotion-')) {
    return PROMOTION_EVENTS.find((e) => e.id === id);
  }
  if (id.startsWith('tournament-') && !id.startsWith('tournament-context-')) {
    const rest = id.slice('tournament-'.length);
    const sep = rest.lastIndexOf('--');
    if (sep < 0) return undefined;
    const tid = rest.slice(0, sep);
    const stageIndex = Number(rest.slice(sep + 2));
    const t = getTournament(tid);
    if (!t || !Number.isInteger(stageIndex)) return undefined;
    return synthesizeMatchEvent(t, stageIndex);
  }
  return registry.getAll().find((e) => e.id === id);
}

export function eventsByType(type: EventType): EventDef[] {
  return registry.getAll().filter((e) => e.type === type);
}

export function getEventRegistry(): EventRegistry {
  return registry;
}
