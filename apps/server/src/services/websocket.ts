import type { ServerWebSocket } from 'bun';
import type { WSClientMessage, WSServerMessage, LobbyWithParticipants } from '@deadlock-draft/shared';
import { lobbyManager } from './lobby-manager';
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

class WebSocketManager {
  private lobbySockets: Map<string, Set<WSClient>> = new Map();

  async handleOpen(ws: WSClient) {
    const connectionId = nanoid();
    ws.data.connectionId = connectionId;
    ws.data.lobbyCode = null;
    ws.data.userId = null;
    ws.data.sessionToken = null;

    this.send(ws, { type: 'connected', connectionId });
  }

  async handleMessage(ws: WSClient, message: string) {
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
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      this.send(ws, { type: 'error', message: 'Invalid message format' });
    }
  }

  handleClose(ws: WSClient) {
    this.removeFromLobby(ws);
  }

  private async handleLobbyJoin(ws: WSClient, lobbyCode: string, sessionToken?: string) {
    // Try to authenticate via cookie or session token
    let userId: string | null = null;

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

    // Send current lobby state
    this.send(ws, { type: 'lobby:update', lobby });
  }

  private async handleLobbyLeave(ws: WSClient) {
    this.removeFromLobby(ws);
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

    // Get sender info
    let senderId = 'unknown';
    let senderName = 'Anonymous';

    if (ws.data.userId) {
      senderId = ws.data.userId;
      // Would need to lookup user name here
    } else if (ws.data.sessionToken) {
      const participant = await lobbyManager.getParticipantByToken(ws.data.sessionToken);
      if (participant) {
        senderId = participant.id;
        senderName = participant.anonymousName || 'Anonymous';
      }
    }

    this.broadcastToLobby(ws.data.lobbyCode, {
      type: 'lobby:chat',
      senderId,
      senderName,
      message: message.slice(0, 500), // Limit message length
      timestamp: new Date().toISOString(),
    });
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
      ws.data.lobbyCode = null;
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
  close(ws: WSClient) {
    wsManager.handleClose(ws);
  },
};
