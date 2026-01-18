import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';
import type { WaitlistEntry, WSServerMessage } from '@deadlock-draft/shared';

export function useWaitlist(code: string | null, lobbyId: string | null, isTwitchLobby: boolean) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch waitlist
  const fetchWaitlist = useCallback(async () => {
    if (!code || !isTwitchLobby) {
      setWaitlist([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    try {
      const result = await api.getWaitlist(code);
      setWaitlist(result.waitlist);
      setTotalCount(result.totalCount);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch waitlist');
    } finally {
      setLoading(false);
    }
  }, [code, isTwitchLobby]);

  // Initial fetch
  useEffect(() => {
    fetchWaitlist();
  }, [fetchWaitlist]);

  // Handle WebSocket events
  useEffect(() => {
    if (!isTwitchLobby) return;

    const unsubscribe = wsClient.subscribe((message: WSServerMessage) => {
      switch (message.type) {
        case 'waitlist:updated':
          setWaitlist(message.waitlist);
          setTotalCount(message.waitlist.length);
          break;
        case 'waitlist:joined':
          setWaitlist((prev) => {
            // Check if entry already exists
            if (prev.some((e) => e.id === message.entry.id)) {
              return prev;
            }
            return [...prev, message.entry];
          });
          setTotalCount((prev) => prev + 1);
          break;
        case 'waitlist:left':
          setWaitlist((prev) => prev.filter((e) => e.userId !== message.userId));
          setTotalCount((prev) => Math.max(0, prev - 1));
          break;
        case 'waitlist:promoted':
          setWaitlist((prev) => prev.filter((e) => e.userId !== message.userId));
          setTotalCount((prev) => Math.max(0, prev - 1));
          break;
      }
    });

    return unsubscribe;
  }, [isTwitchLobby]);

  // Join waitlist
  const joinWaitlist = useCallback(async () => {
    if (!code) throw new Error('No lobby code');
    setError(null);
    try {
      const entry = await api.joinWaitlist(code);
      return entry;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join waitlist';
      setError(message);
      throw err;
    }
  }, [code]);

  // Leave waitlist
  const leaveWaitlist = useCallback(async () => {
    if (!code) throw new Error('No lobby code');
    setError(null);
    try {
      await api.leaveWaitlist(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave waitlist';
      setError(message);
      throw err;
    }
  }, [code]);

  // Promote user from waitlist (host only)
  const promoteUser = useCallback(
    async (userId: string) => {
      if (!code) throw new Error('No lobby code');
      setError(null);
      try {
        const participant = await api.promoteFromWaitlist(code, userId);
        return participant;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to promote user';
        setError(message);
        throw err;
      }
    },
    [code]
  );

  // Fill from waitlist randomly (host only)
  const fillFromWaitlist = useCallback(
    async (count: number) => {
      if (!code) throw new Error('No lobby code');
      setError(null);
      try {
        const promoted = await api.fillFromWaitlist(code, count);
        return promoted;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fill from waitlist';
        setError(message);
        throw err;
      }
    },
    [code]
  );

  // Check if a user is in the waitlist
  const isInWaitlist = useCallback(
    (userId: string) => {
      return waitlist.some((entry) => entry.userId === userId);
    },
    [waitlist]
  );

  return {
    waitlist,
    totalCount,
    loading,
    error,
    refresh: fetchWaitlist,
    joinWaitlist,
    leaveWaitlist,
    promoteUser,
    fillFromWaitlist,
    isInWaitlist,
  };
}
