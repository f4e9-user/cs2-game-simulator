export class KvCache {
  constructor(private kv: KVNamespace) {}

  async getJSON<T>(key: string): Promise<T | null> {
    return (await this.kv.get(key, 'json')) as T | null;
  }

  async putJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: ttlSeconds,
    });
  }

  async del(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
