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
import type { LobbyWithParticipants } from '@deadlock-draft/shared';

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
  const [subscribersOnly, setSubscribersOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<LobbyWithParticipants[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingLobbies, setLoadingLobbies] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

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

  useEffect(() => {
    const fetchPublicLobbies = async () => {
      try {
        setLoadingLobbies(true);
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

    fetchPublicLobbies();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPublicLobbies, 30000);
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
      const lobby = await api.createTwitchLobby({ subscribersOnly });
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
            <h3 className="text-lg font-semibold mb-4">Create a Lobby</h3>
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
          setSubscribersOnly(false);
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
          <div className="flex items-center justify-between p-3 bg-deadlock-bg rounded-lg">
            <div>
              <div className="font-medium flex items-center gap-2">
                Subscribers Only
                <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div className="text-sm text-deadlock-muted">
                Only your Twitch subscribers can join the queue
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSubscribersOnly(!subscribersOnly)}
              className={`w-14 h-8 rounded-full transition-colors ${
                subscribersOnly ? 'bg-purple-600' : 'bg-deadlock-border'
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  subscribersOnly ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowTwitchCreateModal(false);
                setSubscribersOnly(false);
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
