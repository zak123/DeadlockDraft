import { useMemo } from 'react';
import { HeroCard } from './HeroCard';
import type { DraftPick } from '@deadlock-draft/shared';

interface HeroGridProps {
  heroes: string[];
  picks: DraftPick[];
  availableHeroes: string[];
  selectedHero: string | null;
  onSelectHero: (heroId: string) => void;
  isMyTurn: boolean;
}

export function HeroGrid({
  heroes,
  picks,
  availableHeroes,
  selectedHero,
  onSelectHero,
  isMyTurn,
}: HeroGridProps) {
  const heroStatus = useMemo(() => {
    const status: Record<string, { isPicked: boolean; isBanned: boolean; team: 'amber' | 'sapphire' | null }> = {};

    for (const hero of heroes) {
      status[hero] = { isPicked: false, isBanned: false, team: null };
    }

    for (const pick of picks) {
      if (pick.type === 'pick') {
        status[pick.heroId] = {
          isPicked: true,
          isBanned: false,
          team: pick.team as 'amber' | 'sapphire' | null,
        };
      } else {
        status[pick.heroId] = {
          isPicked: false,
          isBanned: true,
          team: null,
        };
      }
    }

    return status;
  }, [heroes, picks]);

  return (
    <div className="bg-deadlock-card rounded-xl p-4">
      <div className="grid grid-cols-8 gap-2">
        {heroes.map((heroId) => {
          const { isPicked, isBanned, team } = heroStatus[heroId];
          const isAvailable = availableHeroes.includes(heroId);

          return (
            <HeroCard
              key={heroId}
              heroId={heroId}
              isAvailable={isAvailable && isMyTurn}
              isSelected={selectedHero === heroId}
              isPicked={isPicked}
              isBanned={isBanned}
              pickTeam={team}
              onClick={() => isAvailable && isMyTurn && onSelectHero(heroId)}
            />
          );
        })}
      </div>
    </div>
  );
}
