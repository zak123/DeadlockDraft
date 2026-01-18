import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { TwitchLobbyWithWaitlist } from '@deadlock-draft/shared';

const PAGE_SIZE = 5;

export function TwitchLobbiesPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lobbies, setLobbies] = useState<TwitchLobbyWithWaitlist[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchLobbies = useCallback(async () => {
    try {
      setLoading(true);
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
    fetchLobbies();
    const interval = setInterval(fetchLobbies, 30000);
    return () => clearInterval(interval);
  }, [fetchLobbies]);

  const handleJoinQueue = async (code: string) => {
    if (!user) {
      // Redirect to Steam login first
      window.location.href = api.getSteamLoginUrl(`/lobby/${code}`);
      return;
    }
    navigate(`/lobby/${code}`);
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
            onJoinQueue={() => handleJoinQueue(lobby.code)}
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
        {lobby.host.twitchAvatar && (
          <img
            src={lobby.host.twitchAvatar}
            alt={lobby.host.twitchDisplayName || lobby.host.displayName}
            className="w-10 h-10 rounded-full"
          />
        )}
        <div>
          <div className="text-white font-medium">
            {lobby.host.twitchDisplayName || lobby.host.displayName}'s Lobby
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
            {isCompleted && (
              <span className="text-yellow-400">Draft Completed</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {lobby.twitchStreamUrl && (
          <a
            href={lobby.twitchStreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors text-sm"
          >
            <TwitchIcon small />
            Watch Stream
          </a>
        )}
        {!isCompleted && (
          <button
            onClick={onJoinQueue}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Join Queue
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
