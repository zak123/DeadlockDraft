import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { formatTimeAgo } from '../../utils/time';
import type { TwitchLobbyWithWaitlist } from '@deadlock-draft/shared';

const PAGE_SIZE = 5;

function formatViewerCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

export function TwitchLobbiesPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lobbies, setLobbies] = useState<TwitchLobbyWithWaitlist[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSteamWarning, setShowSteamWarning] = useState(false);
  const [showTwitchWarning, setShowTwitchWarning] = useState(false);
  const [pendingLobby, setPendingLobby] = useState<TwitchLobbyWithWaitlist | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchLobbies = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const result = await api.getTwitchLobbies(page, PAGE_SIZE);
      setLobbies(result.lobbies);
      setTotalCount(result.totalCount);
      setError(null);
    } catch (err) {
      setError('Failed to load Twitch lobbies');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // Show loading spinner on initial load and page changes (user-initiated actions)
    fetchLobbies(true);

    // Refresh every 30 seconds without showing spinner (background refresh)
    const interval = setInterval(() => fetchLobbies(false), 30000);
    return () => clearInterval(interval);
  }, [fetchLobbies]);

  const handleJoinQueue = async (lobby: TwitchLobbyWithWaitlist) => {
    if (!user) {
      // Show Steam login warning modal
      setPendingLobby(lobby);
      setShowSteamWarning(true);
      return;
    }

    // For restricted lobbies (followers/subscribers), user must have Twitch linked
    if (lobby.twitchRestriction !== 'none' && !user.twitchId) {
      // Show warning modal instead of immediately redirecting
      setPendingLobby(lobby);
      setShowTwitchWarning(true);
      return;
    }

    // Navigate with waitlist param so they join waitlist, not directly
    navigate(`/lobby/${lobby.code}?waitlist=true`);
  };

  const handleSteamLogin = () => {
    if (!pendingLobby) return;
    const returnUrl = `/lobby/${pendingLobby.code}?waitlist=true`;
    window.location.href = api.getSteamLoginUrl(returnUrl);
  };

  const handleLinkTwitch = () => {
    if (!pendingLobby) return;
    const returnUrl = `/lobby/${pendingLobby.code}?waitlist=true`;
    window.location.href = api.getTwitchLoginUrl(returnUrl);
  };

  if (loading && lobbies.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TwitchIcon />
          Twitch Lobbies
        </h2>
        <div className="text-gray-400 text-center py-4">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TwitchIcon />
          Twitch Lobbies
        </h2>
        <div className="text-red-400 text-center py-4">{error}</div>
      </div>
    );
  }

  if (lobbies.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TwitchIcon />
          Twitch Lobbies
        </h2>
        <div className="text-gray-400 text-center py-4">
          No Twitch lobbies currently accepting players
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <TwitchIcon />
        Twitch Lobbies
      </h2>

      <div className="space-y-3">
        {lobbies.map((lobby) => (
          <TwitchLobbyCard
            key={lobby.id}
            lobby={lobby}
            onJoinQueue={() => handleJoinQueue(lobby)}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            &lt;
          </button>
          <span className="text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            &gt;
          </button>
        </div>
      )}

      {/* Steam Auth Warning Modal */}
      {showSteamWarning && pendingLobby && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                <SteamIcon />
              </div>
              <h3 className="text-xl font-bold text-white">Steam Login Required</h3>
            </div>
            <p className="text-gray-300 mb-4">
              You need to sign in with Steam to join{' '}
              <span className="text-white font-medium">
                {pendingLobby.host?.twitchDisplayName || pendingLobby.host?.displayName}
              </span>'s lobby queue.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowSteamWarning(false);
                  setPendingLobby(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSteamLogin}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <SteamIcon />
                Sign in with Steam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Twitch Auth Warning Modal */}
      {showTwitchWarning && pendingLobby && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
                <TwitchIcon />
              </div>
              <h3 className="text-xl font-bold text-white">Twitch Account Required</h3>
            </div>
            <p className="text-gray-300 mb-4">
              This is a{' '}
              <span className="text-purple-400 font-medium">
                {pendingLobby.twitchRestriction === 'followers' ? 'followers-only' : 'subscribers-only'}
              </span>{' '}
              lobby. You need to link your Twitch account so we can verify you{' '}
              {pendingLobby.twitchRestriction === 'followers' ? 'follow' : 'are subscribed to'}{' '}
              <span className="text-white font-medium">
                {pendingLobby.host?.twitchDisplayName || pendingLobby.host?.displayName}
              </span>.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowTwitchWarning(false);
                  setPendingLobby(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkTwitch}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <TwitchIcon small />
                Link Twitch Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TwitchLobbyCardProps {
  lobby: TwitchLobbyWithWaitlist;
  onJoinQueue: () => void;
}

function TwitchLobbyCard({ lobby, onJoinQueue }: TwitchLobbyCardProps) {
  const playerCount = lobby.participants.filter((p) => p.team !== 'spectator').length;
  const isCompleted = lobby.status === 'completed';

  return (
    <div className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {lobby.host?.twitchAvatar && (
          <img
            src={lobby.host.twitchAvatar}
            alt={lobby.host.twitchDisplayName || lobby.host.displayName}
            className="w-10 h-10 rounded-full"
          />
        )}
        <div>
          <div className="text-white font-medium flex items-center gap-2">
            {lobby.host?.twitchDisplayName || lobby.host?.displayName}'s Lobby
            {lobby.twitchRestriction === 'followers' && (
              <span className="px-1.5 py-0.5 bg-purple-600/70 text-white text-xs rounded font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Followers
              </span>
            )}
            {lobby.twitchRestriction === 'subscribers' && (
              <span className="px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded font-medium flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Subs
              </span>
            )}
            {lobby.viewerCount > 0 && (
              <span className="text-red-400 text-sm flex items-center gap-1">
                <LiveIcon />
                {formatViewerCount(lobby.viewerCount)}
              </span>
            )}
          </div>
          <div className="text-gray-400 text-sm flex items-center gap-3">
            <span>
              {playerCount}/{lobby.maxPlayers} players
            </span>
            {lobby.waitlistCount > 0 && (
              <span className="text-purple-400">
                {lobby.waitlistCount} in queue
              </span>
            )}
            {isCompleted && lobby.draftCompletedAt ? (
              <span className="text-yellow-400">Draft completed {formatTimeAgo(lobby.draftCompletedAt)}</span>
            ) : isCompleted ? (
              <span className="text-yellow-400">Draft completed</span>
            ) : (
              <span>{formatTimeAgo(lobby.createdAt)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {lobby.twitchStreamUrl && (
          <a
            href={lobby.twitchStreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Watch
          </a>
        )}
        {!isCompleted && (
          <button
            onClick={onJoinQueue}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Join
          </button>
        )}
      </div>
    </div>
  );
}

function TwitchIcon({ small }: { small?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={small ? 'w-4 h-4' : 'w-5 h-5'}
      fill="currentColor"
    >
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

function LiveIcon() {
  return (
    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
  );
}

function SteamIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z" />
    </svg>
  );
}
