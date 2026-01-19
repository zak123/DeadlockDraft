import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SteamLoginButton } from '../components/auth/SteamLoginButton';
import { TwitchLoginButton } from '../components/auth/TwitchLoginButton';
import { TwitchLobbiesPanel } from '../components/lobby/TwitchLobbiesPanel';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { api } from '../services/api';
import { formatTimeAgo } from '../utils/time';
import type { LobbyWithParticipants, TwitchRestriction } from '@deadlock-draft/shared';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  twitch_already_linked: 'This Twitch account is already linked to another Steam account.',
  twitch_auth_denied: 'Twitch authorization was denied.',
  twitch_auth_invalid_state: 'Twitch authorization failed. Please try again.',
  twitch_token_exchange_failed: 'Failed to connect to Twitch. Please try again.',
  twitch_user_fetch_failed: 'Failed to fetch Twitch account info. Please try again.',
  twitch_link_failed: 'Failed to link Twitch account. Please try again.',
};

export function Home() {
  const { user, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [joinCode, setJoinCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTwitchCreateModal, setShowTwitchCreateModal] = useState(false);
  const [lobbyName, setLobbyName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [restriction, setRestriction] = useState<TwitchRestriction>('none');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<LobbyWithParticipants[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingLobbies, setLoadingLobbies] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [lobbyStats, setLobbyStats] = useState<{ active: number; total: number } | null>(null);

  const hasTwitchLinked = !!user?.twitchId;

  // Check for auth errors in URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const message = AUTH_ERROR_MESSAGES[errorParam] || 'An authentication error occurred.';
      setAuthError(message);
      // Clear the error from URL
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const PAGE_SIZE = 5;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch lobby stats
  useEffect(() => {
    const fetchLobbyStats = async () => {
      try {
        const stats = await api.getLobbyStats();
        setLobbyStats(stats);
      } catch (err) {
        console.error('Failed to fetch lobby stats:', err);
      }
    };

    fetchLobbyStats();
    const interval = setInterval(fetchLobbyStats, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchPublicLobbies = async (showLoading = false) => {
      try {
        if (showLoading) {
          setLoadingLobbies(true);
        }
        const result = await api.getPublicLobbies(currentPage, PAGE_SIZE);
        setPublicLobbies(result.lobbies);
        setTotalCount(result.totalCount);
        // Reset to last valid page if current page is out of bounds
        const maxPage = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
        if (currentPage > maxPage) {
          setCurrentPage(maxPage);
        }
      } catch (err) {
        console.error('Failed to fetch public lobbies:', err);
      } finally {
        setLoadingLobbies(false);
      }
    };

    // Show loading spinner on initial load and page changes (user-initiated actions)
    fetchPublicLobbies(true);

    // Refresh every 30 seconds without showing spinner (background refresh)
    const interval = setInterval(() => fetchPublicLobbies(false), 30000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const handleJoinLobby = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) {
      navigate(`/lobby/${code}`);
    }
  };

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPublic && !lobbyName.trim()) return;

    setCreating(true);
    setError('');

    try {
      const lobby = await api.createLobby({
        name: isPublic ? undefined : lobbyName.trim(),
        isPublic
      });
      navigate(`/lobby/${lobby.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lobby');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTwitchLobby = async () => {
    setCreating(true);
    setError('');

    try {
      const lobby = await api.createTwitchLobby({ restriction });
      navigate(`/lobby/${lobby.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Twitch lobby');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-deadlock-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Deadlock Draft</h1>
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user.avatarMedium && (
                  <img
                    src={user.avatarMedium}
                    alt={user.displayName}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <span className="text-sm font-medium">{user.displayName}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center">
            <h2 className="text-4xl font-bold mb-2">Custom Match Coordinator</h2>
            <p className="text-deadlock-muted">
              Create or join a lobby to organize your Deadlock custom matches.
            </p>
          </div>

          {/* Auth Error Alert */}
          {authError && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-red-200">{authError}</p>
              </div>
              <button
                onClick={() => setAuthError(null)}
                className="text-red-400 hover:text-red-300 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Join Lobby */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">Join a Lobby</h3>
            <form onSubmit={handleJoinLobby} className="flex gap-3">
              <Input
                placeholder="Enter lobby code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 font-mono text-center tracking-widest"
                maxLength={6}
              />
              <Button type="submit" disabled={!joinCode.trim()}>
                Join
              </Button>
            </form>
          </div>

          {/* Create Lobby */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create a Lobby</h3>
              {lobbyStats !== null && (
                <span className="text-sm text-deadlock-muted">
                  <span className="text-amber font-medium">{lobbyStats.active}</span> active {lobbyStats.active === 1 ? 'lobby' : 'lobbies'}
                </span>
              )}
            </div>
            {user ? (
              <div className="space-y-3">
                <Button onClick={() => setShowCreateModal(true)} className="w-full">
                  Create New Lobby
                </Button>
                {hasTwitchLinked ? (
                  <div className="space-y-2">
                    <Button
                      onClick={() => setShowTwitchCreateModal(true)}
                      className="w-full bg-[#9146FF] hover:bg-[#7B2FFF]"
                    >
                      Create Twitch Lobby
                    </Button>
                    <div className="flex items-center justify-between pt-2 border-t border-deadlock-border">
                      <span className="text-sm text-deadlock-muted flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4 text-purple-400" fill="currentColor">
                          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                        </svg>
                        {user?.twitchDisplayName || user?.twitchUsername}
                      </span>
                      <TwitchLoginButton variant="unlink" onUnlink={refresh} />
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-deadlock-border">
                    <p className="text-sm text-deadlock-muted mb-2">
                      Link your Twitch account to create Twitch lobbies
                    </p>
                    <TwitchLoginButton returnTo="/" />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-deadlock-muted">
                  Sign in with Steam to create and host lobbies.
                </p>
                <SteamLoginButton />
              </div>
            )}
          </div>

          {/* Twitch Lobbies */}
          <TwitchLobbiesPanel />

          {/* Public Lobbies */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">Public Lobbies</h3>
            {loadingLobbies ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber"></div>
              </div>
            ) : publicLobbies.length === 0 ? (
              <p className="text-sm text-deadlock-muted text-center py-4">
                No public lobbies available. Create one!
              </p>
            ) : (
              <div className="space-y-3">
                {publicLobbies.map((lobby) => (
                  <div
                    key={lobby.id}
                    className="flex items-center justify-between p-3 bg-deadlock-bg rounded-lg hover:bg-deadlock-border transition-colors"
                  >
                    <div>
                      <div className="font-medium">{lobby.name}</div>
                      <div className="text-sm text-deadlock-muted">
                        {lobby.participants.filter((p) => p.team !== 'spectator').length}/{lobby.maxPlayers} players • {formatTimeAgo(lobby.createdAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/lobby/${lobby.code}`)}
                    >
                      Join
                    </Button>
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded hover:bg-deadlock-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm text-deadlock-muted">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded hover:bg-deadlock-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-deadlock-border py-6">
        <div className="container mx-auto px-4 text-center text-sm text-deadlock-muted">
          <p className="mb-2">
            Open source software built by{' '}
            <a
              href="https://zak123.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber hover:underline"
            >
              zak123
            </a>
            {' & '}
            <a
              href="https://github.com/lukeisun"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber hover:underline"
            >
              lukeisun
            </a>
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://github.com/zak123/DeadlockDraft"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-deadlock-muted hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              GitHub
            </a>
            <a
              href="https://discord.gg/pUeVxvPxRp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-deadlock-muted hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Discord
            </a>
          </div>
          {lobbyStats !== null && (
            <p className="mt-3 text-deadlock-muted">
              <span className="text-amber font-medium">{lobbyStats.total.toLocaleString()}</span> games played
            </p>
          )}
        </div>
      </footer>

      {/* Create Lobby Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Lobby"
      >
        <form onSubmit={handleCreateLobby} className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Public Lobby</div>
              <div className="text-sm text-deadlock-muted">
                Allow anyone to find and join your lobby
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className={`w-14 h-8 rounded-full transition-colors ${
                isPublic ? 'bg-amber' : 'bg-deadlock-border'
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  isPublic ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {isPublic ? (
            <div className="p-3 bg-deadlock-bg rounded-lg">
              <div className="text-sm text-deadlock-muted">Lobby name will be:</div>
              <div className="font-medium">{user?.displayName}'s Lobby [CODE]</div>
            </div>
          ) : (
            <Input
              label="Lobby Name"
              placeholder="My Custom Match"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              maxLength={100}
            />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={(!isPublic && !lobbyName.trim()) || creating}>
              {creating ? 'Creating...' : 'Create Lobby'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Twitch Lobby Modal */}
      <Modal
        isOpen={showTwitchCreateModal}
        onClose={() => {
          setShowTwitchCreateModal(false);
          setRestriction('none');
        }}
        title="Create Twitch Lobby"
      >
        <div className="space-y-4">
          <div className="p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
            <p className="text-sm text-purple-200">
              Twitch lobbies let your viewers join a waitlist. You control when to open the queue and who gets promoted to play.
            </p>
          </div>
          <div className="p-3 bg-deadlock-bg rounded-lg">
            <div className="text-sm text-deadlock-muted">Lobby name will be:</div>
            <div className="font-medium">{user?.twitchDisplayName || user?.displayName}'s Lobby [CODE]</div>
          </div>
          <div className="p-3 bg-deadlock-bg rounded-lg">
            <div className="text-sm text-deadlock-muted">Your Twitch stream will be linked:</div>
            <div className="font-medium text-purple-400">
              twitch.tv/{user?.twitchUsername}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-deadlock-muted">Who can join the queue?</div>
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                restriction === 'none' ? 'bg-purple-900/30 border border-purple-500/50' : 'bg-deadlock-bg hover:bg-deadlock-border'
              }`}
            >
              <input
                type="radio"
                name="restriction"
                value="none"
                checked={restriction === 'none'}
                onChange={() => setRestriction('none')}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                restriction === 'none' ? 'border-purple-500' : 'border-deadlock-muted'
              }`}>
                {restriction === 'none' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
              </div>
              <div>
                <div className="font-medium">Anyone</div>
                <div className="text-sm text-deadlock-muted">All viewers can join the queue</div>
              </div>
            </label>
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                restriction === 'followers' ? 'bg-purple-900/30 border border-purple-500/50' : 'bg-deadlock-bg hover:bg-deadlock-border'
              }`}
            >
              <input
                type="radio"
                name="restriction"
                value="followers"
                checked={restriction === 'followers'}
                onChange={() => setRestriction('followers')}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                restriction === 'followers' ? 'border-purple-500' : 'border-deadlock-muted'
              }`}>
                {restriction === 'followers' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  Followers Only
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div className="text-sm text-deadlock-muted">Only followers can join the queue</div>
              </div>
            </label>
            <label
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                restriction === 'subscribers' ? 'bg-purple-900/30 border border-purple-500/50' : 'bg-deadlock-bg hover:bg-deadlock-border'
              }`}
            >
              <input
                type="radio"
                name="restriction"
                value="subscribers"
                checked={restriction === 'subscribers'}
                onChange={() => setRestriction('subscribers')}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                restriction === 'subscribers' ? 'border-purple-500' : 'border-deadlock-muted'
              }`}>
                {restriction === 'subscribers' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  Subscribers Only
                  <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div className="text-sm text-deadlock-muted">Only subscribers can join the queue</div>
              </div>
            </label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowTwitchCreateModal(false);
                setRestriction('none');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTwitchLobby}
              disabled={creating}
              className="bg-[#9146FF] hover:bg-[#7B2FFF]"
            >
              {creating ? 'Creating...' : 'Create Twitch Lobby'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
