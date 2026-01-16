import clsx from 'clsx';
import type { LobbyParticipant, Team } from '@deadlock-draft/shared';

interface PlayerCardProps {
  participant: LobbyParticipant;
  isHost: boolean;
  isCurrentUser: boolean;
  onMoveToTeam?: (team: Team) => void;
  canManage: boolean;
}

export function PlayerCard({
  participant,
  isHost,
  isCurrentUser,
  onMoveToTeam,
  canManage,
}: PlayerCardProps) {
  const displayName = participant.user?.displayName || participant.anonymousName || 'Anonymous';
  const avatar = participant.user?.avatarMedium;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 p-3 rounded-lg transition-colors',
        isCurrentUser ? 'bg-amber/10 border border-amber/30' : 'bg-deadlock-bg',
        participant.isReady && 'ring-2 ring-green-500/50'
      )}
    >
      {avatar ? (
        <img src={avatar} alt={displayName} className="w-10 h-10 rounded-full" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-deadlock-border flex items-center justify-center">
          <span className="text-lg font-semibold text-deadlock-muted">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{displayName}</span>
          {isHost && (
            <span className="px-1.5 py-0.5 text-xs bg-amber/20 text-amber rounded">
              Host
            </span>
          )}
          {participant.isReady && (
            <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
              Ready
            </span>
          )}
        </div>
        {!participant.user && (
          <span className="text-xs text-deadlock-muted">Guest</span>
        )}
      </div>

      {canManage && onMoveToTeam && (
        <div className="flex gap-1">
          <button
            onClick={() => onMoveToTeam('amber')}
            className="p-1 hover:bg-amber/20 rounded transition-colors"
            title="Move to Amber"
          >
            <div className="w-4 h-4 rounded-full bg-amber" />
          </button>
          <button
            onClick={() => onMoveToTeam('sapphire')}
            className="p-1 hover:bg-sapphire/20 rounded transition-colors"
            title="Move to Sapphire"
          >
            <div className="w-4 h-4 rounded-full bg-sapphire" />
          </button>
          <button
            onClick={() => onMoveToTeam('spectator')}
            className="p-1 hover:bg-deadlock-border rounded transition-colors"
            title="Move to Spectators"
          >
            <svg className="w-4 h-4 text-deadlock-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
