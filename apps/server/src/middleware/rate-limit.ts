import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetAt < now) {
      delete store[key];
    }
  }
}, 60000);

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  max?: number; // Max requests per window
  keyGenerator?: (c: any) => string;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 60000, // 1 minute
    max = 100,
    keyGenerator = (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
  } = options;

  return createMiddleware(async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    if (!store[key] || store[key].resetAt < now) {
      store[key] = {
        count: 1,
        resetAt: now + windowMs,
      };
    } else {
      store[key].count++;
    }

    const remaining = Math.max(0, max - store[key].count);
    const resetAt = store[key].resetAt;

    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());

    if (store[key].count > max) {
      throw new HTTPException(429, { message: 'Too many requests, please try again later' });
    }

    return next();
  });
}
