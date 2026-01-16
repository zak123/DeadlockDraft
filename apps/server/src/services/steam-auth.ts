import { getConfig } from '../config/env';
import { db, users, sessions } from '../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { User } from '../db/schema';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAM_API_URL = 'https://api.steampowered.com';

interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
}

export class SteamAuthService {
  private config = getConfig();

  getLoginUrl(returnUrl: string): string {
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl,
      'openid.realm': this.config.APP_URL,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });

    return `${STEAM_OPENID_URL}?${params.toString()}`;
  }

  async verifyCallback(query: Record<string, string>): Promise<string | null> {
    // Verify the OpenID response
    const params = new URLSearchParams(query);
    params.set('openid.mode', 'check_authentication');

    const response = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const text = await response.text();

    if (!text.includes('is_valid:true')) {
      return null;
    }

    // Extract Steam ID from claimed_id
    const claimedId = query['openid.claimed_id'];
    if (!claimedId) return null;

    const match = claimedId.match(/\/id\/(\d+)$/);
    if (!match) return null;

    return match[1];
  }

  async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
    const url = `${STEAM_API_URL}/ISteamUser/GetPlayerSummaries/v2/?key=${this.config.STEAM_API_KEY}&steamids=${steamId}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json() as { response: { players: SteamPlayerSummary[] } };
    return data.response.players[0] || null;
  }

  async findOrCreateUser(steamId: string): Promise<User | null> {
    const playerSummary = await this.getPlayerSummary(steamId);
    if (!playerSummary) return null;

    const existingUser = await db.query.users.findFirst({
      where: eq(users.steamId, steamId),
    });

    if (existingUser) {
      // Update user info
      const [updated] = await db
        .update(users)
        .set({
          username: playerSummary.personaname,
          displayName: playerSummary.personaname,
          avatarSmall: playerSummary.avatar,
          avatarMedium: playerSummary.avatarmedium,
          avatarLarge: playerSummary.avatarfull,
          profileUrl: playerSummary.profileurl,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      return updated;
    }

    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        id: nanoid(),
        steamId,
        username: playerSummary.personaname,
        displayName: playerSummary.personaname,
        avatarSmall: playerSummary.avatar,
        avatarMedium: playerSummary.avatarmedium,
        avatarLarge: playerSummary.avatarfull,
        profileUrl: playerSummary.profileurl,
      })
      .returning();

    return newUser;
  }

  async createSession(userId: string): Promise<string> {
    const sessionId = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 day session

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt: expiresAt.toISOString(),
    });

    return sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date().toISOString();
    await db.delete(sessions).where(eq(sessions.expiresAt, now));
  }
}

export const steamAuthService = new SteamAuthService();
