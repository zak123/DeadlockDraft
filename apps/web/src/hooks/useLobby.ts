import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useWebSocket } from './useWebSocket';
import type { LobbyWithParticipants, Team, WSServerMessage } from '@deadlock-draft/shared';

interface ChatMessage {
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}

export function useLobby(code: string | null) {
  const [lobby, setLobby] = useState<LobbyWithParticipants | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const handleMessage = useCallback((message: WSServerMessage) => {
    switch (message.type) {
      case 'lobby:update':
        setLobby(message.lobby);
        break;
      case 'lobby:participant-joined':
        setLobby((prev) =>
          prev
            ? { ...prev, participants: [...prev.participants, message.participant] }
            : null
        );
        break;
      case 'lobby:participant-left':
        setLobby((prev) =>
          prev
            ? {
                ...prev,
                participants: prev.participants.filter(
                  (p) => p.id !== message.participantId
                ),
              }
            : null
        );
        break;
      case 'lobby:participant-updated':
        setLobby((prev) =>
          prev
            ? {
                ...prev,
                participants: prev.participants.map((p) =>
                  p.id === message.participant.id ? message.participant : p
                ),
              }
            : null
        );
        break;
      case 'lobby:match-created':
        setLobby((prev) =>
          prev
            ? { ...prev, deadlockPartyCode: message.partyCode, status: 'starting' }
            : null
        );
        break;
      case 'lobby:match-starting':
        setLobby((prev) =>
          prev
            ? { ...prev, deadlockMatchId: message.matchId, status: 'in_progress' }
            : null
        );
        break;
      case 'lobby:chat':
        setChatMessages((prev) => [
          ...prev,
          {
            senderId: message.senderId,
            senderName: message.senderName,
            message: message.message,
            timestamp: message.timestamp,
          },
        ]);
        break;
      case 'error':
        setError(message.message);
        break;
    }
  }, []);

  const { joinLobby, leaveLobby, setReady, sendChat } = useWebSocket(handleMessage);

  // Load lobby data and join WebSocket room
  useEffect(() => {
    if (!code) {
      setLobby(null);
      return;
    }

    setLoading(true);
    setError(null);

    api
      .getLobby(code)
      .then((lobbyData) => {
        setLobby(lobbyData);
        joinLobby(code);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      leaveLobby();
    };
  }, [code, joinLobby, leaveLobby]);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const lobbyData = await api.getLobby(code);
      setLobby(lobbyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, [code]);

  const moveToTeam = useCallback(
    async (participantId: string, team: Team) => {
      if (!code) return;
      try {
        const updatedLobby = await api.moveToTeam(code, participantId, team);
        setLobby(updatedLobby);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to move participant');
      }
    },
    [code]
  );

  const setCaptain = useCallback(
    async (participantId: string, isCaptain: boolean) => {
      if (!code) return;
      try {
        const updatedLobby = await api.setCaptain(code, participantId, isCaptain);
        setLobby(updatedLobby);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set captain');
      }
    },
    [code]
  );

  const kickParticipant = useCallback(
    async (participantId: string) => {
      if (!code) return;
      try {
        const updatedLobby = await api.kickParticipant(code, participantId);
        setLobby(updatedLobby);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to kick participant');
      }
    },
    [code]
  );

  const changeSelfTeam = useCallback(
    async (team: Team) => {
      if (!code) return;
      try {
        const updatedLobby = await api.changeSelfTeam(code, team);
        setLobby(updatedLobby);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to change team');
        throw err;
      }
    },
    [code]
  );

  const updateLobbySettings = useCallback(
    async (settings: { allowTeamChange?: boolean }) => {
      if (!code) return;
      try {
        const updatedLobby = await api.updateLobby(code, settings);
        setLobby(updatedLobby);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update lobby');
        throw err;
      }
    },
    [code]
  );

  const createMatch = useCallback(async () => {
    if (!code) return;
    try {
      const result = await api.createMatch(code);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create match');
      throw err;
    }
  }, [code]);

  const readyMatch = useCallback(async () => {
    if (!code) return;
    try {
      await api.readyMatch(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ready match');
      throw err;
    }
  }, [code]);

  return {
    lobby,
    loading,
    error,
    chatMessages,
    refresh,
    setReady,
    sendChat,
    moveToTeam,
    setCaptain,
    kickParticipant,
    changeSelfTeam,
    updateLobbySettings,
    createMatch,
    readyMatch,
  };
}
