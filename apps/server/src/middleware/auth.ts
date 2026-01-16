import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { db, sessions, users } from '../db';
import { eq, and, gt } from 'drizzle-orm';
import type { User } from '../db/schema';

export type AuthVariables = {
  user: User | null;
  sessionId: string | null;
};

// Optional auth middleware - populates user if authenticated but doesn't require it
export const optionalAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const sessionId = getCookie(c, 'session');

  if (!sessionId) {
    c.set('user', null);
    c.set('sessionId', null);
    return next();
  }

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      gt(sessions.expiresAt, new Date().toISOString())
    ),
    with: { user: true },
  });

  if (!session) {
    c.set('user', null);
    c.set('sessionId', null);
    return next();
  }

  c.set('user', session.user);
  c.set('sessionId', sessionId);
  return next();
});

// Required auth middleware - returns 401 if not authenticated
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const sessionId = getCookie(c, 'session');

  if (!sessionId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      gt(sessions.expiresAt, new Date().toISOString())
    ),
    with: { user: true },
  });

  if (!session) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  c.set('user', session.user);
  c.set('sessionId', sessionId);
  return next();
});

// Helper to get user or throw
export function getAuthUser(c: { get: (key: 'user') => User | null }): User {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  return user;
}
