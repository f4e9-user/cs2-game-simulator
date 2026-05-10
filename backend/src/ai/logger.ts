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
  constructor(private kv: KVNamespace) {}

  async log(entry: Omit<LlmLogEntry, 'id' | 'ts'>): Promise<void> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const full: LlmLogEntry = { id, ts: new Date().toISOString(), ...entry };

    // Write individual entry
    await this.kv.put(`${LOG_PREFIX}${id}`, JSON.stringify(full), {
      expirationTtl: TTL_SECONDS,
    });

    // Update index (ring buffer)
    const index = await this.kv.get<string[]>(INDEX_KEY, 'json') ?? [];
    index.push(id);
    if (index.length > MAX_ENTRIES) index.splice(0, index.length - MAX_ENTRIES);
    await this.kv.put(INDEX_KEY, JSON.stringify(index), { expirationTtl: TTL_SECONDS });
  }

  async listRecent(limit: number): Promise<LlmLogEntry[]> {
    const index = await this.kv.get<string[]>(INDEX_KEY, 'json') ?? [];
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
