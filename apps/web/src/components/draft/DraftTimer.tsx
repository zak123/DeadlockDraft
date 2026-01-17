import clsx from 'clsx';
import type { DraftTeam, DraftPhaseType } from '@deadlock-draft/shared';

interface DraftTimerProps {
  currentTeam: DraftTeam;
  currentPhaseType: DraftPhaseType;
  timeRemaining: number;
  isMyTurn: boolean;
  timerEnabled: boolean;
  currentPickInPhase: number;
  totalPicksInPhase: number;
  remainingPicksInTurn: number;
}

export function DraftTimer({
  currentTeam,
  currentPhaseType,
  timeRemaining,
  isMyTurn,
  timerEnabled,
  currentPickInPhase,
  totalPicksInPhase,
  remainingPicksInTurn,
}: DraftTimerProps) {
  const teamName = currentTeam === 'amber' ? 'Team Amber' : 'Team Sapphire';
  const phaseText = currentPhaseType === 'pick' ? 'Pick' : 'Ban';
  const isLowTime = timerEnabled && timeRemaining <= 10;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="text-sm text-deadlock-muted uppercase tracking-widest">
        {phaseText} Phase
      </div>
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-4 h-4 rounded-full',
            currentTeam === 'amber' ? 'bg-amber' : 'bg-sapphire'
          )}
        />
        <span
          className={clsx(
            'text-2xl font-bold',
            currentTeam === 'amber' ? 'text-amber' : 'text-sapphire'
          )}
        >
          {teamName}'s Turn
        </span>
      </div>
      <div className="text-lg font-semibold text-white bg-deadlock-card px-4 py-1 rounded-full">
        {phaseText} {currentPickInPhase} of {totalPicksInPhase}
      </div>
      {isMyTurn && (
        <div
          className={clsx(
            'text-2xl font-bold animate-pulse px-6 py-2 rounded-lg mt-2',
            currentPhaseType === 'pick'
              ? 'text-green-400 bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.4)]'
              : 'text-red-400 bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
          )}
        >
          Your turn to {currentPhaseType} {remainingPicksInTurn > 1 ? `${remainingPicksInTurn} heroes` : ''}!
        </div>
      )}
      {timerEnabled ? (
        <>
          <div
            className={clsx(
              'text-5xl font-mono font-bold mt-2 transition-colors',
              isLowTime ? 'text-red-500 animate-pulse' : 'text-white'
            )}
          >
            {formatTime(timeRemaining)}
          </div>
          {isLowTime && (
            <div className="text-red-400 text-sm">Hurry up!</div>
          )}
        </>
      ) : (
        <div className="text-xl text-deadlock-muted mt-2">
          No Timer
        </div>
      )}
    </div>
  );
}
