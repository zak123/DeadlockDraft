import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { steamAuthService } from '../services/steam-auth';
import { twitchAuthService } from '../services/twitch-auth';
import { getConfig } from '../config/env';
import { requireAuth, optionalAuth, type AuthVariables } from '../middleware/auth';
import type { AuthResponse } from '@deadlock-draft/shared';
import { nanoid } from 'nanoid';

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

// Redirect to Twitch OAuth (requires Steam auth first)
auth.get('/twitch', requireAuth, (c) => {
  if (!twitchAuthService.isConfigured()) {
    return c.json({ error: 'Twitch OAuth is not configured' }, 500);
  }

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const returnTo = c.req.query('returnTo') || '/';
  // Store state with user ID and return URL
  const state = Buffer.from(JSON.stringify({ userId: user.id, returnTo })).toString('base64');

  // Store state in a cookie for verification
  setCookie(c, 'twitch_oauth_state', state, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  });

  const authUrl = twitchAuthService.getAuthUrl(state);
  return c.redirect(authUrl);
});

// Twitch OAuth callback
auth.get('/twitch/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const storedState = getCookie(c, 'twitch_oauth_state');

  // Clear the state cookie
  deleteCookie(c, 'twitch_oauth_state', { path: '/' });

  if (error) {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_auth_denied`);
  }

  if (!code || !state || state !== storedState) {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_auth_invalid_state`);
  }

  let stateData: { userId: string; returnTo: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_auth_invalid_state`);
  }

  // Check if this Twitch account is already linked to another user
  const tokens = await twitchAuthService.exchangeCodeForTokens(code);
  if (!tokens) {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_token_exchange_failed`);
  }

  const twitchUser = await twitchAuthService.getTwitchUser(tokens.access_token);
  if (!twitchUser) {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_user_fetch_failed`);
  }

  // Check if Twitch account is already linked to a different user
  const existingUser = await twitchAuthService.findUserByTwitchId(twitchUser.id);
  if (existingUser && existingUser.id !== stateData.userId) {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_already_linked`);
  }

  // Link Twitch account to user
  const updatedUser = await twitchAuthService.linkTwitchToUser(
    stateData.userId,
    twitchUser,
    tokens
  );

  if (!updatedUser) {
    return c.redirect(`${config.FRONTEND_URL}?error=twitch_link_failed`);
  }

  // Redirect back to the original page
  const redirectUrl = stateData.returnTo.startsWith('/')
    ? `${config.FRONTEND_URL}${stateData.returnTo}`
    : config.FRONTEND_URL;
  return c.redirect(redirectUrl);
});

// Unlink Twitch account
auth.post('/twitch/unlink', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const updatedUser = await twitchAuthService.unlinkTwitch(user.id);
  if (!updatedUser) {
    return c.json({ error: 'Failed to unlink Twitch account' }, 500);
  }

  return c.json<AuthResponse>({ user: updatedUser });
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
