import { useState, useMemo } from 'react';
import { TeamPanel } from './TeamPanel';
import { Button } from '../common/Button';
import { DraftConfigModal } from '../draft';
import { useAuth } from '../../hooks/useAuth';
import type { LobbyWithParticipants, Team, DraftConfig, UpdateDraftConfigRequest, DraftState, GameMode } from '@deadlock-draft/shared';
import { GAME_MODE_CONFIG } from '@deadlock-draft/shared';

interface LobbyViewProps {
  lobby: LobbyWithParticipants;
  draftConfig: DraftConfig | null;
  onMoveToTeam: (participantId: string, team: Team) => void;
  onSetCaptain: (participantId: string, isCaptain: boolean) => void;
  onKickParticipant: (participantId: string) => void;
  onChangeSelfTeam: (team: Team) => Promise<void>;
  onSetReady: (isReady: boolean) => void;
  onReadyMatch: () => Promise<void>;
  onLeaveLobby: () => void;
  onCancelLobby: () => void;
  onUpdateLobbySettings: (settings: { allowTeamChange?: boolean }) => Promise<void>;
  onSetGameMode: (gameMode: GameMode) => Promise<void>;
  onSetTeamSize: (teamSize: number) => Promise<void>;
  onUpdateDraftConfig: (updates: UpdateDraftConfigRequest) => Promise<DraftConfig | undefined>;
  onStartDraft: () => Promise<DraftState | undefined>;
}

