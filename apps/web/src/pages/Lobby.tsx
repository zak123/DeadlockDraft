import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLobby } from '../hooks/useLobby';
import { api } from '../services/api';
import { LobbyView } from '../components/lobby/LobbyView';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { SteamLoginButton } from '../components/auth/SteamLoginButton';

export function Lobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { lobby, loading, error, setReady, moveToTeam, createMatch, readyMatch, refresh } = useLobby(code || null);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [anonymousName, setAnonymousName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinedParticipantId, setJoinedParticipantId] = useState<string | null>(() => {
    // Check if we have a stored participant ID for this lobby
    const stored = localStorage.getItem(`lobby_participant_${code}`);
    return stored || null;
  });

  // Check if user is in the lobby
  const isInLobby = lobby?.participants.some(
    (p) =>
      (user && p.userId === user.id) ||
      (joinedParticipantId && p.id === joinedParticipantId)
  );

  // Auto-join for authenticated Steam users, show modal for guests
  useEffect(() => {
    if (!loading && !authLoading && lobby && !isInLobby) {
      if (user) {
        // Auto-join for authenticated users
        api.joinLobby(code!)
          .then((result) => {
            setJoinedParticipantId(result.participant.id);
            localStorage.setItem(`lobby_participant_${code}`, result.participant.id);
            return refresh();
          })
          .catch((err) => {
            console.error('Failed to auto-join:', err);
            setShowJoinModal(true);
          });
      } else {
        // Show join modal for guests
        setShowJoinModal(true);
      }
    }
  }, [loading, authLoading, lobby, isInLobby, user, code, refresh]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user && !anonymousName.trim()) {
      setJoinError('Please enter a name');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const result = await api.joinLobby(code!, user ? undefined : { anonymousName: anonymousName.trim() });
      // Store participant ID to track membership
      setJoinedParticipantId(result.participant.id);
      localStorage.setItem(`lobby_participant_${code}`, result.participant.id);
      setShowJoinModal(false);
      // Refresh lobby to show updated participants
      await refresh();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join lobby');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveLobby = async () => {
    try {
      await api.leaveLobby(code!);
      localStorage.removeItem(`lobby_participant_${code}`);
      navigate('/');
    } catch (err) {
      console.error('Failed to leave lobby:', err);
    }
  };

  const handleCancelLobby = async () => {
    if (!confirm('Are you sure you want to cancel this lobby?')) return;

    try {
      await api.cancelLobby(code!);
      navigate('/');
    } catch (err) {
      console.error('Failed to cancel lobby:', err);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber"></div>
      </div>
    );
  }

  if (error || !lobby) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Lobby Not Found</h2>
          <p className="text-deadlock-muted mb-4">
            {error || 'The lobby you are looking for does not exist or has expired.'}
          </p>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  if (lobby.status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Lobby Cancelled</h2>
          <p className="text-deadlock-muted mb-4">
            This lobby has been cancelled by the host.
          </p>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-deadlock-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-xl font-bold hover:text-amber transition-colors">
            Deadlock Draft
          </button>
          {user && (
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
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {isInLobby ? (
          <LobbyView
            lobby={lobby}
            onMoveToTeam={moveToTeam}
            onSetReady={setReady}
            onCreateMatch={createMatch}
            onReadyMatch={readyMatch}
            onLeaveLobby={handleLeaveLobby}
            onCancelLobby={handleCancelLobby}
          />
        ) : (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="card p-8 text-center max-w-md">
              <h2 className="text-xl font-semibold mb-2">Join {lobby.name}</h2>
              <p className="text-deadlock-muted mb-4">
                {lobby.participants.length}/{lobby.maxPlayers} players in lobby
              </p>
              <Button onClick={() => setShowJoinModal(true)}>Join Lobby</Button>
            </div>
          </div>
        )}
      </main>

      {/* Join Modal */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => navigate('/')}
        title={`Join ${lobby.name}`}
      >
        <div className="space-y-4">
          <p className="text-deadlock-muted">
            {lobby.participants.length}/{lobby.maxPlayers} players already in lobby
          </p>

          {user ? (
            <form onSubmit={handleJoin} className="space-y-4">
              <p className="text-sm">
                Joining as <strong>{user.displayName}</strong>
              </p>
              {joinError && <p className="text-sm text-red-500">{joinError}</p>}
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="secondary" onClick={() => navigate('/')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={joining}>
                  {joining ? 'Joining...' : 'Join Lobby'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium">Sign in with Steam</p>
                <SteamLoginButton />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-deadlock-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-deadlock-card text-deadlock-muted">or</span>
                </div>
              </div>

              <form onSubmit={handleJoin} className="space-y-4">
                <Input
                  label="Join as Guest"
                  placeholder="Enter your name"
                  value={anonymousName}
                  onChange={(e) => setAnonymousName(e.target.value)}
                  maxLength={50}
                />
                {joinError && <p className="text-sm text-red-500">{joinError}</p>}
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => navigate('/')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={joining || !anonymousName.trim()}>
                    {joining ? 'Joining...' : 'Join as Guest'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
