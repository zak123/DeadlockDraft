import { db, lobbyWaitlist, lobbies, lobbyParticipants, users } from '../db';
import { eq, and, asc, sql, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { WaitlistEntry, PublicUser } from '@deadlock-draft/shared';

const MAX_WAITLIST_SIZE = 128;

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    steamId: user.steamId,
    displayName: user.displayName,
    avatarMedium: user.avatarMedium,
    twitchId: user.twitchId,
    twitchUsername: user.twitchUsername,
    twitchDisplayName: user.twitchDisplayName,
    twitchAvatar: user.twitchAvatar,
  };
}

export class WaitlistManager {
  async getWaitlist(lobbyId: string): Promise<WaitlistEntry[]> {
    const entries = await db.query.lobbyWaitlist.findMany({
      where: eq(lobbyWaitlist.lobbyId, lobbyId),
      orderBy: [asc(lobbyWaitlist.position)],
      with: {
        user: true,
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      lobbyId: entry.lobbyId,
      userId: entry.userId,
      position: entry.position,
      joinedAt: entry.joinedAt,
      user: toPublicUser(entry.user),
    }));
  }

  async getWaitlistCount(lobbyId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(lobbyWaitlist)
      .where(eq(lobbyWaitlist.lobbyId, lobbyId));

    return result[0]?.count || 0;
  }

  async joinWaitlist(lobbyId: string, userId: string): Promise<WaitlistEntry | null> {
    // Check if lobby exists and is a Twitch lobby accepting players
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobbyId),
    });

    if (!lobby || !lobby.isTwitchLobby || !lobby.twitchAcceptingPlayers) {
      return null;
    }

    if (lobby.status !== 'waiting') {
      return null;
    }

    // Check if user is already in waitlist
    const existing = await db.query.lobbyWaitlist.findFirst({
      where: and(
        eq(lobbyWaitlist.lobbyId, lobbyId),
        eq(lobbyWaitlist.userId, userId)
      ),
    });

    if (existing) {
      return null;
    }

    // Check if user is already a participant
    const existingParticipant = await db.query.lobbyParticipants.findFirst({
      where: and(
        eq(lobbyParticipants.lobbyId, lobbyId),
        eq(lobbyParticipants.userId, userId)
      ),
    });

    if (existingParticipant) {
      return null;
    }

    // Check waitlist size
    const currentCount = await this.getWaitlistCount(lobbyId);
    if (currentCount >= MAX_WAITLIST_SIZE) {
      return null;
    }

    // Get next position
    const maxPositionResult = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(position), 0)` })
      .from(lobbyWaitlist)
      .where(eq(lobbyWaitlist.lobbyId, lobbyId));

    const nextPosition = (maxPositionResult[0]?.maxPos || 0) + 1;

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return null;
    }

    // Insert into waitlist
    const [entry] = await db
      .insert(lobbyWaitlist)
      .values({
        id: nanoid(),
        lobbyId,
        userId,
        position: nextPosition,
      })
      .returning();

    return {
      id: entry.id,
      lobbyId: entry.lobbyId,
      userId: entry.userId,
      position: entry.position,
      joinedAt: entry.joinedAt,
      user: toPublicUser(user),
    };
  }

  async leaveWaitlist(lobbyId: string, userId: string): Promise<boolean> {
    const entry = await db.query.lobbyWaitlist.findFirst({
      where: and(
        eq(lobbyWaitlist.lobbyId, lobbyId),
        eq(lobbyWaitlist.userId, userId)
      ),
    });

    if (!entry) {
      return false;
    }

    // Delete the entry
    await db
      .delete(lobbyWaitlist)
      .where(eq(lobbyWaitlist.id, entry.id));

    // Reorder positions for remaining entries
    await db
      .update(lobbyWaitlist)
      .set({
        position: sql`${lobbyWaitlist.position} - 1`,
      })
      .where(
        and(
          eq(lobbyWaitlist.lobbyId, lobbyId),
          gt(lobbyWaitlist.position, entry.position)
        )
      );

    return true;
  }

  async promoteToLobby(lobbyId: string, userId: string): Promise<typeof lobbyParticipants.$inferSelect | null> {
    // Check if user is in waitlist
    const entry = await db.query.lobbyWaitlist.findFirst({
      where: and(
        eq(lobbyWaitlist.lobbyId, lobbyId),
        eq(lobbyWaitlist.userId, userId)
      ),
    });

    if (!entry) {
      return null;
    }

    // Check lobby exists and has room
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobbyId),
      with: {
        participants: true,
      },
    });

    if (!lobby || lobby.status !== 'waiting') {
      return null;
    }

    // Count non-spectator participants
    const nonSpectatorCount = lobby.participants.filter(
      (p) => p.team !== 'spectator'
    ).length;

    if (nonSpectatorCount >= lobby.maxPlayers) {
      return null;
    }

    // Remove from waitlist
    await this.leaveWaitlist(lobbyId, userId);

    // Add as participant
    const [participant] = await db
      .insert(lobbyParticipants)
      .values({
        id: nanoid(),
        lobbyId,
        userId,
        team: 'unassigned',
      })
      .returning();

    return participant;
  }

  async fillFromWaitlist(lobbyId: string, count: number): Promise<typeof lobbyParticipants.$inferSelect[]> {
    const promoted: typeof lobbyParticipants.$inferSelect[] = [];

    // Get lobby with participants
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobbyId),
      with: {
        participants: true,
      },
    });

    if (!lobby || lobby.status !== 'waiting') {
      return promoted;
    }

    // Count non-spectator participants
    const nonSpectatorCount = lobby.participants.filter(
      (p) => p.team !== 'spectator'
    ).length;

    const availableSlots = lobby.maxPlayers - nonSpectatorCount;
    const toPromote = Math.min(count, availableSlots);

    // Get waitlist entries (already ordered by position)
    const waitlistEntries = await db.query.lobbyWaitlist.findMany({
      where: eq(lobbyWaitlist.lobbyId, lobbyId),
      orderBy: [asc(lobbyWaitlist.position)],
      limit: toPromote,
    });

    // Shuffle the entries for random selection
    const shuffled = [...waitlistEntries].sort(() => Math.random() - 0.5);

    for (const entry of shuffled.slice(0, toPromote)) {
      const participant = await this.promoteToLobby(lobbyId, entry.userId);
      if (participant) {
        promoted.push(participant);
      }
    }

    return promoted;
  }

  async clearWaitlist(lobbyId: string): Promise<void> {
    await db
      .delete(lobbyWaitlist)
      .where(eq(lobbyWaitlist.lobbyId, lobbyId));
  }

  async isUserInWaitlist(lobbyId: string, userId: string): Promise<boolean> {
    const entry = await db.query.lobbyWaitlist.findFirst({
      where: and(
        eq(lobbyWaitlist.lobbyId, lobbyId),
        eq(lobbyWaitlist.userId, userId)
      ),
    });

    return !!entry;
  }
}

export const waitlistManager = new WaitlistManager();