export function LobbyView({
  lobby,
  draftConfig,
  onMoveToTeam,
  onSetCaptain,
  onKickParticipant,
  onChangeSelfTeam,
  onSetReady,
  onReadyMatch,
  onLeaveLobby,
  onCancelLobby,
  onUpdateLobbySettings,
  onSetGameMode,
  onSetTeamSize,
  onUpdateDraftConfig,
  onStartDraft,
}: LobbyViewProps) {
  const { user } = useAuth();
  const [showDraftConfig, setShowDraftConfig] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showLobbyCode, setShowLobbyCode] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  const isHost = user?.id === lobby.hostUserId;
  const isApiLobby = !lobby.hostUserId;
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

  const readyStatus = useMemo(() => {
    // Only count players on teams (amber/sapphire), not spectators or unassigned
    const teamPlayers = lobby.participants.filter(
      (p) => p.team === 'amber' || p.team === 'sapphire'
    );
    const readyCount = teamPlayers.filter((p) => p.isReady).length;
    const totalCount = teamPlayers.length;
    const allReady = totalCount > 0 && readyCount === totalCount;
    return { readyCount, totalCount, allReady };
  }, [lobby.participants]);

  const playerCount = useMemo(() => {
    return lobby.participants.filter((p) => p.team !== 'spectator').length;
  }, [lobby.participants]);

  const handleStartDraft = async () => {
    setDraftError(null);

    // Check if all players are ready
    if (!readyStatus.allReady) {
      setDraftError(`Not all players are ready (${readyStatus.readyCount}/${readyStatus.totalCount} ready)`);
      return;
    }

    setStartingDraft(true);
    try {
      await onStartDraft();
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setStartingDraft(false);
    }
  };

  const copyLobbyCode = () => {
    // For Twitch lobbies, copy the full invite link (allows skipping waitlist)
    // For regular lobbies, copy just the lobby code
    const textToCopy = lobby.isTwitchLobby && lobby.inviteCode
      ? `${window.location.origin}/lobby/${lobby.code}?invite=${lobby.inviteCode}`
      : lobby.code;
    navigator.clipboard.writeText(textToCopy);
    setShowCopiedToast(true);
    setTimeout(() => setShowCopiedToast(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{lobby.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-deadlock-muted">
              {lobby.isTwitchLobby ? (
                // Twitch lobbies: only host can see/copy secret invite link
                isHost ? (
                  <div className="relative">
                    <button
                      onClick={copyLobbyCode}
                      className="flex items-center gap-2 px-4 py-2 bg-amber/20 hover:bg-amber/30 text-amber border border-amber/50 rounded-lg transition-colors text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Copy Secret Invite Link
                    </button>
                    {showCopiedToast && (
                      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-green-600 text-white text-xs rounded whitespace-nowrap">
                        Link copied to clipboard
                      </div>
                    )}
                  </div>
                ) : null
              ) : (
                // Regular lobbies: show/hide toggle with copy button
                <div className="relative flex items-center gap-1 bg-deadlock-bg rounded-lg">
                  <button
                    onClick={() => setShowLobbyCode(!showLobbyCode)}
                    className="flex items-center gap-2 px-3 py-1 hover:bg-deadlock-border rounded-l-lg transition-colors"
                    title={showLobbyCode ? 'Hide code' : 'Show code'}
                  >
                    <span className="font-mono font-semibold text-amber">
                      {showLobbyCode ? lobby.code : '••••••'}
                    </span>
                    {showLobbyCode ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={copyLobbyCode}
                    className="px-2 py-1 hover:bg-deadlock-border rounded-r-lg transition-colors border-l border-deadlock-border"
                    title="Copy code"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {showCopiedToast && (
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-green-600 text-white text-xs rounded whitespace-nowrap">
                      Code copied to clipboard
                    </div>
                  )}
                </div>
              )}
              <span className="text-sm">
                {playerCount}/{lobby.maxPlayers} players
                {teamGroups.spectator.length > 0 && (
                  <span className="text-deadlock-muted"> + {teamGroups.spectator.length} spectator{teamGroups.spectator.length !== 1 ? 's' : ''}</span>
                )}
              </span>
              {isHost && (
                <div className="flex items-center gap-2">
                  <select
                    value={lobby.matchConfig.gameMode}
                    onChange={(e) => onSetGameMode(e.target.value as GameMode)}
                    className="bg-deadlock-bg border border-deadlock-border rounded-lg px-3 py-1 text-sm text-deadlock-text focus:outline-none focus:border-amber cursor-pointer"
                  >
                    {(Object.keys(GAME_MODE_CONFIG) as GameMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {GAME_MODE_CONFIG[mode].label}
                      </option>
                    ))}
                  </select>
                  {lobby.matchConfig.gameMode === 'custom' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={lobby.matchConfig.teamSize}
                        onChange={(e) => {
                          const size = parseInt(e.target.value, 10);
                          if (size >= 1 && size <= 12) {
                            onSetTeamSize(size);
                          }
                        }}
                        className="w-14 bg-deadlock-bg border border-deadlock-border rounded-lg px-2 py-1 text-sm text-deadlock-text focus:outline-none focus:border-amber text-center"
                      />
                      <span className="text-sm text-deadlock-muted">v</span>
                      <span className="text-sm text-deadlock-text">{lobby.matchConfig.teamSize}</span>
                    </div>
                  )}
                </div>
              )}
              {!isHost && (
                <span className="text-sm bg-deadlock-bg border border-deadlock-border rounded-lg px-3 py-1">
                  {lobby.matchConfig.gameMode === 'custom'
                    ? `Custom (${lobby.matchConfig.teamSize}v${lobby.matchConfig.teamSize})`
                    : GAME_MODE_CONFIG[lobby.matchConfig.gameMode as GameMode]?.label || 'Standard (6v6)'}
                </span>
              )}
            </div>
            {lobby.isTwitchLobby && isHost && (
              <p className="text-xs text-deadlock-muted mt-1">
                Invite trusted friends by sharing this link, they will skip the waitlist.
              </p>
            )}
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
          onSetCaptain={onSetCaptain}
          onChangeSelfTeam={onChangeSelfTeam}
          onKickParticipant={isHost ? onKickParticipant : undefined}
          allowTeamChange={lobby.allowTeamChange}
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
          onSetCaptain={onSetCaptain}
          onChangeSelfTeam={onChangeSelfTeam}
          onKickParticipant={isHost ? onKickParticipant : undefined}
          allowTeamChange={lobby.allowTeamChange}
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
          onChangeSelfTeam={onChangeSelfTeam}
          onKickParticipant={isHost ? onKickParticipant : undefined}
          allowTeamChange={lobby.allowTeamChange}
          canManage={isHost}
        />
        <TeamPanel
          title="Spectators"
          team="spectator"
          participants={teamGroups.spectator}
          maxSize={2}
          hostUserId={lobby.hostUserId}
          currentUserId={user?.id}
          currentSessionToken={currentSessionToken || undefined}
          onMoveToTeam={onMoveToTeam}
          onChangeSelfTeam={onChangeSelfTeam}
          onKickParticipant={isHost ? onKickParticipant : undefined}
          allowTeamChange={lobby.allowTeamChange}
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

          {(isHost || (isApiLobby && currentParticipant)) && !lobby.deadlockPartyCode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {isHost && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowDraftConfig(true)}
                  >
                    Configure Draft
                  </Button>
                )}
                <button
                  onClick={handleStartDraft}
                  disabled={startingDraft}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {startingDraft ? 'Starting...' : 'Start Draft'}
                </button>
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
        allowTeamChange={lobby.allowTeamChange}
        onSave={onUpdateDraftConfig}
        onUpdateLobbySettings={onUpdateLobbySettings}
      />
    </div>
  );
}
