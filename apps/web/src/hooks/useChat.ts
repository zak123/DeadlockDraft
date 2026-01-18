import { useState, useEffect, useCallback } from 'react';
import { wsClient } from '../services/websocket';
import type { WSServerMessage, ChatChannel, Team } from '@deadlock-draft/shared';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderTeam?: Team;
  message: string;
  timestamp: string;
  isSystem: boolean;
  channel: ChatChannel;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const handleMessage = (message: WSServerMessage) => {
      if (message.type === 'lobby:chat') {
        const chatMessage: ChatMessage = {
          id: `${message.timestamp}-${message.senderId}-${Math.random()}`,
          senderId: message.senderId,
          senderName: message.senderName,
          senderTeam: message.senderTeam,
          message: message.message,
          timestamp: message.timestamp,
          isSystem: message.isSystem || message.senderId === 'system',
          channel: message.channel,
        };
        setMessages((prev) => [...prev.slice(-99), chatMessage]); // Keep last 100 messages
      }
    };

    const unsubscribe = wsClient.subscribe(handleMessage);
    return () => {
      unsubscribe();
    };
  }, []);

  const sendMessage = useCallback((message: string, channel: ChatChannel = 'all') => {
    if (message.trim()) {
      wsClient.sendChat(message.trim(), channel);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    clearMessages,
  };
}
