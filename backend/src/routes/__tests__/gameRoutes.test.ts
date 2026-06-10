import { describe, expect, it } from 'vitest';
import app from '../../index.js';

describe('game routes', () => {
  it('allows trait rolling before a session exists', async () => {
    const res = await app.request('/api/game/roll-traits', { method: 'POST' });
    const body = await res.json() as { traits?: unknown[]; error?: string };

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.traits).toHaveLength(3);
  });
});
