import { useState, useMemo } from 'react';
import { TeamPanel } from './TeamPanel';
import { Button } from '../common/Button';
import { DraftConfigModal } from '../draft';
import { useAuth } from '../../hooks/useAuth';
import type { LobbyWithParticipants, Team, DraftConfig, UpdateDraftConfigRequest, DraftState } from '@deadlock-draft/shared';

interface LobbyViewProps {
  lobby: LobbyWithParticipants;
  draftConfig: DraftConfig | null;
  onMoveToTeam: (participantId: string, team: Team) => void;
  onSetReady: (isReady: boolean) => void;
  onCreateMatch: () => Promise<unknown>;
  onReadyMatch: () => Promise<void>;
  onLeaveLobby: () => void;
  onCancelLobby: () => void;
  onUpdateDraftConfig: (updates: UpdateDraftConfigRequest) => Promise<DraftConfig | undefined>;
  onStartDraft: () => Promise<DraftState | undefined>;
}

export function LobbyView({
  lobby,
  draftConfig,
  onMoveToTeam,
  onSetReady,
  onCreateMatch,
  onReadyMatch,
  onLeaveLobby,
  onCancelLobby,
  onUpdateDraftConfig,
  onStartDraft,
}: LobbyViewProps) {
  const { user } = useAuth();
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [showDraftConfig, setShowDraftConfig] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const isHost = user?.id === lobby.hostUserId;
  const currentSessionToken = localStorage.getItem('anonymousSessionToken');

  const currentParticipant = useMemo(() => {
    return lobby.participants.find(
      (p) =>
        (user && p.userId === user.id) ||
        (currentSessionToken && p.sessionToken === currentSessionToken)
    );
  }, [lobby.participants, user, currentSessionToken]);

  const teamGroups = useMemo(() => {
    return {
      amber: lobby.participants.filter((p) => p.team === 'amber'),
      sapphire: lobby.participants.filter((p) => p.team === 'sapphire'),
      spectator: lobby.participants.filter((p) => p.team === 'spectator'),
      unassigned: lobby.participants.filter((p) => p.team === 'unassigned'),
    };
  }, [lobby.participants]);

  const handleCreateMatch = async () => {
    setCreatingMatch(true);
    try {
      await onCreateMatch();
    } finally {
      setCreatingMatch(false);
    }
  };

  const handleStartDraft = async () => {
    setStartingDraft(true);
    setDraftError(null);
    try {
      await onStartDraft();
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setStartingDraft(false);
    }
  };

  const copyLobbyCode = () => {
    navigator.clipboard.writeText(lobby.code);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{lobby.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-deadlock-muted">
              <button
                onClick={copyLobbyCode}
                className="flex items-center gap-2 px-3 py-1 bg-deadlock-bg rounded-lg hover:bg-deadlock-border transition-colors"
              >
                <span className="font-mono font-semibold text-amber">{lobby.code}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <span className="text-sm">
                {lobby.participants.length}/{lobby.maxPlayers} players
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isHost ? (
              <Button variant="danger" onClick={onCancelLobby}>
                Cancel Lobby
              </Button>
            ) : (
              <Button variant="secondary" onClick={onLeaveLobby}>
                Leave Lobby
              </Button>
            )}
          </div>
        </div>

        {/* Match Status */}
        {lobby.deadlockPartyCode && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-semibold">Match Created!</span>
            </div>
            <p className="mt-2 text-sm">
              Party Code: <span className="font-mono font-bold text-lg text-green-400">{lobby.deadlockPartyCode}</span>
            </p>
            <p className="text-sm text-deadlock-muted mt-1">
              Enter this code in Deadlock to join the custom match.
            </p>
          </div>
        )}
      </div>

      {/* Teams */}
      <div className="grid md:grid-cols-2 gap-6">
        <TeamPanel
          title="Team Amber"
          team="amber"
          participants={teamGroups.amber}
          maxSize={lobby.matchConfig.teamSize}
          hostUserId={lobby.hostUserId}
          currentUserId={user?.id}
          currentSessionToken={currentSessionToken || undefined}
          onMoveToTeam={onMoveToTeam}
          canManage={isHost}
        />
        <TeamPanel
          title="Team Sapphire"
          team="sapphire"
          participants={teamGroups.sapphire}
          maxSize={lobby.matchConfig.teamSize}
          hostUserId={lobby.hostUserId}
          currentUserId={user?.id}
          currentSessionToken={currentSessionToken || undefined}
          onMoveToTeam={onMoveToTeam}
          canManage={isHost}
        />
      </div>

      {/* Unassigned & Spectators */}
      <div className="grid md:grid-cols-2 gap-6">
        <TeamPanel
          title="Unassigned"
          team="unassigned"
          participants={teamGroups.unassigned}
          hostUserId={lobby.hostUserId}
          currentUserId={user?.id}
          currentSessionToken={currentSessionToken || undefined}
          onMoveToTeam={onMoveToTeam}
          canManage={isHost}
        />
        <TeamPanel
          title="Spectators"
          team="spectator"
          participants={teamGroups.spectator}
          hostUserId={lobby.hostUserId}
          currentUserId={user?.id}
          currentSessionToken={currentSessionToken || undefined}
          onMoveToTeam={onMoveToTeam}
          canManage={isHost}
        />
      </div>

      {/* Actions */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {currentParticipant && (
              <Button
                variant={currentParticipant.isReady ? 'secondary' : 'primary'}
                onClick={() => onSetReady(!currentParticipant.isReady)}
              >
                {currentParticipant.isReady ? 'Unready' : 'Ready Up'}
              </Button>
            )}
          </div>

          {isHost && !lobby.deadlockPartyCode && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowDraftConfig(true)}
                >
                  Configure Draft
                </Button>
                <button
                  onClick={handleStartDraft}
                  disabled={startingDraft}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {startingDraft ? 'Starting...' : 'Start Draft'}
                </button>
                <Button
                  onClick={handleCreateMatch}
                  disabled={creatingMatch}
                >
                  {creatingMatch ? 'Creating Match...' : 'Create Deadlock Match'}
                </Button>
              </div>
              {draftError && (
                <div className="text-red-400 text-sm">{draftError}</div>
              )}
            </div>
          )}

          {isHost && lobby.deadlockPartyCode && !lobby.deadlockMatchId && (
            <Button onClick={onReadyMatch} variant="sapphire">
              Ready Match
            </Button>
          )}
        </div>
      </div>

      <DraftConfigModal
        isOpen={showDraftConfig}
        onClose={() => setShowDraftConfig(false)}
        config={draftConfig}
        onSave={onUpdateDraftConfig}
        onStartDraft={onStartDraft}
      />
    </div>
  );
}
