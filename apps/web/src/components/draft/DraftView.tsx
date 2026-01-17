import { useState, useMemo, useCallback } from 'react';
import { DraftTimer } from './DraftTimer';
import { HeroGrid } from './HeroGrid';
import { TeamDraftPanel } from './TeamDraftPanel';
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
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
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
    const currentPhase = phases[session.currentPhaseIndex];
    if (!currentPhase) return { currentPickInPhase: 1, totalPicksInPhase: 1 };

    const phasePicks = currentPhase.picks;
    const currentIdx = session.currentPickIndex;
    const currentTeam = session.currentTeam;

    // Find the start and end of consecutive picks for current team
    let startIdx = currentIdx;
    let endIdx = currentIdx;

    // Find start of consecutive run
    while (startIdx > 0 && phasePicks[startIdx - 1] === currentTeam) {
      startIdx--;
    }

    // Find end of consecutive run
    while (endIdx < phasePicks.length - 1 && phasePicks[endIdx + 1] === currentTeam) {
      endIdx++;
    }

    const total = endIdx - startIdx + 1;
    const current = currentIdx - startIdx + 1;

    return { currentPickInPhase: current, totalPicksInPhase: total };
  }, [config, session.currentPhaseIndex, session.currentPickIndex, session.currentTeam]);

  const myTeam = currentParticipant?.team as DraftTeam | undefined;
  const isMyTurn = myTeam === session.currentTeam && session.status === 'active';

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
    setSelectedHero(heroId);
    setIsConfirming(false);
  }, []);

  const handleConfirmPick = useCallback(() => {
    if (!selectedHero || !isMyTurn) return;
    setIsConfirming(true);
    onMakePick(selectedHero);
    setSelectedHero(null);
    setIsConfirming(false);
  }, [selectedHero, isMyTurn, onMakePick]);

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

      <div className="grid grid-cols-[1fr_2fr_1fr] gap-4">
        <TeamDraftPanel
          team="amber"
          picks={teamPicks.amber}
          bans={teamBans.amber}
          maxPicks={maxPicksPerTeam}
          maxBans={teamBans.maxPerTeam}
          isCurrentTurn={session.currentTeam === 'amber'}
        />

        <div className="flex flex-col gap-4">
          <HeroGrid
            heroes={heroes}
            picks={picks}
            availableHeroes={availableHeroes}
            selectedHero={selectedHero}
            onSelectHero={handleSelectHero}
            isMyTurn={isMyTurn}
          />

          {isMyTurn && (
            <div className="flex justify-center gap-4">
              {selectedHero ? (
                <>
                  <button
                    onClick={() => setSelectedHero(null)}
                    className="px-6 py-3 bg-deadlock-card hover:bg-deadlock-border rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmPick}
                    disabled={isConfirming}
                    className="px-8 py-3 bg-amber hover:bg-amber/80 text-black rounded-lg font-bold transition-colors disabled:opacity-50"
                  >
                    {isConfirming
                      ? 'Confirming...'
                      : currentPhaseType === 'ban'
                      ? `Ban ${selectedHero.replace('_', ' ')}`
                      : `Pick ${selectedHero.replace('_', ' ')}`}
                  </button>
                </>
              ) : (
                <div className="text-deadlock-muted">
                  Select a hero to {currentPhaseType}
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
        />
      </div>
    </div>
  );
}
