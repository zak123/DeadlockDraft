import { db, lobbies, lobbyParticipants } from '../db';
import { eq, and, lt } from 'drizzle-orm';
import { nanoid, customAlphabet } from 'nanoid';
import { getConfig } from '../config/env';
import { DEFAULT_MATCH_CONFIG, LOBBY_CODE_LENGTH, DEFAULT_MAX_PLAYERS, MAX_SPECTATORS } from '../config/match-defaults';
import type { LobbyWithParticipants, MatchConfig, Team, PublicUser, TwitchLobbyWithWaitlist } from '@deadlock-draft/shared';
import type { Lobby, LobbyParticipant, User } from '../db/schema';
import { twitchAuthService } from './twitch-auth';

const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', LOBBY_CODE_LENGTH);
const generateInviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8); // Longer for Twitch invite codes

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    steamId: user.steamId,
    displayName: user.displayName,
    avatarMedium: user.avatarMedium,
    twitchUsername: user.twitchUsername,
    twitchDisplayName: user.twitchDisplayName,
    twitchAvatar: user.twitchAvatar,
  };
}

function toLobbyWithParticipants(
  lobby: Lobby,
  participants: (LobbyParticipant & { user: User | null })[],
  host: User
): LobbyWithParticipants {
  return {
    id: lobby.id,
    code: lobby.code,
    name: lobby.name,
    hostUserId: lobby.hostUserId,
    status: lobby.status,
    deadlockPartyCode: lobby.deadlockPartyCode,
    deadlockLobbyId: lobby.deadlockLobbyId,
    deadlockMatchId: lobby.deadlockMatchId,
    matchConfig: lobby.matchConfig,
    maxPlayers: lobby.maxPlayers,
    isPublic: lobby.isPublic,
    allowTeamChange: lobby.allowTeamChange,
    isTwitchLobby: lobby.isTwitchLobby,
    twitchAcceptingPlayers: lobby.twitchAcceptingPlayers,
    twitchStreamUrl: lobby.twitchStreamUrl,
    inviteCode: lobby.inviteCode,
    draftCompletedAt: lobby.draftCompletedAt,
    createdAt: lobby.createdAt,
    updatedAt: lobby.updatedAt,
    expiresAt: lobby.expiresAt,
    host: toPublicUser(host),
    participants: participants.map((p) => ({
      id: p.id,
      lobbyId: p.lobbyId,
      userId: p.userId,
      anonymousName: p.anonymousName,
      sessionToken: null, // Never expose session tokens
      team: p.team as Team,
      isReady: p.isReady,
      isCaptain: p.isCaptain,
      joinedAt: p.joinedAt,
      user: p.user ? toPublicUser(p.user) : null,
    })),
  };
}

export class LobbyManager {
  private config = getConfig();

  async createLobby(
    hostUser: User,
    name: string | undefined,
    matchConfig?: Partial<MatchConfig>,
    maxPlayers?: number,
    isPublic?: boolean
  ): Promise<LobbyWithParticipants> {
    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.config.LOBBY_EXPIRY_HOURS);

    // Auto-generate name for public lobbies
    const lobbyName = isPublic
      ? `${hostUser.displayName}'s Lobby ${code}`
      : name || 'My Lobby';

    const [lobby] = await db
      .insert(lobbies)
      .values({
        id: nanoid(),
        code,
        name: lobbyName,
        hostUserId: hostUser.id,
        matchConfig: { ...DEFAULT_MATCH_CONFIG, ...matchConfig },
        maxPlayers: maxPlayers || DEFAULT_MAX_PLAYERS,
        isPublic: isPublic || false,
        expiresAt: expiresAt.toISOString(),
      })
      .returning();

    // Add host as first participant
    const [hostParticipant] = await db
      .insert(lobbyParticipants)
      .values({
        id: nanoid(),
        lobbyId: lobby.id,
        userId: hostUser.id,
        team: 'unassigned',
      })
      .returning();

