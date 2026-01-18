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

interface TwitchStream {
  user_login: string;
  viewer_count: number;
}

interface TwitchStreamsResponse {
  data: TwitchStream[];
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
      scope: 'user:read:email user:read:subscriptions',
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

  /**
   * Get viewer counts for multiple Twitch streams.
   * Uses app access token (client credentials) to avoid per-user token issues.
   * Returns a map of username (lowercase) -> viewer count.
   * Streams that are offline will not be in the map.
   */
  async getStreamViewerCounts(usernames: string[]): Promise<Map<string, number>> {
    const viewerCounts = new Map<string, number>();

    if (!this.isConfigured() || usernames.length === 0) {
      return viewerCounts;
    }

    try {
      // Get app access token (client credentials flow)
      const tokenResponse = await this.getAppAccessToken();
      if (!tokenResponse) {
        console.error('Failed to get Twitch app access token');
        return viewerCounts;
      }

      // Twitch API allows up to 100 user_login parameters
      const batchSize = 100;
      for (let i = 0; i < usernames.length; i += batchSize) {
        const batch = usernames.slice(i, i + batchSize);
        const params = new URLSearchParams();
        batch.forEach((username) => params.append('user_login', username.toLowerCase()));

        const response = await fetch(`${TWITCH_API_URL}/streams?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
            'Client-Id': this.config.TWITCH_CLIENT_ID,
          },
        });

        if (!response.ok) {
          console.error('Failed to get Twitch streams:', await response.text());
          continue;
        }

        const data = (await response.json()) as TwitchStreamsResponse;
        for (const stream of data.data) {
          viewerCounts.set(stream.user_login.toLowerCase(), stream.viewer_count);
        }
      }
    } catch (error) {
      console.error('Error fetching Twitch stream viewer counts:', error);
    }

    return viewerCounts;
  }

  /**
   * Check if a user is following a broadcaster's channel.
   * Uses app access token to check the follow relationship.
   * Returns true if following, false otherwise.
   */
  async isUserFollowing(
    viewerTwitchId: string,
    broadcasterTwitchId: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('Twitch OAuth is not configured');
    }

    try {
      // Get app access token
      const tokenResponse = await this.getAppAccessToken();
      if (!tokenResponse) {
        console.error('Failed to get Twitch app access token for follower check');
        return false;
      }

      const params = new URLSearchParams({
        broadcaster_id: broadcasterTwitchId,
        user_id: viewerTwitchId,
      });

      const response = await fetch(`${TWITCH_API_URL}/channels/followers?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
          'Client-Id': this.config.TWITCH_CLIENT_ID,
        },
      });

      if (!response.ok) {
        console.error('Failed to check Twitch follow status:', await response.text());
        return false;
      }

      const data = await response.json();
      // If we get data back with entries, the user is following
      return data.data && data.data.length > 0;
    } catch (error) {
      console.error('Error checking Twitch follow status:', error);
      return false;
    }
  }

  /**
   * Check if a user is subscribed to a broadcaster's channel.
   * Requires the viewer's access token with user:read:subscriptions scope.
   * Returns true if subscribed, false otherwise.
   */
  async isUserSubscribed(
    viewerAccessToken: string,
    viewerTwitchId: string,
    broadcasterTwitchId: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('Twitch OAuth is not configured');
    }

    try {
      const params = new URLSearchParams({
        broadcaster_id: broadcasterTwitchId,
        user_id: viewerTwitchId,
      });

      const response = await fetch(`${TWITCH_API_URL}/subscriptions/user?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${viewerAccessToken}`,
          'Client-Id': this.config.TWITCH_CLIENT_ID,
        },
      });

      if (response.status === 404) {
        // Not subscribed
        return false;
      }

      if (!response.ok) {
        console.error('Failed to check Twitch subscription:', await response.text());
        return false;
      }

      const data = await response.json();
      // If we get data back, the user is subscribed
      return data.data && data.data.length > 0;
    } catch (error) {
      console.error('Error checking Twitch subscription:', error);
      return false;
    }
  }

  /**
   * Get a valid access token for a user, refreshing if needed.
   */
  async getValidAccessToken(user: User): Promise<string | null> {
    if (!user.twitchAccessToken || !user.twitchRefreshToken) {
      return null;
    }

    // Check if token is expired
    if (user.twitchTokenExpiresAt) {
      const expiresAt = new Date(user.twitchTokenExpiresAt);
      const now = new Date();
      // Refresh if expiring in less than 5 minutes
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        const newTokens = await this.refreshTokens(user.twitchRefreshToken);
        if (newTokens) {
          // Update tokens in database
          const newExpiresAt = new Date();
          newExpiresAt.setSeconds(newExpiresAt.getSeconds() + newTokens.expires_in);

          await db
            .update(users)
            .set({
              twitchAccessToken: newTokens.access_token,
              twitchRefreshToken: newTokens.refresh_token,
              twitchTokenExpiresAt: newExpiresAt.toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(users.id, user.id));

          return newTokens.access_token;
        }
        return null;
      }
    }

    return user.twitchAccessToken;
  }

  private async getAppAccessToken(): Promise<{ access_token: string } | null> {
    const params = new URLSearchParams({
      client_id: this.config.TWITCH_CLIENT_ID,
      client_secret: this.config.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    });

    const response = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      console.error('Failed to get Twitch app access token:', await response.text());
      return null;
    }

    return response.json();
  }
}

export const twitchAuthService = new TwitchAuthService();
