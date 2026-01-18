import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';
import type {
  DraftState,
  DraftConfig,
  WSServerMessage,
  UpdateDraftConfigRequest,
} from '@deadlock-draft/shared';

export function useDraft(lobbyCode: string | null) {
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [draftConfig, setDraftConfig] = useState<DraftConfig | null>(null);
  const [heroes, setHeroes] = useState<string[]>([]);
  const [partyCode, setPartyCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle WebSocket messages
  useEffect(() => {
    const handleMessage = (message: WSServerMessage) => {
      switch (message.type) {
        case 'draft:started':
          setDraftState(message.draftState);
          break;
        case 'draft:turn':
          setDraftState((prev) =>
            prev
              ? {
                  ...prev,
                  session: message.session,
                  currentTurnTimeRemaining: message.timeRemaining,
                }
              : null
          );
          break;
        case 'draft:pick':
        case 'draft:timeout':
          setDraftState(message.draftState);
          break;
        case 'draft:completed':
          setDraftState(message.draftState);
          break;
        case 'draft:cancelled':
          setDraftState(null);
          setPartyCode(null);
          break;
        case 'draft:party-created':
          setPartyCode(message.partyCode);
          break;
      }
    };

    const unsubscribe = wsClient.subscribe(handleMessage);
    return () => {
      unsubscribe();
    };
  }, []);

  // Update timer every second when draft is active
  useEffect(() => {
    if (draftState?.session.status === 'active') {
      timerRef.current = setInterval(() => {
        setDraftState((prev) => {
          if (!prev || prev.session.status !== 'active') return prev;
          const newTimeRemaining = Math.max(0, prev.currentTurnTimeRemaining - 1);
          return { ...prev, currentTurnTimeRemaining: newTimeRemaining };
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [draftState?.session.status]);

  // Load heroes list once
  useEffect(() => {
    api.getHeroes().then(setHeroes).catch(console.error);
  }, []);

  // Load draft config and state
  useEffect(() => {
    if (!lobbyCode) {
      setDraftConfig(null);
      setDraftState(null);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      api.getDraftConfig(lobbyCode),
      api.getDraftState(lobbyCode),
    ])
      .then(([config, state]) => {
        setDraftConfig(config);
        setDraftState(state);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [lobbyCode]);

  const updateConfig = useCallback(
    async (updates: UpdateDraftConfigRequest) => {
      if (!lobbyCode) return;
      try {
        const config = await api.updateDraftConfig(lobbyCode, updates);
        setDraftConfig(config);
        return config;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update config');
        throw err;
      }
    },
    [lobbyCode]
  );

  const startDraft = useCallback(async () => {
    if (!lobbyCode) return;
    try {
      setLoading(true);
      const state = await api.startDraft(lobbyCode);
      setDraftState(state);
      return state;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [lobbyCode]);

  const makePick = useCallback(
    async (heroId: string) => {
      if (!lobbyCode) return;
      try {
        // Use WebSocket for real-time responsiveness
        wsClient.makeDraftPick(heroId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to make pick');
        throw err;
      }
    },
    [lobbyCode]
  );

  const refresh = useCallback(async () => {
    if (!lobbyCode) return;
    try {
      const [config, state] = await Promise.all([
        api.getDraftConfig(lobbyCode),
        api.getDraftState(lobbyCode),
      ]);
      setDraftConfig(config);
      setDraftState(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, [lobbyCode]);

  const cancelDraft = useCallback(async () => {
    if (!lobbyCode) return;
    try {
      await api.cancelDraft(lobbyCode);
      setDraftState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel draft');
      throw err;
    }
  }, [lobbyCode]);

  return {
    draftState,
    draftConfig,
    heroes,
    partyCode,
    loading,
    error,
    updateConfig,
    startDraft,
    makePick,
    refresh,
    cancelDraft,
  };
}
