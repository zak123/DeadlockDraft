import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { steamAuthService } from '../services/steam-auth';
import { getConfig } from '../config/env';
import { requireAuth, optionalAuth, type AuthVariables } from '../middleware/auth';
import type { AuthResponse } from '@deadlock-draft/shared';

const auth = new Hono<{ Variables: AuthVariables }>();
const config = getConfig();

// Redirect to Steam OpenID login
auth.get('/steam', (c) => {
  const returnTo = c.req.query('returnTo') || '/';
  const returnUrl = `${config.APP_URL}/api/auth/steam/callback?returnTo=${encodeURIComponent(returnTo)}`;
  const loginUrl = steamAuthService.getLoginUrl(returnUrl);
  return c.redirect(loginUrl);
});

// Steam OpenID callback
auth.get('/steam/callback', async (c) => {
  const url = new URL(c.req.url);
  const query = Object.fromEntries(url.searchParams);
  const returnTo = url.searchParams.get('returnTo') || '/';

  const steamId = await steamAuthService.verifyCallback(query);
  if (!steamId) {
    return c.redirect(`${config.FRONTEND_URL}?error=auth_failed`);
  }

  const user = await steamAuthService.findOrCreateUser(steamId);
  if (!user) {
    return c.redirect(`${config.FRONTEND_URL}?error=user_fetch_failed`);
  }

  const sessionId = await steamAuthService.createSession(user.id);

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Redirect back to the original page (e.g., lobby)
  const redirectUrl = returnTo.startsWith('/')
    ? `${config.FRONTEND_URL}${returnTo}`
    : config.FRONTEND_URL;
  return c.redirect(redirectUrl);
});

// Get current user
auth.get('/me', optionalAuth, (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ user: null });
  }
  return c.json<AuthResponse>({ user });
});

// Logout
auth.post('/logout', requireAuth, async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    await steamAuthService.deleteSession(sessionId);
  }

  deleteCookie(c, 'session', {
    path: '/',
  });

  return c.json({ success: true });
});

export { auth };
