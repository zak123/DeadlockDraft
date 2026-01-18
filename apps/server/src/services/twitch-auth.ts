import { getConfig } from '../config/env';
import { db, users } from '../db';
import { eq } from 'drizzle-orm';
import type { User } from '../db/schema';

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API_URL = 'https://api.twitch.tv/helix';

interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface TwitchUsersResponse {
  data: TwitchUser[];
}

export class TwitchAuthService {
  private config = getConfig();

  isConfigured(): boolean {
    return !!(
      this.config.TWITCH_CLIENT_ID &&
      this.config.TWITCH_CLIENT_SECRET &&
      this.config.TWITCH_REDIRECT_URI
    );
  }

  getAuthUrl(state: string): string {
    if (!this.isConfigured()) {
      throw new Error('Twitch OAuth is not configured');
    }

    const params = new URLSearchParams({
      client_id: this.config.TWITCH_CLIENT_ID,
      redirect_uri: this.config.TWITCH_REDIRECT_URI,
      response_type: 'code',
      scope: 'user:read:email',
      state,
    });

    return `${TWITCH_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TwitchTokenResponse | null> {
    if (!this.isConfigured()) {
      throw new Error('Twitch OAuth is not configured');
    }

    const params = new URLSearchParams({
      client_id: this.config.TWITCH_CLIENT_ID,
      client_secret: this.config.TWITCH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.TWITCH_REDIRECT_URI,
    });

    const response = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      console.error('Failed to exchange Twitch code for tokens:', await response.text());
      return null;
    }

    return response.json() as Promise<TwitchTokenResponse>;
  }

  async refreshTokens(refreshToken: string): Promise<TwitchTokenResponse | null> {
    if (!this.isConfigured()) {
      throw new Error('Twitch OAuth is not configured');
    }

    const params = new URLSearchParams({
      client_id: this.config.TWITCH_CLIENT_ID,
      client_secret: this.config.TWITCH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      console.error('Failed to refresh Twitch tokens:', await response.text());
      return null;
    }

    return response.json() as Promise<TwitchTokenResponse>;
  }

  async getTwitchUser(accessToken: string): Promise<TwitchUser | null> {
    if (!this.isConfigured()) {
      throw new Error('Twitch OAuth is not configured');
    }

    const response = await fetch(`${TWITCH_API_URL}/users`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': this.config.TWITCH_CLIENT_ID,
      },
    });

    if (!response.ok) {
      console.error('Failed to get Twitch user:', await response.text());
      return null;
    }

    const data = (await response.json()) as TwitchUsersResponse;
    return data.data[0] || null;
  }

  async linkTwitchToUser(
    userId: string,
    twitchUser: TwitchUser,
    tokens: TwitchTokenResponse
  ): Promise<User | null> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    const [updated] = await db
      .update(users)
      .set({
        twitchId: twitchUser.id,
        twitchUsername: twitchUser.login,
        twitchDisplayName: twitchUser.display_name,
        twitchAvatar: twitchUser.profile_image_url,
        twitchAccessToken: tokens.access_token,
        twitchRefreshToken: tokens.refresh_token,
        twitchTokenExpiresAt: expiresAt.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .returning();

    return updated || null;
  }

  async unlinkTwitch(userId: string): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({
        twitchId: null,
        twitchUsername: null,
        twitchDisplayName: null,
        twitchAvatar: null,
        twitchAccessToken: null,
        twitchRefreshToken: null,
        twitchTokenExpiresAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .returning();

    return updated || null;
  }

  async findUserByTwitchId(twitchId: string): Promise<User | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.twitchId, twitchId),
    });

    return user || null;
  }

  getStreamUrl(twitchUsername: string): string {
    return `https://twitch.tv/${twitchUsername}`;
  }
}

export const twitchAuthService = new TwitchAuthService();
