import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getCookie } from 'hono/cookie';
import { getConfig, isDev } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { rateLimit } from './middleware/rate-limit';
import { auth } from './routes/auth';
import { lobbies } from './routes/lobbies';
import { matches } from './routes/matches';
import { draft } from './routes/draft';
import { websocketHandlers } from './services/websocket';
import { lobbyManager } from './services/lobby-manager';
import { db, sessions, siteStats, lobbies } from './db';
import { eq, and, gt, sql } from 'drizzle-orm';

const config = getConfig();

// Initialize site stats if not exists
async function initializeSiteStats() {
  const existing = await db.query.siteStats.findFirst();
  if (!existing) {
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(lobbies);
    await db.insert(siteStats).values({ id: 1, totalLobbiesCreated: count });
    console.log(`Initialized site stats with ${count} existing lobbies`);
  }
}
initializeSiteStats().catch(console.error);

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: isDev() ? ['http://localhost:5173', 'http://localhost:3000'] : config.FRONTEND_URL,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
app.use('/api/*', rateLimit({ windowMs: 60000, max: 100 }));

// Error handler
app.onError(errorHandler);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.route('/api/auth', auth);
app.route('/api/lobbies', lobbies);
app.route('/api/lobbies', matches);
app.route('/api/lobbies', draft);
app.route('/api', draft);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'Route not found', statusCode: 404 }, 404);
});

// Cleanup job - run every 5 minutes
setInterval(async () => {
  try {
    await lobbyManager.cleanupExpiredLobbies();
  } catch (error) {
    console.error('Cleanup job error:', error);
  }
}, 5 * 60 * 1000);

// Start server
console.log(`Starting server on port ${config.PORT}...`);

const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
  websocket: websocketHandlers,
});

// Upgrade WebSocket connections
app.get('/ws', async (c) => {
  // Try to authenticate user from session cookie
  let userId: string | null = null;
  const sessionId = getCookie(c, 'session');

  if (sessionId) {
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, new Date().toISOString())
      ),
    });
    if (session) {
      userId = session.userId;
    }
  }

  const upgraded = server.upgrade(c.req.raw, {
    data: { userId },
  });
  if (!upgraded) {
    return c.text('WebSocket upgrade failed', 400);
  }
});

console.log(`Server running at http://localhost:${config.PORT}`);
console.log(`WebSocket available at ws://localhost:${config.PORT}/ws`);
