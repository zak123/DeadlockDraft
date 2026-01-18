import type { ServerWebSocket } from 'bun';
import type { WSClientMessage, WSServerMessage, LobbyWithParticipants, WaitlistEntry, LobbyParticipant } from '@deadlock-draft/shared';
import { lobbyManager } from './lobby-manager';
import { draftManager } from './draft-manager';
import { db, sessions, lobbyParticipants } from '../db';
import { eq, and, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';

interface WebSocketData {
  connectionId: string;
  lobbyCode: string | null;
  userId: string | null;
  sessionToken: string | null;
}

type WSClient = ServerWebSocket<WebSocketData>;

// Participant connection info for tracking
interface ParticipantConnection {
  lobbyCode: string;
  visitorId: string;
  visitorUserId: string | null;
  sessionToken: string | null;
  lastSeen: number;
}

class WebSocketManager {
  private lobbySockets: Map<string, Set<WSClient>> = new Map();
  // Track connected participants by visitorKey (visitorUserId or sessionToken)
  private connectedParticipants: Map<string, ParticipantConnection> = new Map();
  // Stale participant timeout (60 seconds)
  private readonly STALE_TIMEOUT_MS = 60 * 1000;

  constructor() {
    // Start cleanup interval (runs every 30 seconds)
    setInterval(() => this.cleanupStaleParticipants(), 30 * 1000);
  }

  async handleOpen(ws: WSClient) {
    const connectionId = nanoid();
    ws.data.connectionId = connectionId;
    ws.data.lobbyCode = null;
    // userId may be passed from the upgrade request if user is authenticated
    ws.data.userId = ws.data.userId || null;
    ws.data.sessionToken = null;

    this.send(ws, { type: 'connected', connectionId });
  }

  async handleMessage(ws: WSClient, message: string) {
    // Update last seen time on any message
    this.updateLastSeen(ws);

    try {
      const data = JSON.parse(message) as WSClientMessage;

      switch (data.type) {
        case 'lobby:join':
          await this.handleLobbyJoin(ws, data.lobbyCode, data.sessionToken);
          break;
        case 'lobby:leave':
          await this.handleLobbyLeave(ws);
          break;
        case 'lobby:ready':
          await this.handleReady(ws, data.isReady);
          break;
        case 'lobby:chat':
          await this.handleChat(ws, data.message);
          break;
        case 'draft:pick':
          await this.handleDraftPick(ws, data.heroId);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      this.send(ws, { type: 'error', message: 'Invalid message format' });
    }
  }

  async handleClose(ws: WSClient) {
    await this.removeFromLobbyAndDatabase(ws);
  }

  private updateLastSeen(ws: WSClient) {
    const key = this.getParticipantKey(ws);
    if (key && ws.data.lobbyCode) {
      const existing = this.connectedParticipants.get(key);
      if (existing) {
        existing.lastSeen = Date.now();
      }
    }
  }

  private getParticipantKey(ws: WSClient): string | null {
    if (ws.data.userId) return `user:${ws.data.userId}`;
    if (ws.data.sessionToken) return `session:${ws.data.sessionToken}`;
    return null;
  }

  private async handleLobbyJoin(ws: WSClient, lobbyCode: string, sessionToken?: string) {
    if (sessionToken) {
      const participant = await lobbyManager.getParticipantByToken(sessionToken);
      if (participant) {
        ws.data.sessionToken = sessionToken;
      }
    }

    // Get lobby data
    const lobby = await lobbyManager.getLobbyByCode(lobbyCode);
    if (!lobby) {
      this.send(ws, { type: 'error', message: 'Lobby not found' });
      return;
    }

    // Remove from previous lobby if any
    this.removeFromLobby(ws);

    // Add to new lobby
    ws.data.lobbyCode = lobbyCode.toUpperCase();

    if (!this.lobbySockets.has(ws.data.lobbyCode)) {
      this.lobbySockets.set(ws.data.lobbyCode, new Set());
    }
    this.lobbySockets.get(ws.data.lobbyCode)!.add(ws);

    // Track this participant as connected
    const key = this.getParticipantKey(ws);
    if (key) {
      this.connectedParticipants.set(key, {
        lobbyCode: ws.data.lobbyCode,
        visitorId: ws.data.connectionId,
        visitorUserId: ws.data.userId,
        sessionToken: ws.data.sessionToken,
        lastSeen: Date.now(),
      });
    }

    // Send current lobby state
    this.send(ws, { type: 'lobby:update', lobby });
  }

  private async handleLobbyLeave(ws: WSClient) {
    await this.removeFromLobbyAndDatabase(ws);
  }

  private async handleReady(ws: WSClient, isReady: boolean) {
    if (!ws.data.lobbyCode) {
      this.send(ws, { type: 'error', message: 'Not in a lobby' });
      return;
    }

    const lobby = await lobbyManager.setParticipantReady(
      ws.data.lobbyCode,
      ws.data.userId || undefined,
      ws.data.sessionToken || undefined,
      isReady
    );

    if (lobby) {
      this.broadcastToLobby(ws.data.lobbyCode, { type: 'lobby:update', lobby });
    }
  }

  private async handleChat(ws: WSClient, message: string) {
    if (!ws.data.lobbyCode) {
      this.send(ws, { type: 'error', message: 'Not in a lobby' });
      return;
    }

    // Get sender info from lobby participants
    const lobby = await lobbyManager.getLobbyByCode(ws.data.lobbyCode);
    if (!lobby) {
      this.send(ws, { type: 'error', message: 'Lobby not found' });
      return;
    }

    let senderId = 'unknown';
    let senderName = 'Anonymous';

    // Find participant in lobby
    const participant = lobby.participants.find(p =>
      (ws.data.userId && p.userId === ws.data.userId) ||
      (ws.data.sessionToken && p.sessionToken === ws.data.sessionToken)
    );

    if (participant) {
      senderId = participant.id;
      senderName = participant.user?.displayName || participant.anonymousName || 'Anonymous';
    }

    this.broadcastToLobby(ws.data.lobbyCode, {
      type: 'lobby:chat',
      senderId,
      senderName,
      message: message.slice(0, 500), // Limit message length
      timestamp: new Date().toISOString(),
    });
  }

  private async handleDraftPick(ws: WSClient, heroId: string) {
    if (!ws.data.lobbyCode) {
      this.send(ws, { type: 'error', message: 'Not in a lobby' });
      return;
    }

    try {
      await draftManager.makePick(
        ws.data.lobbyCode,
        heroId,
        ws.data.userId || undefined,
        ws.data.sessionToken || undefined
      );
      // Draft state broadcasting is handled by draftManager
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to make pick';
      this.send(ws, { type: 'error', message: errorMessage });
    }
  }

  private removeFromLobby(ws: WSClient) {
    if (ws.data.lobbyCode) {
      const sockets = this.lobbySockets.get(ws.data.lobbyCode);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          this.lobbySockets.delete(ws.data.lobbyCode);
        }
      }
    }

    // Remove from connected participants tracking
    const key = this.getParticipantKey(ws);
    if (key) {
      this.connectedParticipants.delete(key);
    }

    ws.data.lobbyCode = null;
  }

  private async removeFromLobbyAndDatabase(ws: WSClient) {
    const lobbyCode = ws.data.lobbyCode;
    const userId = ws.data.userId;
    const sessionToken = ws.data.sessionToken;

    // Remove from in-memory tracking
    this.removeFromLobby(ws);

    // Remove from database if we have identification
    if (lobbyCode && (userId || sessionToken)) {
      try {
        // Check if there's an active draft and if the disconnecting user is a captain
        const lobby = await lobbyManager.getLobbyByCode(lobbyCode);
        if (!lobby) return;

        const draftSession = await draftManager.getDraftSession(lobby.id);

        // Don't remove users from completed lobbies - they may just be refreshing
        // and need to see the party code when they come back
        if (lobby.status === 'completed' || (draftSession && draftSession.status === 'completed')) {
          console.log('User disconnected from completed lobby, keeping in database:', userId || sessionToken);
          return;
        }

        if (draftSession && draftSession.status === 'active') {
          // Find the disconnecting participant
          const participant = lobby.participants.find(p =>
            (userId && p.userId === userId) ||
            (sessionToken && p.sessionToken === sessionToken)
          );

          // Check if they're a captain on an actual team (not spectator/unassigned)
          if (participant && participant.isCaptain && (participant.team === 'amber' || participant.team === 'sapphire')) {
            const teamName = participant.team === 'amber' ? 'Amber' : 'Sapphire';
            const playerName = participant.user?.displayName || participant.anonymousName || 'A captain';

            // Cancel the draft due to captain disconnect
            await draftManager.cancelDraftForDisconnect(
              lobbyCode,
              lobby.id,
              `Draft cancelled: ${playerName} (${teamName} captain) disconnected`
            );
          }
        }

        const updatedLobby = await lobbyManager.leaveLobby(lobbyCode, userId || undefined, sessionToken || undefined);
        if (updatedLobby) {
          // Broadcast to remaining participants
          this.broadcastToLobby(lobbyCode, { type: 'lobby:update', lobby: updatedLobby });
        }
      } catch (error) {
        // Host can't leave - that's fine, they just disconnected temporarily
        console.log('User disconnected but not removed from lobby (may be host):', error);
      }
    }
  }

  private async cleanupStaleParticipants() {
    const now = Date.now();
    const staleKeys: string[] = [];

    // Find stale connections
    for (const [key, connection] of this.connectedParticipants) {
      if (now - connection.lastSeen > this.STALE_TIMEOUT_MS) {
        staleKeys.push(key);
      }
    }

    // Remove stale participants
    for (const key of staleKeys) {
      const connection = this.connectedParticipants.get(key);
      if (!connection) continue;

      try {
        // Check lobby and draft status
        const lobby = await lobbyManager.getLobbyByCode(connection.lobbyCode);
        if (!lobby) {
          // Lobby doesn't exist, just clean up the tracking
          this.connectedParticipants.delete(key);
          continue;
        }

        const draftSession = await draftManager.getDraftSession(lobby.id);

        // Don't kick users from completed lobbies - they need to see the party code
        if (lobby.status === 'completed' || (draftSession && draftSession.status === 'completed')) {
          // Just update last seen to prevent repeated checks, but don't remove them
          connection.lastSeen = now;
          continue;
        }

        console.log(`Cleaning up stale participant: ${key} from lobby ${connection.lobbyCode}`);

        this.connectedParticipants.delete(key);

        if (draftSession && draftSession.status === 'active') {
          // Find the stale participant
          const participant = lobby.participants.find(p =>
            (connection.visitorUserId && p.userId === connection.visitorUserId) ||
            (connection.sessionToken && p.sessionToken === connection.sessionToken)
          );

          // Check if they're a captain on an actual team
          if (participant && participant.isCaptain && (participant.team === 'amber' || participant.team === 'sapphire')) {
            const teamName = participant.team === 'amber' ? 'Amber' : 'Sapphire';
            const playerName = participant.user?.displayName || participant.anonymousName || 'A captain';

            // Cancel the draft due to captain disconnect
            await draftManager.cancelDraftForDisconnect(
              connection.lobbyCode,
              lobby.id,
              `Draft cancelled: ${playerName} (${teamName} captain) disconnected`
            );
          }
        }

        const updatedLobby = await lobbyManager.leaveLobby(
          connection.lobbyCode,
          connection.visitorUserId || undefined,
          connection.sessionToken || undefined
        );
        if (updatedLobby) {
          this.broadcastToLobby(connection.lobbyCode, { type: 'lobby:update', lobby: updatedLobby });
        }
      } catch (error) {
        // Host can't leave - that's expected
        console.log('Stale participant not removed (may be host):', error);
      }
    }
  }

  private send(ws: WSClient, message: WSServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('WebSocket send error:', error);
    }
  }

  // Public method to broadcast lobby updates
  broadcastToLobby(lobbyCode: string, message: WSServerMessage) {
    const sockets = this.lobbySockets.get(lobbyCode.toUpperCase());
    if (sockets) {
      const messageStr = JSON.stringify(message);
      for (const ws of sockets) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('WebSocket broadcast error:', error);
        }
      }
    }
  }

  // Broadcast lobby update after API changes
  async broadcastLobbyUpdate(lobbyCode: string) {
    const lobby = await lobbyManager.getLobbyByCode(lobbyCode);
    if (lobby) {
      this.broadcastToLobby(lobbyCode, { type: 'lobby:update', lobby });
    }
  }

  // Check if a participant is currently connected
  isParticipantConnected(userId?: string, sessionToken?: string): boolean {
    if (userId && this.connectedParticipants.has(`user:${userId}`)) return true;
    if (sessionToken && this.connectedParticipants.has(`session:${sessionToken}`)) return true;
    return false;
  }

  // Broadcast a system chat message (for picks/bans)
  broadcastSystemMessage(lobbyCode: string, message: string) {
    this.broadcastToLobby(lobbyCode, {
      type: 'lobby:chat',
      senderId: 'system',
      senderName: 'System',
      message,
      timestamp: new Date().toISOString(),
    });
  }

  // Waitlist broadcast methods
  broadcastWaitlistUpdated(lobbyCode: string, waitlist: WaitlistEntry[]) {
    this.broadcastToLobby(lobbyCode, { type: 'waitlist:updated', waitlist });
  }

  broadcastWaitlistJoined(lobbyCode: string, entry: WaitlistEntry) {
    this.broadcastToLobby(lobbyCode, { type: 'waitlist:joined', entry });
  }

  broadcastWaitlistLeft(lobbyCode: string, userId: string) {
    this.broadcastToLobby(lobbyCode, { type: 'waitlist:left', userId });
  }

  broadcastWaitlistPromoted(lobbyCode: string, userId: string, participant: typeof lobbyParticipants.$inferSelect) {
    const lobbyParticipant: LobbyParticipant = {
      id: participant.id,
      lobbyId: participant.lobbyId,
      userId: participant.userId,
      anonymousName: participant.anonymousName,
      sessionToken: null,
      team: participant.team as 'amber' | 'sapphire' | 'spectator' | 'unassigned',
      isReady: participant.isReady,
      isCaptain: participant.isCaptain,
      joinedAt: participant.joinedAt,
    };
    this.broadcastToLobby(lobbyCode, { type: 'waitlist:promoted', userId, participant: lobbyParticipant });
  }
}

export const wsManager = new WebSocketManager();

// WebSocket handlers for Bun
export const websocketHandlers = {
  open(ws: WSClient) {
    wsManager.handleOpen(ws);
  },
  message(ws: WSClient, message: string | Buffer) {
    const messageStr = typeof message === 'string' ? message : message.toString();
    wsManager.handleMessage(ws, messageStr);
  },
  async close(ws: WSClient) {
    await wsManager.handleClose(ws);
  },
};
