import { useState } from 'react';
import type { WaitlistEntry, LobbyWithParticipants, LobbyParticipant } from '@deadlock-draft/shared';
import { Button } from '../common/Button';

interface WaitlistPanelProps {
  lobby: LobbyWithParticipants;
  waitlist: WaitlistEntry[];
  totalCount: number;
  isHost: boolean;
  onPromote: (userId: string) => Promise<LobbyParticipant>;
  onFillRandom: (count: number) => Promise<LobbyParticipant[]>;
}

export function WaitlistPanel({
  lobby,
  waitlist,
  totalCount,
  isHost,
  onPromote,
  onFillRandom,
}: WaitlistPanelProps) {
  const [promoting, setPromoting] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  const playerCount = lobby.participants.filter((p) => p.team !== 'spectator').length;
  const availableSlots = lobby.maxPlayers - playerCount;

  const handlePromote = async (userId: string) => {
    setPromoting(userId);
    try {
      await onPromote(userId);
    } finally {
      setPromoting(null);
    }
  };

  const handleFillRandom = async () => {
    if (availableSlots <= 0) return;
    setFilling(true);
    try {
      await onFillRandom(availableSlots);
    } finally {
      setFilling(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white flex items-center gap-2">
          Waitlist
          <span className="text-gray-400 text-sm font-normal">
            ({totalCount}/128)
          </span>
        </h3>
        {isHost && availableSlots > 0 && waitlist.length > 0 && (
          <Button
            size="sm"
            onClick={handleFillRandom}
            disabled={filling}
            className="text-xs"
          >
            {filling ? 'Filling...' : `Fill ${Math.min(availableSlots, waitlist.length)}`}
          </Button>
        )}
      </div>

      {waitlist.length === 0 ? (
        <div className="text-gray-400 text-sm text-center py-4">
          No viewers in queue yet
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {waitlist.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-center justify-between bg-gray-700 rounded-lg p-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs w-6">#{index + 1}</span>
                {entry.user.avatarMedium && (
                  <img
                    src={entry.user.avatarMedium}
                    alt={entry.user.displayName}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="text-white text-sm">{entry.user.displayName}</span>
              </div>
              {isHost && availableSlots > 0 && (
                <button
                  onClick={() => handlePromote(entry.userId)}
                  disabled={promoting === entry.userId}
                  className="w-6 h-6 flex items-center justify-center bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-white text-xs transition-colors"
                  title="Promote to lobby"
                >
                  {promoting === entry.userId ? (
                    <span className="animate-spin">...</span>
                  ) : (
                    '+'
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {availableSlots <= 0 && waitlist.length > 0 && (
        <div className="text-yellow-400 text-xs text-center mt-2">
          Lobby is full. Remove a player to promote from waitlist.
        </div>
      )}
    </div>
  );
}
