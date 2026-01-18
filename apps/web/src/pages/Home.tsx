import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SteamLoginButton } from '../components/auth/SteamLoginButton';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { api } from '../services/api';
import type { LobbyWithParticipants } from '@deadlock-draft/shared';

export function Home() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [lobbyName, setLobbyName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [publicLobbies, setPublicLobbies] = useState<LobbyWithParticipants[]>([]);
  const [loadingLobbies, setLoadingLobbies] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  const LOBBIES_PER_PAGE = 5;
  const totalPages = Math.ceil(publicLobbies.length / LOBBIES_PER_PAGE);
  const paginatedLobbies = publicLobbies.slice(
    currentPage * LOBBIES_PER_PAGE,
    (currentPage + 1) * LOBBIES_PER_PAGE
  );

  useEffect(() => {
    const fetchPublicLobbies = async () => {
      try {
        const lobbies = await api.getPublicLobbies();
        setPublicLobbies(lobbies);
        // Reset to first page if current page would be out of bounds
        setCurrentPage((prev) => {
          const maxPage = Math.max(0, Math.ceil(lobbies.length / LOBBIES_PER_PAGE) - 1);
          return prev > maxPage ? maxPage : prev;
        });
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
  }, []);

  const handleJoinLobby = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      navigate(`/lobby/${joinCode.trim().toUpperCase()}`);
    }
  };

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lobbyName.trim()) return;

    setCreating(true);
    setError('');

    try {
      const lobby = await api.createLobby({ name: lobbyName.trim(), isPublic });
      navigate(`/lobby/${lobby.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lobby');
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
              <Button onClick={() => setShowCreateModal(true)} className="w-full">
                Create New Lobby
              </Button>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-deadlock-muted">
                  Sign in with Steam to create and host lobbies.
                </p>
                <SteamLoginButton />
              </div>
            )}
          </div>

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
                {paginatedLobbies.map((lobby) => (
                  <div
                    key={lobby.id}
                    className="flex items-center justify-between p-3 bg-deadlock-bg rounded-lg hover:bg-deadlock-border transition-colors"
                  >
                    <div>
                      <div className="font-medium">{lobby.name}</div>
                      <div className="text-sm text-deadlock-muted">
                        {lobby.participants.length}/{lobby.maxPlayers} players • Hosted by {lobby.host.displayName}
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
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="p-1 rounded hover:bg-deadlock-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm text-deadlock-muted">
                      {currentPage + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage === totalPages - 1}
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
          <Input
            label="Lobby Name"
            placeholder="My Custom Match"
            value={lobbyName}
            onChange={(e) => setLobbyName(e.target.value)}
            maxLength={100}
          />
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
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!lobbyName.trim() || creating}>
              {creating ? 'Creating...' : 'Create Lobby'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
