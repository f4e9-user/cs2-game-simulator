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
import { CHAIN_EVENTS } from './chains.js';

export const EVENT_POOL: EventDef[] = [
  ...TRAINING_EVENTS,
  ...RANKED_EVENTS,
  ...TEAM_EVENTS,
  ...TRYOUT_EVENTS,
  ...MATCH_EVENTS,
  ...MEDIA_EVENTS,
  ...LIFE_EVENTS,
  ...BETTING_EVENTS,
  ...CHEAT_EVENTS,
  ...REST_EVENTS,
  ...STRESS_EVENTS,
  ...RIVAL_EVENTS,
  ...BROADCAST_EVENTS,
  ...DAILY_EVENTS,
  ...CHAIN_EVENTS,
];

export { PROMOTION_EVENTS };

export function getEventById(id: string): EventDef | undefined {
  if (id.startsWith('promotion-')) {
    return PROMOTION_EVENTS.find((e) => e.id === id);
  }
  if (id.startsWith('tournament-')) {
    const rest = id.slice('tournament-'.length);
    const sep = rest.lastIndexOf('--');
    if (sep < 0) return undefined;
    const tid = rest.slice(0, sep);
    const stageIndex = Number(rest.slice(sep + 2));
    const t = getTournament(tid);
    if (!t || !Number.isInteger(stageIndex)) return undefined;
    return synthesizeMatchEvent(t, stageIndex);
  }
  return EVENT_POOL.find((e) => e.id === id);
}

export function eventsByType(type: EventType): EventDef[] {
  return EVENT_POOL.filter((e) => e.type === type);
}