    return toLobbyWithParticipants(
      lobby,
      [{ ...hostParticipant, user: hostUser }],
      hostUser
    );
  }

  async getLobbyByCode(code: string): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    return toLobbyWithParticipants(lobby, lobby.participants, lobby.host);
  }

  async setPartyCode(code: string, partyCode: string): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
    });

    if (!lobby) return null;

    await db
      .update(lobbies)
      .set({
        deadlockPartyCode: partyCode,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(lobbies.id, lobby.id));

    return this.getLobbyByCode(code);
  }

  async joinLobby(
    code: string,
    user?: User,
    anonymousName?: string
  ): Promise<{ lobby: LobbyWithParticipants; participant: LobbyParticipant; sessionToken?: string } | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    if (lobby.status !== 'waiting') {
      throw new Error('Lobby is not accepting new participants');
    }

    // Count non-spectator participants (spectators have separate slots)
    const playerCount = lobby.participants.filter((p) => p.team !== 'spectator').length;
    if (playerCount >= lobby.maxPlayers) {
      throw new Error('Lobby is full');
    }

    // Check if user is already in lobby
    if (user) {
      const existing = lobby.participants.find((p) => p.userId === user.id);
      if (existing) {
        return {
          lobby: toLobbyWithParticipants(lobby, lobby.participants, lobby.host),
          participant: existing,
        };
      }
    }

    const sessionToken = user ? undefined : nanoid(32);

    const [participant] = await db
      .insert(lobbyParticipants)
      .values({
        id: nanoid(),
        lobbyId: lobby.id,
        userId: user?.id || null,
        anonymousName: user ? null : anonymousName,
        sessionToken,
        team: 'unassigned',
      })
      .returning();

    const updatedParticipants = [
      ...lobby.participants,
      { ...participant, user: user || null },
    ];

    return {
      lobby: toLobbyWithParticipants(lobby, updatedParticipants, lobby.host),
      participant,
      sessionToken,
    };
  }

  // Join a Twitch lobby directly via invite code (bypasses waitlist)
  async joinLobbyByInviteCode(
    inviteCode: string,
    user: User
  ): Promise<{ lobby: LobbyWithParticipants; participant: LobbyParticipant } | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.inviteCode, inviteCode.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    if (!lobby.isTwitchLobby) {
      throw new Error('Invite codes are only valid for Twitch lobbies');
    }

    if (lobby.status !== 'waiting') {
      throw new Error('Lobby is not accepting new participants');
    }

    // Count non-spectator participants
    const playerCount = lobby.participants.filter((p) => p.team !== 'spectator').length;
    if (playerCount >= lobby.maxPlayers) {
      throw new Error('Lobby is full');
    }

    // Check if user is already in lobby
    const existing = lobby.participants.find((p) => p.userId === user.id);
    if (existing) {
      return {
        lobby: toLobbyWithParticipants(lobby, lobby.participants, lobby.host),
        participant: existing,
      };
    }

    const [participant] = await db
      .insert(lobbyParticipants)
      .values({
        id: nanoid(),
        lobbyId: lobby.id,
        userId: user.id,
        team: 'unassigned',
      })
      .returning();

    const updatedParticipants = [
      ...lobby.participants,
      { ...participant, user },
    ];

    return {
      lobby: toLobbyWithParticipants(lobby, updatedParticipants, lobby.host),
      participant,
    };
  }

  async leaveLobby(
    code: string,
    userId?: string,
    sessionToken?: string
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    // Find participant
    let participant: LobbyParticipant | undefined;
    if (userId) {
      participant = lobby.participants.find((p) => p.userId === userId);
    } else if (sessionToken) {
      participant = lobby.participants.find((p) => p.sessionToken === sessionToken);
    }

    if (!participant) return null;

    // Host cannot leave - must cancel lobby instead
    if (participant.userId === lobby.hostUserId) {
      throw new Error('Host cannot leave lobby. Cancel the lobby instead.');
    }

    // If participant was captain, assign a new captain from their team
    if (participant.isCaptain && (participant.team === 'amber' || participant.team === 'sapphire')) {
      const remainingTeamMembers = lobby.participants.filter(
        (p) => p.team === participant!.team && p.id !== participant!.id
      );
      if (remainingTeamMembers.length > 0) {
        await db
          .update(lobbyParticipants)
          .set({ isCaptain: true })
          .where(eq(lobbyParticipants.id, remainingTeamMembers[0].id));
      }
    }

    await db.delete(lobbyParticipants).where(eq(lobbyParticipants.id, participant.id));

    // Fetch updated state to reflect captain changes
    const updatedLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobby.id),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!updatedLobby) return null;
    return toLobbyWithParticipants(updatedLobby, updatedLobby.participants, updatedLobby.host);
  }

  async kickParticipant(
    code: string,
    hostUserId: string,
    participantId: string
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;
    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can kick participants');
    }

    const participant = lobby.participants.find((p) => p.id === participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Cannot kick the host
    if (participant.userId === lobby.hostUserId) {
      throw new Error('Cannot kick the host');
    }

    // If participant was captain, assign a new captain from their team
    if (participant.isCaptain && (participant.team === 'amber' || participant.team === 'sapphire')) {
      const remainingTeamMembers = lobby.participants.filter(
        (p) => p.team === participant.team && p.id !== participant.id
      );
      if (remainingTeamMembers.length > 0) {
        await db
          .update(lobbyParticipants)
          .set({ isCaptain: true })
          .where(eq(lobbyParticipants.id, remainingTeamMembers[0].id));
      }
    }

    await db.delete(lobbyParticipants).where(eq(lobbyParticipants.id, participant.id));

    // Fetch updated state
    const updatedLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobby.id),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!updatedLobby) return null;
    return toLobbyWithParticipants(updatedLobby, updatedLobby.participants, updatedLobby.host);
  }

  async updateLobby(
    code: string,
    hostUserId: string,
    updates: { name?: string; matchConfig?: Partial<MatchConfig>; maxPlayers?: number; allowTeamChange?: boolean }
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;
    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can update the lobby');
    }

    const updateData: any = { updatedAt: new Date().toISOString() };
    if (updates.name) updateData.name = updates.name;
    if (updates.maxPlayers) updateData.maxPlayers = updates.maxPlayers;
    if (updates.matchConfig) {
      updateData.matchConfig = { ...lobby.matchConfig, ...updates.matchConfig };
    }
    if (updates.allowTeamChange !== undefined) {
      updateData.allowTeamChange = updates.allowTeamChange;
    }

    const [updated] = await db
      .update(lobbies)
      .set(updateData)
      .where(eq(lobbies.id, lobby.id))
      .returning();

    return toLobbyWithParticipants(updated, lobby.participants, lobby.host);
  }

  async cancelLobby(code: string, hostUserId: string): Promise<void> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
    });

    if (!lobby) throw new Error('Lobby not found');
    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can cancel the lobby');
    }

    await db
      .update(lobbies)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(lobbies.id, lobby.id));
  }

  async moveParticipantToTeam(
    code: string,
    hostUserId: string,
    participantId: string,
    team: Team
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;
    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can move participants');
    }

    const participant = lobby.participants.find((p) => p.id === participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Check spectator limit when moving to spectator
    if (team === 'spectator' && participant.team !== 'spectator') {
      const spectatorCount = lobby.participants.filter((p) => p.team === 'spectator').length;
      if (spectatorCount >= MAX_SPECTATORS) {
        throw new Error(`Spectator slots are full (max ${MAX_SPECTATORS})`);
      }
    }

    const oldTeam = participant.team;
    const isMovingToTeam = team === 'amber' || team === 'sapphire';
    const isLeavingTeam = (oldTeam === 'amber' || oldTeam === 'sapphire') && !isMovingToTeam;
    const isChangingTeam = (oldTeam === 'amber' || oldTeam === 'sapphire') && isMovingToTeam && oldTeam !== team;

    // Determine if we need to auto-assign captain on new team
    let shouldBeCaptain = false;
    if (isMovingToTeam) {
      const teamHasCaptain = lobby.participants.some(
        (p) => p.team === team && p.isCaptain && p.id !== participantId
      );
      if (!teamHasCaptain) {
        // Check if there are other members on this team already
        const teamMembers = lobby.participants.filter(
          (p) => p.team === team && p.id !== participantId
        );
        // If no members or no captain, this participant becomes captain
        shouldBeCaptain = teamMembers.length === 0 || !teamHasCaptain;
      }
    }

    // If leaving a team (to spectator/unassigned) or changing teams, reset captain status
    const resetCaptain = isLeavingTeam || isChangingTeam;

    await db
      .update(lobbyParticipants)
      .set({
        team,
        isCaptain: shouldBeCaptain ? true : (resetCaptain ? false : participant.isCaptain)
      })
      .where(eq(lobbyParticipants.id, participantId));

    // If participant was captain and is leaving their old team, assign new captain
    if ((isLeavingTeam || isChangingTeam) && participant.isCaptain) {
      const remainingTeamMembers = lobby.participants.filter(
        (p) => p.team === oldTeam && p.id !== participantId
      );
      if (remainingTeamMembers.length > 0) {
        await db
          .update(lobbyParticipants)
          .set({ isCaptain: true })
          .where(eq(lobbyParticipants.id, remainingTeamMembers[0].id));
      }
    }

    // Fetch updated state
    const updatedLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobby.id),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!updatedLobby) return null;
    return toLobbyWithParticipants(updatedLobby, updatedLobby.participants, updatedLobby.host);
  }

  async changeSelfTeam(
    code: string,
    team: Team,
    userId?: string,
    sessionToken?: string
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    if (!lobby.allowTeamChange) {
      throw new Error('Team changes are not allowed in this lobby');
    }

    // Find the participant
    let participant: LobbyParticipant | undefined;
    if (userId) {
      participant = lobby.participants.find((p) => p.userId === userId);
    } else if (sessionToken) {
      participant = lobby.participants.find((p) => p.sessionToken === sessionToken);
    }

    if (!participant) {
      throw new Error('Participant not found');
    }

    // Check spectator limit when moving to spectator
    if (team === 'spectator' && participant.team !== 'spectator') {
      const spectatorCount = lobby.participants.filter((p) => p.team === 'spectator').length;
      if (spectatorCount >= MAX_SPECTATORS) {
        throw new Error(`Spectator slots are full (max ${MAX_SPECTATORS})`);
      }
    }

    // Check team size limits when moving to a team
    if (team === 'amber' || team === 'sapphire') {
      const teamCount = lobby.participants.filter((p) => p.team === team && p.id !== participant!.id).length;
      if (teamCount >= lobby.matchConfig.teamSize) {
        throw new Error(`Team is full (max ${lobby.matchConfig.teamSize})`);
      }
    }

    const oldTeam = participant.team;
    const isMovingToTeam = team === 'amber' || team === 'sapphire';
    const isLeavingTeam = (oldTeam === 'amber' || oldTeam === 'sapphire') && !isMovingToTeam;
    const isChangingTeam = (oldTeam === 'amber' || oldTeam === 'sapphire') && isMovingToTeam && oldTeam !== team;

    // Determine if we need to auto-assign captain on new team
    let shouldBeCaptain = false;
    if (isMovingToTeam) {
      const teamHasCaptain = lobby.participants.some(
        (p) => p.team === team && p.isCaptain && p.id !== participant!.id
      );
      if (!teamHasCaptain) {
        const teamMembers = lobby.participants.filter(
          (p) => p.team === team && p.id !== participant!.id
        );
        shouldBeCaptain = teamMembers.length === 0 || !teamHasCaptain;
      }
    }

    // If leaving a team or changing teams, reset captain status
    const resetCaptain = isLeavingTeam || isChangingTeam;

    await db
      .update(lobbyParticipants)
      .set({
        team,
        isCaptain: shouldBeCaptain ? true : (resetCaptain ? false : participant.isCaptain)
      })
      .where(eq(lobbyParticipants.id, participant.id));

    // If participant was captain and is leaving their old team, assign new captain
    if ((isLeavingTeam || isChangingTeam) && participant.isCaptain) {
      const remainingTeamMembers = lobby.participants.filter(
        (p) => p.team === oldTeam && p.id !== participant!.id
      );
      if (remainingTeamMembers.length > 0) {
        await db
          .update(lobbyParticipants)
          .set({ isCaptain: true })
          .where(eq(lobbyParticipants.id, remainingTeamMembers[0].id));
      }
    }

    // Fetch updated state
    const updatedLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobby.id),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!updatedLobby) return null;
    return toLobbyWithParticipants(updatedLobby, updatedLobby.participants, updatedLobby.host);
  }

  async setParticipantCaptain(
    code: string,
    hostUserId: string,
    participantId: string,
    isCaptain: boolean
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;
    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can assign captains');
    }

    const participant = lobby.participants.find((p) => p.id === participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Captains must be on a team (amber or sapphire)
    if (isCaptain && participant.team !== 'amber' && participant.team !== 'sapphire') {
      throw new Error('Captains must be assigned to a team first');
    }

    // If setting as captain, remove captain status from any other player on the same team
    if (isCaptain) {
      const existingCaptain = lobby.participants.find(
        (p) => p.team === participant.team && p.isCaptain && p.id !== participantId
      );
      if (existingCaptain) {
        await db
          .update(lobbyParticipants)
          .set({ isCaptain: false })
          .where(eq(lobbyParticipants.id, existingCaptain.id));
      }
    }

    await db
      .update(lobbyParticipants)
      .set({ isCaptain })
      .where(eq(lobbyParticipants.id, participantId));

    // Fetch updated participants
    const updatedLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobby.id),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!updatedLobby) return null;
    return toLobbyWithParticipants(updatedLobby, updatedLobby.participants, updatedLobby.host);
  }

  async setParticipantReady(
    code: string,
    userId?: string,
    sessionToken?: string,
    isReady: boolean = true
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    let participant: LobbyParticipant | undefined;
    if (userId) {
      participant = lobby.participants.find((p) => p.userId === userId);
    } else if (sessionToken) {
      participant = lobby.participants.find((p) => p.sessionToken === sessionToken);
    }

    if (!participant) return null;

    await db
      .update(lobbyParticipants)
      .set({ isReady })
      .where(eq(lobbyParticipants.id, participant.id));

    const updatedParticipants = lobby.participants.map((p) =>
      p.id === participant!.id ? { ...p, isReady } : p
    );

    return toLobbyWithParticipants(lobby, updatedParticipants, lobby.host);
  }

  async updateLobbyDeadlockInfo(
    lobbyId: string,
    data: {
      partyCode?: string;
      deadlockLobbyId?: string;
      matchId?: string;
      status?: 'waiting' | 'starting' | 'in_progress' | 'completed' | 'cancelled';
    }
  ): Promise<void> {
    const updateData: any = { updatedAt: new Date().toISOString() };
    if (data.partyCode) updateData.deadlockPartyCode = data.partyCode;
    if (data.deadlockLobbyId) updateData.deadlockLobbyId = data.deadlockLobbyId;
    if (data.matchId) updateData.deadlockMatchId = data.matchId;
    if (data.status) updateData.status = data.status;

    await db.update(lobbies).set(updateData).where(eq(lobbies.id, lobbyId));
  }

  async cleanupExpiredLobbies(): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(lobbies)
      .set({ status: 'cancelled' })
      .where(and(lt(lobbies.expiresAt, now), eq(lobbies.status, 'waiting')));
  }

  async getParticipantByToken(sessionToken: string): Promise<LobbyParticipant | null> {
    const participant = await db.query.lobbyParticipants.findFirst({
      where: eq(lobbyParticipants.sessionToken, sessionToken),
    });
    return participant || null;
  }

  async getPublicLobbies(page: number = 1, pageSize: number = 5): Promise<{
    lobbies: LobbyWithParticipants[];
    totalCount: number;
  }> {
    const publicLobbies = await db.query.lobbies.findMany({
      where: and(eq(lobbies.isPublic, true), eq(lobbies.status, 'waiting')),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
      orderBy: (lobbies, { desc }) => [desc(lobbies.createdAt)],
    });

    const totalCount = publicLobbies.length;
    const offset = (page - 1) * pageSize;
    const paginatedLobbies = publicLobbies.slice(offset, offset + pageSize);

    return {
      lobbies: paginatedLobbies.map((lobby) =>
        toLobbyWithParticipants(lobby, lobby.participants, lobby.host)
      ),
      totalCount,
    };
  }

  async createTwitchLobby(
    hostUser: User,
    matchConfig?: Partial<MatchConfig>,
    maxPlayers?: number
  ): Promise<LobbyWithParticipants> {
    if (!hostUser.twitchUsername) {
      throw new Error('Twitch account must be linked to create a Twitch lobby');
    }

    const code = generateCode();
    const inviteCode = generateInviteCode(); // Separate code for direct invites
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.config.LOBBY_EXPIRY_HOURS);

    // Auto-generate name with code (invite code is now required to skip waitlist)
    const lobbyName = `${hostUser.twitchDisplayName || hostUser.displayName}'s Lobby ${code}`;
    const twitchStreamUrl = `https://twitch.tv/${hostUser.twitchUsername}`;

    const [lobby] = await db
      .insert(lobbies)
      .values({
        id: nanoid(),
        code,
        name: lobbyName,
        hostUserId: hostUser.id,
        matchConfig: { ...DEFAULT_MATCH_CONFIG, ...matchConfig },
        maxPlayers: maxPlayers || DEFAULT_MAX_PLAYERS,
        isPublic: false, // Twitch lobbies start private
        isTwitchLobby: true,
        twitchAcceptingPlayers: false, // Host must explicitly start accepting
        twitchStreamUrl,
        inviteCode, // Separate from URL code to prevent waitlist bypass
        expiresAt: expiresAt.toISOString(),
      })
      .returning();

    // Add host as first participant
    const [hostParticipant] = await db
      .insert(lobbyParticipants)
      .values({
        id: nanoid(),
        lobbyId: lobby.id,
        userId: hostUser.id,
        team: 'unassigned',
      })
      .returning();

    return toLobbyWithParticipants(
      lobby,
      [{ ...hostParticipant, user: hostUser }],
      hostUser
    );
  }

  async getTwitchLobbies(page: number = 1, pageSize: number = 5): Promise<{
    lobbies: TwitchLobbyWithWaitlist[];
    totalCount: number;
  }> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    // Get Twitch lobbies that are either:
    // 1. Accepting players and in waiting status
    // 2. Draft completed within the last hour
    const twitchLobbies = await db.query.lobbies.findMany({
      where: and(
        eq(lobbies.isTwitchLobby, true),
        eq(lobbies.twitchAcceptingPlayers, true)
      ),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
        waitlist: true,
      },
      orderBy: (lobbies, { desc }) => [desc(lobbies.createdAt)],
    });

    // Filter to include completed lobbies within 1 hour
    const filteredLobbies = twitchLobbies.filter((lobby) => {
      if (lobby.status === 'waiting') return true;
      if (lobby.status === 'completed' && lobby.draftCompletedAt) {
        const completedAt = new Date(lobby.draftCompletedAt);
        return completedAt > oneHourAgo;
      }
      return false;
    });

    // Get Twitch usernames for viewer count lookup
    const usernames = filteredLobbies
      .map((lobby) => lobby.host.twitchUsername)
      .filter((username): username is string => !!username);

    // Fetch viewer counts from Twitch API
    const viewerCounts = await twitchAuthService.getStreamViewerCounts(usernames);

    // Map lobbies with viewer counts and sort by viewer count (highest first)
    const lobbiesWithViewerCount = filteredLobbies.map((lobby) => {
      const username = lobby.host.twitchUsername?.toLowerCase();
      const viewerCount = username ? (viewerCounts.get(username) ?? 0) : 0;
      return {
        ...toLobbyWithParticipants(lobby, lobby.participants, lobby.host),
        waitlistCount: lobby.waitlist.length,
        viewerCount,
      };
    });

    // Sort by viewer count (highest first), then by created date for ties
    lobbiesWithViewerCount.sort((a, b) => {
      if (b.viewerCount !== a.viewerCount) {
        return b.viewerCount - a.viewerCount;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalCount = lobbiesWithViewerCount.length;
    const offset = (page - 1) * pageSize;
    const paginatedLobbies = lobbiesWithViewerCount.slice(offset, offset + pageSize);

    return {
      lobbies: paginatedLobbies,
      totalCount,
    };
  }

  async toggleAcceptingPlayers(
    code: string,
    hostUserId: string,
    accepting: boolean
  ): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, code.toUpperCase()),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    if (!lobby.isTwitchLobby) {
      throw new Error('This is not a Twitch lobby');
    }

    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can toggle accepting players');
    }

    const [updated] = await db
      .update(lobbies)
      .set({
        twitchAcceptingPlayers: accepting,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(lobbies.id, lobby.id))
      .returning();

    return toLobbyWithParticipants(updated, lobby.participants, lobby.host);
  }

  async setDraftCompletedAt(lobbyId: string): Promise<void> {
    await db
      .update(lobbies)
      .set({
        draftCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(lobbies.id, lobbyId));
  }

  async getLobbyById(id: string): Promise<LobbyWithParticipants | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, id),
      with: {
        host: true,
        participants: {
          with: { user: true },
        },
      },
    });

    if (!lobby) return null;

    return toLobbyWithParticipants(lobby, lobby.participants, lobby.host);
  }
}

export const lobbyManager = new LobbyManager();
