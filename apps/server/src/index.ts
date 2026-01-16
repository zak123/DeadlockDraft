import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getConfig, isDev } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { rateLimit } from './middleware/rate-limit';
import { auth } from './routes/auth';
import { lobbies } from './routes/lobbies';
import { matches } from './routes/matches';
import { websocketHandlers } from './services/websocket';
import { lobbyManager } from './services/lobby-manager';

const config = getConfig();

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
app.get('/ws', (c) => {
  const upgraded = server.upgrade(c.req.raw);
  if (!upgraded) {
    return c.text('WebSocket upgrade failed', 400);
  }
});

console.log(`Server running at http://localhost:${config.PORT}`);
console.log(`WebSocket available at ws://localhost:${config.PORT}/ws`);
