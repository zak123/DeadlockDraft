import { useEffect, useCallback, useRef } from 'react';
import { wsClient } from '../services/websocket';
import type { WSServerMessage } from '@deadlock-draft/shared';

export function useWebSocket(onMessage?: (message: WSServerMessage) => void) {
  const messageHandlerRef = useRef(onMessage);
  messageHandlerRef.current = onMessage;

  useEffect(() => {
    wsClient.connect().catch(console.error);

    const unsubscribe = wsClient.subscribe((message) => {
      messageHandlerRef.current?.(message);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const joinLobby = useCallback((lobbyCode: string) => {
    wsClient.joinLobby(lobbyCode);
  }, []);

  const leaveLobby = useCallback(() => {
    wsClient.leaveLobby();
  }, []);

  const setReady = useCallback((isReady: boolean) => {
    wsClient.setReady(isReady);
  }, []);

  const sendChat = useCallback((message: string) => {
    wsClient.sendChat(message);
  }, []);

  return {
    joinLobby,
    leaveLobby,
    setReady,
    sendChat,
  };
}
