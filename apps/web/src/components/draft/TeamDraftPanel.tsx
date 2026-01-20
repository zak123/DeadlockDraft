import clsx from 'clsx';
import { HeroCard } from './HeroCard';
import type { DraftPick, DraftTeam, DraftPhaseType } from '@deadlock-draft/shared';

interface TeamDraftPanelProps {
  team: DraftTeam;
  picks: DraftPick[];
  bans: DraftPick[];
  maxPicks: number;
  maxBans: number;
  isCurrentTurn: boolean;
  phaseType?: DraftPhaseType;
}

export function TeamDraftPanel({
  team,
  picks,
  bans,
  maxPicks,
  maxBans,
  isCurrentTurn,
  phaseType = 'pick',
}: TeamDraftPanelProps) {
  const teamName = team === 'amber' ? 'Team Amber' : 'Team Sapphire';

  const emptyPickSlots = maxPicks - picks.length;
  const emptyBanSlots = maxBans - bans.length;

  const isPicking = phaseType === 'pick';

  return (
    <div className="relative">
      {/* Animated glow background */}
      <div
        className={clsx(
          'absolute inset-0 rounded-xl transition-[opacity,box-shadow,background-color] duration-500 ease-in-out',
          isCurrentTurn && isPicking && 'bg-green-500/20 shadow-[0_0_40px_rgba(34,197,94,0.3)]',
          isCurrentTurn && !isPicking && 'bg-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.3)]',
          !isCurrentTurn && 'opacity-0'
        )}
      />
      <div
        className={clsx(
          'relative flex flex-col bg-deadlock-card rounded-xl p-2 sm:p-4',
          isCurrentTurn && 'ring-2',
          isCurrentTurn && isPicking && 'ring-green-500',
          isCurrentTurn && !isPicking && 'ring-red-500',
          !isCurrentTurn && team === 'amber' && 'border border-amber/20',
          !isCurrentTurn && team === 'sapphire' && 'border border-sapphire/20'
        )}
      >
      <h3
        className={clsx(
          'text-base sm:text-lg font-bold mb-2 sm:mb-4 text-center',
          team === 'amber' ? 'text-amber' : 'text-sapphire'
        )}
      >
        {teamName}
      </h3>

      <div className="flex-1">
        <div className="text-xs text-deadlock-muted mb-1 sm:mb-2 uppercase tracking-wide">Picks</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 mb-2 sm:mb-4">
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
            <div className="text-xs text-deadlock-muted mb-1 sm:mb-2 uppercase tracking-wide">Bans</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2">
              {bans.map((ban) => (
                <div key={ban.id} className="flex items-center gap-2">
                  <HeroCard
                    heroId={ban.heroId}
                    isAvailable={false}
                    isBanned
                    size="sm"
                  />
                  <span className="text-sm truncate capitalize text-red-400/70">
                    {ban.heroId.replace('_', ' ')}
                  </span>
                </div>
              ))}
              {Array.from({ length: emptyBanSlots }).map((_, i) => (
                <div
                  key={`empty-ban-${i}`}
                  className="flex items-center gap-2"
                >
                  <div className="w-12 h-12 rounded-lg border-2 border-dashed border-red-500/30" />
                  <span className="text-sm text-deadlock-muted">—</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
