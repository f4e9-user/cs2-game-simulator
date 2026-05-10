export interface LlmLogEntry {
  id: string;
  ts: string;
  method: string;
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string | null;
  latencyMs: number;
  stream: boolean;
}

const INDEX_KEY = 'llm:index';
const LOG_PREFIX = 'llm:log:';
const MAX_ENTRIES = 100;
const TTL_SECONDS = 86400; // 24 h

export class LlmLogger {
  // ctx is Cloudflare's ExecutionContext; when present, waitUntil() ensures
  // KV writes complete even after the response stream has closed.
  constructor(private kv: KVNamespace, private ctx?: { waitUntil(p: Promise<unknown>): void }) {}

  log(entry: Omit<LlmLogEntry, 'id' | 'ts'>): Promise<void> {
    const p = this._write(entry);
    if (this.ctx) {
      this.ctx.waitUntil(p);
      return Promise.resolve(); // don't make callers wait
    }
    return p;
  }

  private async _write(entry: Omit<LlmLogEntry, 'id' | 'ts'>): Promise<void> {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const full: LlmLogEntry = { id, ts: new Date().toISOString(), ...entry };

      await this.kv.put(`${LOG_PREFIX}${id}`, JSON.stringify(full), {
        expirationTtl: TTL_SECONDS,
      });

      const index = (await this.kv.get<string[]>(INDEX_KEY, 'json')) ?? [];
      index.push(id);
      if (index.length > MAX_ENTRIES) index.splice(0, index.length - MAX_ENTRIES);
      await this.kv.put(INDEX_KEY, JSON.stringify(index), { expirationTtl: TTL_SECONDS });
    } catch (err) {
      console.error('[LlmLogger] write failed:', err);
    }
  }

  async listRecent(limit: number): Promise<LlmLogEntry[]> {
    const index = (await this.kv.get<string[]>(INDEX_KEY, 'json')) ?? [];
    const ids = index.slice(-Math.min(limit, MAX_ENTRIES)).reverse();

    const entries = await Promise.all(
      ids.map((id) => this.kv.get<LlmLogEntry>(`${LOG_PREFIX}${id}`, 'json')),
    );
    return entries.filter((e): e is LlmLogEntry => e !== null);
  }

  async getById(id: string): Promise<LlmLogEntry | null> {
    return this.kv.get<LlmLogEntry>(`${LOG_PREFIX}${id}`, 'json');
  }
}
