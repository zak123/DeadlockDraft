import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SteamLoginButton } from '../components/auth/SteamLoginButton';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { api } from '../services/api';

export function Home() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [lobbyName, setLobbyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
      const lobby = await api.createLobby({ name: lobbyName.trim() });
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
