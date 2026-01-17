import clsx from 'clsx';

interface HeroCardProps {
  heroId: string;
  isAvailable: boolean;
  isSelected?: boolean;
  isPicked?: boolean;
  isBanned?: boolean;
  pickTeam?: 'amber' | 'sapphire' | null;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

function formatHeroName(heroId: string): string {
  return heroId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function HeroCard({
  heroId,
  isAvailable,
  isSelected = false,
  isPicked = false,
  isBanned = false,
  pickTeam,
  onClick,
  size = 'md',
}: HeroCardProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  };

  const heroName = formatHeroName(heroId);
  const heroImage = `/assets/heroes/${heroId}.png`;

  return (
    <button
      onClick={onClick}
      disabled={!isAvailable || isPicked || isBanned}
      className={clsx(
        'relative rounded-lg overflow-hidden transition-all duration-150',
        sizeClasses[size],
        isAvailable && !isPicked && !isBanned && 'hover:scale-105 hover:ring-2 hover:ring-white/50 cursor-pointer',
        isSelected && 'ring-2 ring-amber scale-105',
        isPicked && pickTeam === 'amber' && 'ring-2 ring-amber opacity-50',
        isPicked && pickTeam === 'sapphire' && 'ring-2 ring-sapphire opacity-50',
        isBanned && 'opacity-30 grayscale',
        !isAvailable && !isPicked && !isBanned && 'opacity-40'
      )}
      title={heroName}
    >
      <img
        src={heroImage}
        alt={heroName}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/assets/heroes/placeholder.png';
        }}
      />
      {isBanned && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}
      {isPicked && pickTeam && (
        <div
          className={clsx(
            'absolute bottom-0 left-0 right-0 h-1',
            pickTeam === 'amber' ? 'bg-amber' : 'bg-sapphire'
          )}
        />
      )}
    </button>
  );
}
