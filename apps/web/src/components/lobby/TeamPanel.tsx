import clsx from 'clsx';
import { PlayerCard } from './PlayerCard';
import type { LobbyParticipant, Team } from '@deadlock-draft/shared';

interface TeamPanelProps {
  title: string;
  team: Team;
  participants: LobbyParticipant[];
  maxSize?: number;
  hostUserId: string | null;
  currentUserId?: string;
  currentSessionToken?: string;
  onMoveToTeam?: (participantId: string, team: Team) => void;
  onSetCaptain?: (participantId: string, isCaptain: boolean) => void;
  onChangeSelfTeam?: (team: Team) => Promise<void>;
  onKickParticipant?: (participantId: string) => void;
  allowTeamChange?: boolean;
  canManage: boolean;
}

const teamColors: Record<Team, { bg: string; border: string; text: string }> = {
  amber: {
    bg: 'bg-amber/5',
    border: 'border-amber/30',
    text: 'text-amber',
  },
  sapphire: {
    bg: 'bg-sapphire/5',
    border: 'border-sapphire/30',
    text: 'text-sapphire',
  },
  spectator: {
    bg: 'bg-deadlock-card',
    border: 'border-deadlock-border',
    text: 'text-deadlock-muted',
  },
  unassigned: {
    bg: 'bg-deadlock-card',
    border: 'border-deadlock-border',
    text: 'text-deadlock-text',
  },
};

export function TeamPanel({
  title,
  team,
  participants,
  maxSize,
  hostUserId,
  currentUserId,
  currentSessionToken,
  onMoveToTeam,
  onSetCaptain,
  onChangeSelfTeam,
  onKickParticipant,
  allowTeamChange,
  canManage,
}: TeamPanelProps) {
  const colors = teamColors[team];
  const showCaptainControls = team === 'amber' || team === 'sapphire';

  return (
    <div className={clsx('rounded-xl border p-4', colors.bg, colors.border)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={clsx('font-semibold', colors.text)}>{title}</h3>
        {maxSize && (
          <span className="text-sm text-deadlock-muted">
            {participants.length}/{maxSize}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {participants.length === 0 ? (
          <p className="text-sm text-deadlock-muted text-center py-4">
            No players
          </p>
        ) : (
          participants.map((participant) => {
            const isHost = participant.userId === hostUserId;
            const isCurrentUser =
              (currentUserId && participant.userId === currentUserId) ||
              (currentSessionToken && participant.sessionToken === currentSessionToken);

            return (
              <PlayerCard
                key={participant.id}
                participant={participant}
                isHost={isHost}
                isCurrentUser={!!isCurrentUser}
                onMoveToTeam={
                  onMoveToTeam
                    ? (newTeam) => onMoveToTeam(participant.id, newTeam)
                    : undefined
                }
                onSetCaptain={
                  onSetCaptain
                    ? (isCaptain) => onSetCaptain(participant.id, isCaptain)
                    : undefined
                }
                onChangeSelfTeam={isCurrentUser && allowTeamChange ? onChangeSelfTeam : undefined}
                onKick={
                  onKickParticipant
                    ? () => onKickParticipant(participant.id)
                    : undefined
                }
                canManage={canManage}
                showCaptainControls={showCaptainControls}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
