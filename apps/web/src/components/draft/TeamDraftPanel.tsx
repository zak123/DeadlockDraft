import clsx from 'clsx';
import { HeroCard } from './HeroCard';
import type { DraftPick, DraftTeam } from '@deadlock-draft/shared';

interface TeamDraftPanelProps {
  team: DraftTeam;
  picks: DraftPick[];
  bans: DraftPick[];
  maxPicks: number;
  maxBans: number;
  isCurrentTurn: boolean;
}

export function TeamDraftPanel({
  team,
  picks,
  bans,
  maxPicks,
  maxBans,
  isCurrentTurn,
}: TeamDraftPanelProps) {
  const teamName = team === 'amber' ? 'Team Amber' : 'Team Sapphire';
  const teamColor = team === 'amber' ? 'amber' : 'sapphire';

  const emptyPickSlots = maxPicks - picks.length;
  const emptyBanSlots = maxBans - bans.length;

  return (
    <div
      className={clsx(
        'flex flex-col bg-deadlock-card rounded-xl p-4 transition-all',
        isCurrentTurn && 'ring-2',
        isCurrentTurn && team === 'amber' && 'ring-amber',
        isCurrentTurn && team === 'sapphire' && 'ring-sapphire'
      )}
    >
      <h3
        className={clsx(
          'text-lg font-bold mb-4 text-center',
          team === 'amber' ? 'text-amber' : 'text-sapphire'
        )}
      >
        {teamName}
      </h3>

      <div className="flex-1">
        <div className="text-xs text-deadlock-muted mb-2 uppercase tracking-wide">Picks</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {picks.map((pick) => (
            <div key={pick.id} className="flex items-center gap-2">
              <HeroCard
                heroId={pick.heroId}
                isAvailable={false}
                isPicked
                pickTeam={team}
                size="sm"
              />
              <span className="text-sm truncate capitalize">
                {pick.heroId.replace('_', ' ')}
              </span>
            </div>
          ))}
          {Array.from({ length: emptyPickSlots }).map((_, i) => (
            <div
              key={`empty-pick-${i}`}
              className="flex items-center gap-2"
            >
              <div
                className={clsx(
                  'w-12 h-12 rounded-lg border-2 border-dashed',
                  team === 'amber' ? 'border-amber/30' : 'border-sapphire/30'
                )}
              />
              <span className="text-sm text-deadlock-muted">—</span>
            </div>
          ))}
        </div>

        {maxBans > 0 && (
          <>
            <div className="text-xs text-deadlock-muted mb-2 uppercase tracking-wide">Bans</div>
            <div className="flex gap-2 flex-wrap">
              {bans.map((ban) => (
                <HeroCard
                  key={ban.id}
                  heroId={ban.heroId}
                  isAvailable={false}
                  isBanned
                  size="sm"
                />
              ))}
              {Array.from({ length: emptyBanSlots }).map((_, i) => (
                <div
                  key={`empty-ban-${i}`}
                  className="w-12 h-12 rounded-lg border-2 border-dashed border-red-500/30"
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
