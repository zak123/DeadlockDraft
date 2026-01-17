import clsx from 'clsx';
import { HeroCard } from './HeroCard';
import type { DraftPhaseType } from '@deadlock-draft/shared';

interface ConfirmPickModalProps {
  isOpen: boolean;
  selectedHeroes: string[];
  phaseType: DraftPhaseType;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
}

function formatHeroName(heroId: string): string {
  return heroId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ConfirmPickModal({
  isOpen,
  selectedHeroes,
  phaseType,
  onConfirm,
  onCancel,
  isConfirming,
}: ConfirmPickModalProps) {
  if (!isOpen || selectedHeroes.length === 0) return null;

  const isPicking = phaseType === 'pick';
  const actionText = isPicking ? 'Pick' : 'Ban';
  const pluralText = selectedHeroes.length > 1 ? `${actionText} ${selectedHeroes.length} Heroes` : `${actionText} Hero`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div
        className={clsx(
          'relative bg-deadlock-card rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl border-2',
          isPicking ? 'border-green-500/50' : 'border-red-500/50'
        )}
      >
        <div
          className={clsx(
            'absolute inset-0 rounded-xl opacity-10',
            isPicking ? 'bg-green-500' : 'bg-red-500'
          )}
        />

        <div className="relative">
          <h2
            className={clsx(
              'text-2xl font-bold text-center mb-6',
              isPicking ? 'text-green-400' : 'text-red-400'
            )}
          >
            Confirm {actionText}{selectedHeroes.length > 1 ? 's' : ''}
          </h2>

          <div className="flex justify-center gap-4 mb-6">
            {selectedHeroes.map((heroId) => (
              <div key={heroId} className="flex flex-col items-center gap-2">
                <HeroCard
                  heroId={heroId}
                  isAvailable={false}
                  isSelected
                  phaseType={phaseType}
                  size="lg"
                />
                <span className="text-sm font-medium text-white">
                  {formatHeroName(heroId)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-6 py-3 bg-deadlock-border hover:bg-deadlock-muted/30 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isConfirming}
              className={clsx(
                'flex-1 px-6 py-3 rounded-lg font-bold text-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2',
                isPicking
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)]'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]'
              )}
            >
              {isConfirming ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirming...
                </>
              ) : (
                pluralText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
