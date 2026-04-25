import type { Env } from '../types.js';
import { SessionRepo } from './d1.js';
import { KvCache } from './kv.js';

export interface Storage {
  sessions: SessionRepo;
  cache: KvCache;
}

export function makeStorage(env: Env): Storage {
  return {
    sessions: new SessionRepo(env.DB),
    cache: new KvCache(env.KV),
  };
}
