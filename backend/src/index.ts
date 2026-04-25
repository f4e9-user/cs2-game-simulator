import { Hono } from 'hono';
import gameRoutes from './routes/game.js';
import type { Env } from './types.js';

const app = new Hono<{ Bindings: Env }>();

// Minimal CORS so the Next.js dev server can call this Worker.
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') ?? '*';
  c.res.headers.set('Access-Control-Allow-Origin', origin);
  c.res.headers.set('Vary', 'Origin');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'content-type,authorization');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

app.get('/', (c) =>
  c.json({ name: 'cs2-sim-backend', docs: '/api/health' }),
);

app.route('/api', gameRoutes);

export default app;
