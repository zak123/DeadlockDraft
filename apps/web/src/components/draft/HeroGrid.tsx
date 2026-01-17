import { useMemo } from 'react';
import { HeroCard } from './HeroCard';
import type { DraftPick, DraftPhaseType } from '@deadlock-draft/shared';

interface HeroGridProps {
  heroes: string[];
  picks: DraftPick[];
  availableHeroes: string[];
  selectedHeroes: string[];
  onSelectHero: (heroId: string) => void;
  isMyTurn: boolean;
  phaseType: DraftPhaseType;
  maxSelections: number;
}

export function HeroGrid({
  heroes,
  picks,
  availableHeroes,
  selectedHeroes,
  onSelectHero,
  isMyTurn,
  phaseType,
  maxSelections,
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

  const handleHeroClick = (heroId: string) => {
    if (!isMyTurn) return;
    const isAvailable = availableHeroes.includes(heroId);
    if (!isAvailable) return;

    const isAlreadySelected = selectedHeroes.includes(heroId);
    if (isAlreadySelected) {
      onSelectHero(heroId); // Toggle off
    } else if (selectedHeroes.length < maxSelections) {
      onSelectHero(heroId); // Add selection
    }
  };

  return (
    <div className="bg-deadlock-card rounded-xl p-4">
      <div className="grid grid-cols-8 gap-2">
        {heroes.map((heroId) => {
          const { isPicked, isBanned, team } = heroStatus[heroId];
          const isAvailable = availableHeroes.includes(heroId);
          const isSelected = selectedHeroes.includes(heroId);
          const canSelect = isMyTurn && isAvailable && (isSelected || selectedHeroes.length < maxSelections);

          return (
            <HeroCard
              key={heroId}
              heroId={heroId}
              isAvailable={canSelect}
              isSelected={isSelected}
              isPicked={isPicked}
              isBanned={isBanned}
              pickTeam={team}
              phaseType={phaseType}
              onClick={() => handleHeroClick(heroId)}
            />
          );
        })}
      </div>
    </div>
  );
}
