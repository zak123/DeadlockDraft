import { useState, useMemo, useCallback, useEffect } from 'react';
import { DraftTimer } from './DraftTimer';
import { HeroGrid } from './HeroGrid';
import { TeamDraftPanel } from './TeamDraftPanel';
import { ConfirmPickModal } from './ConfirmPickModal';
import type { DraftState, LobbyParticipant, DraftTeam } from '@deadlock-draft/shared';

interface DraftViewProps {
  draftState: DraftState;
  heroes: string[];
  currentParticipant: LobbyParticipant | null;
  onMakePick: (heroId: string) => void;
  isHost: boolean;
  onCancelDraft: () => Promise<void>;
  onCreateMatch: () => Promise<unknown>;
}

export function DraftView({
  draftState,
  heroes,
  currentParticipant,
  onMakePick,
  isHost,
  onCancelDraft,
  onCreateMatch,
}: DraftViewProps) {
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);

  const { session, config, picks, availableHeroes, currentTurnTimeRemaining } = draftState;

  const currentPhaseType = useMemo(() => {
    let phases = config.phases;
    if (config.skipBans) {
      phases = phases.filter((p) => p.type !== 'ban');
    }
    return phases[session.currentPhaseIndex]?.type || 'pick';
  }, [config, session.currentPhaseIndex]);

  const { currentPickInPhase, totalPicksInPhase } = useMemo(() => {
    let phases = config.phases;
    if (config.skipBans) {
      phases = phases.filter((p) => p.type !== 'ban');
    }

    // Flatten all phases into a single sequence with phase/pick indices
    const flattenedPicks: { team: string; phaseIndex: number; pickIndex: number; phaseType: string }[] = [];
    phases.forEach((phase, phaseIdx) => {
      phase.picks.forEach((team, pickIdx) => {
        flattenedPicks.push({ team, phaseIndex: phaseIdx, pickIndex: pickIdx, phaseType: phase.type });
      });
    });

    // Find current position in flattened array
    const currentFlatIndex = flattenedPicks.findIndex(
      (p) => p.phaseIndex === session.currentPhaseIndex && p.pickIndex === session.currentPickIndex
    );

    if (currentFlatIndex === -1) return { currentPickInPhase: 1, totalPicksInPhase: 1 };

    const currentTeam = session.currentTeam;
    const currentPhaseType = flattenedPicks[currentFlatIndex]?.phaseType;

    // Find the start of consecutive picks for current team (same phase type)
    let startFlatIdx = currentFlatIndex;
    while (
      startFlatIdx > 0 &&
      flattenedPicks[startFlatIdx - 1].team === currentTeam &&
      flattenedPicks[startFlatIdx - 1].phaseType === currentPhaseType
    ) {
      startFlatIdx--;
    }

    // Find the end of consecutive picks for current team (same phase type)
    let endFlatIdx = currentFlatIndex;
    while (
      endFlatIdx < flattenedPicks.length - 1 &&
      flattenedPicks[endFlatIdx + 1].team === currentTeam &&
      flattenedPicks[endFlatIdx + 1].phaseType === currentPhaseType
    ) {
      endFlatIdx++;
    }

    const total = endFlatIdx - startFlatIdx + 1;
    const current = currentFlatIndex - startFlatIdx + 1;

    return { currentPickInPhase: current, totalPicksInPhase: total };
  }, [config, session.currentPhaseIndex, session.currentPickIndex, session.currentTeam]);

  // Calculate how many picks remain in the current consecutive turn
  const remainingPicksInTurn = useMemo(() => {
    return totalPicksInPhase - currentPickInPhase + 1;
  }, [totalPicksInPhase, currentPickInPhase]);

  const myTeam = currentParticipant?.team as DraftTeam | undefined;
  const isMyTurn = myTeam === session.currentTeam && session.status === 'active';

  // Reset selected heroes when turn changes
  useEffect(() => {
    setSelectedHeroes([]);
    setShowConfirmModal(false);
  }, [session.currentTeam, session.currentPhaseIndex, session.currentPickIndex]);

  const teamPicks = useMemo(() => {
    const amberPicks = picks.filter((p) => p.type === 'pick' && p.team === 'amber');
    const sapphirePicks = picks.filter((p) => p.type === 'pick' && p.team === 'sapphire');
    return { amber: amberPicks, sapphire: sapphirePicks };
  }, [picks]);

  const teamBans = useMemo(() => {
    const phases = config.skipBans ? [] : config.phases.filter((p) => p.type === 'ban');
    const totalBanTurns = phases.reduce((acc, p) => acc + p.picks.length, 0);
    const bansPerTeam = totalBanTurns / 2;

    const banPicks = picks.filter((p) => p.type === 'ban');
    const amberBans = banPicks.filter((_, i) => {
      const phases = config.phases.filter((p) => p.type === 'ban');
      let idx = 0;
      for (const phase of phases) {
        for (let j = 0; j < phase.picks.length; j++) {
          if (idx === i) return phase.picks[j] === 'amber';
          idx++;
        }
      }
      return false;
    });
    const sapphireBans = banPicks.filter((p) => !amberBans.includes(p));

    return {
      amber: amberBans,
      sapphire: sapphireBans,
      maxPerTeam: Math.floor(bansPerTeam),
    };
  }, [picks, config]);

  const maxPicksPerTeam = useMemo(() => {
    const phases = config.skipBans
      ? config.phases.filter((p) => p.type !== 'ban')
      : config.phases;
    const pickPhases = phases.filter((p) => p.type === 'pick');
    return pickPhases.reduce((acc, p) => acc + p.picks.filter((t) => t === 'amber').length, 0);
  }, [config]);

  const handleSelectHero = useCallback((heroId: string) => {
    setSelectedHeroes((prev) => {
      if (prev.includes(heroId)) {
        // Deselect if already selected
        return prev.filter((h) => h !== heroId);
      } else {
        // Add to selection
        return [...prev, heroId];
      }
    });
  }, []);

  // Auto-show modal when all selections are made
  useEffect(() => {
    if (selectedHeroes.length === remainingPicksInTurn && selectedHeroes.length > 0 && isMyTurn) {
      setShowConfirmModal(true);
    }
  }, [selectedHeroes, remainingPicksInTurn, isMyTurn]);

  const handleConfirmPick = useCallback(async () => {
    if (selectedHeroes.length === 0 || !isMyTurn) return;
    setIsConfirming(true);
    try {
      // Make picks in order with small delay between each
      for (let i = 0; i < selectedHeroes.length; i++) {
        onMakePick(selectedHeroes[i]);
        // Small delay between picks to ensure server processes them in order
        if (i < selectedHeroes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      setSelectedHeroes([]);
      setShowConfirmModal(false);
    } finally {
      setIsConfirming(false);
    }
  }, [selectedHeroes, isMyTurn, onMakePick]);

  const handleCancelSelection = useCallback(() => {
    setSelectedHeroes([]);
    setShowConfirmModal(false);
  }, []);

  const handleCancelDraft = useCallback(async () => {
    if (!confirm('Are you sure you want to cancel the draft? All progress will be lost.')) return;
    setIsCancelling(true);
    try {
      await onCancelDraft();
    } finally {
      setIsCancelling(false);
    }
  }, [onCancelDraft]);

  const handleCreateMatch = useCallback(async () => {
    setCreatingMatch(true);
    try {
      await onCreateMatch();
    } finally {
      setCreatingMatch(false);
    }
  }, [onCreateMatch]);

  if (session.status === 'completed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] gap-8">
        <h2 className="text-3xl font-bold text-white">Draft Complete!</h2>
        <div className="grid grid-cols-2 gap-8 w-full max-w-4xl">
          <TeamDraftPanel
            team="amber"
            picks={teamPicks.amber}
            bans={teamBans.amber}
            maxPicks={maxPicksPerTeam}
            maxBans={teamBans.maxPerTeam}
            isCurrentTurn={false}
          />
          <TeamDraftPanel
            team="sapphire"
            picks={teamPicks.sapphire}
            bans={teamBans.sapphire}
            maxPicks={maxPicksPerTeam}
            maxBans={teamBans.maxPerTeam}
            isCurrentTurn={false}
          />
        </div>
        {isHost && (
          <button
            onClick={handleCreateMatch}
            disabled={creatingMatch}
            className="px-8 py-3 bg-amber hover:bg-amber/80 text-black rounded-lg font-bold text-lg transition-colors disabled:opacity-50"
          >
            {creatingMatch ? 'Creating Match...' : 'Create Deadlock Match'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isHost && (
        <div className="flex justify-end">
          <button
            onClick={handleCancelDraft}
            disabled={isCancelling}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Draft'}
          </button>
        </div>
      )}
      <DraftTimer
        currentTeam={session.currentTeam}
        currentPhaseType={currentPhaseType}
        timeRemaining={currentTurnTimeRemaining}
        isMyTurn={isMyTurn}
        timerEnabled={config.timerEnabled}
        currentPickInPhase={currentPickInPhase}
        totalPicksInPhase={totalPicksInPhase}
      />

      <div className="grid grid-cols-[1fr_2fr_1fr] gap-4 items-start">
        <TeamDraftPanel
          team="amber"
          picks={teamPicks.amber}
          bans={teamBans.amber}
          maxPicks={maxPicksPerTeam}
          maxBans={teamBans.maxPerTeam}
          isCurrentTurn={session.currentTeam === 'amber'}
          phaseType={currentPhaseType}
        />

        <div className="flex flex-col gap-4">
          <HeroGrid
            heroes={heroes}
            picks={picks}
            availableHeroes={availableHeroes}
            selectedHeroes={selectedHeroes}
            onSelectHero={handleSelectHero}
            isMyTurn={isMyTurn}
            phaseType={currentPhaseType}
            maxSelections={remainingPicksInTurn}
          />

          {isMyTurn && (
            <div className="flex flex-col items-center gap-2 h-12">
              {selectedHeroes.length === 0 && (
                <div className="text-deadlock-muted">
                  Select {remainingPicksInTurn > 1 ? `up to ${remainingPicksInTurn} heroes` : 'a hero'} to {currentPhaseType}
                </div>
              )}
              {remainingPicksInTurn > 1 && selectedHeroes.length > 0 && selectedHeroes.length < remainingPicksInTurn && (
                <div className="text-sm text-deadlock-muted">
                  {remainingPicksInTurn - selectedHeroes.length} more selection{remainingPicksInTurn - selectedHeroes.length > 1 ? 's' : ''} available
                </div>
              )}
            </div>
          )}

          {!isMyTurn && session.status === 'active' && (
            <div className="text-center text-deadlock-muted">
              Waiting for {session.currentTeam === 'amber' ? 'Team Amber' : 'Team Sapphire'} to{' '}
              {currentPhaseType}...
            </div>
          )}
        </div>

        <TeamDraftPanel
          team="sapphire"
          picks={teamPicks.sapphire}
          bans={teamBans.sapphire}
          maxPicks={maxPicksPerTeam}
          maxBans={teamBans.maxPerTeam}
          isCurrentTurn={session.currentTeam === 'sapphire'}
          phaseType={currentPhaseType}
        />
      </div>

      <ConfirmPickModal
        isOpen={showConfirmModal}
        selectedHeroes={selectedHeroes}
        phaseType={currentPhaseType}
        onConfirm={handleConfirmPick}
        onCancel={handleCancelSelection}
        isConfirming={isConfirming}
      />
    </div>
  );
}
