import type { WSClientMessage, WSServerMessage, ChatChannel } from '@deadlock-draft/shared';

type MessageHandler = (message: WSServerMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private currentLobbyCode: string | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;

        // Rejoin lobby if we were in one
        if (this.currentLobbyCode) {
          this.joinLobby(this.currentLobbyCode);
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSServerMessage;
          this.handlers.forEach((handler) => handler(message));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentLobbyCode = null;
  }

  send(message: WSClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent');
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  joinLobby(lobbyCode: string) {
    this.currentLobbyCode = lobbyCode;
    const sessionToken = localStorage.getItem('anonymousSessionToken') || undefined;
    this.send({ type: 'lobby:join', lobbyCode, sessionToken });
  }

  leaveLobby() {
    this.currentLobbyCode = null;
    this.send({ type: 'lobby:leave' });
  }

  setReady(isReady: boolean) {
    this.send({ type: 'lobby:ready', isReady });
  }

  sendChat(message: string, channel: ChatChannel = 'all') {
    this.send({ type: 'lobby:chat', message, channel });
  }

  makeDraftPick(heroId: string) {
    this.send({ type: 'draft:pick', heroId });
  }
}

export const wsClient = new WebSocketClient();
