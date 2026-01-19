import { useState, useMemo, useCallback, useEffect } from 'react';
import { DraftTimer } from './DraftTimer';
import { HeroGrid } from './HeroGrid';
import { TeamDraftPanel } from './TeamDraftPanel';
import { ConfirmPickModal } from './ConfirmPickModal';
import type { DraftState, LobbyParticipant, DraftTeam, DraftPick } from '@deadlock-draft/shared';

interface DraftViewProps {
  draftState: DraftState;
  heroes: string[];
  currentParticipant: LobbyParticipant | null;
  participants: LobbyParticipant[];
  onMakePick: (heroId: string) => void;
  onSelectHero: (heroId: string) => Promise<void>;
  isHost: boolean;
  onCancelDraft: () => Promise<void>;
  onSetPartyCode: (partyCode: string) => Promise<void>;
  partyCode: string | null;
  onPlayAgain?: () => Promise<void>;
}

export function DraftView({
  draftState,
  heroes,
  currentParticipant,
  participants,
  onMakePick,
  onSelectHero,
  isHost,
  onCancelDraft,
  onSetPartyCode,
  partyCode,
  onPlayAgain,
}: DraftViewProps) {
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPlayingAgain, setIsPlayingAgain] = useState(false);
  const [showPartyCodeCopied, setShowPartyCodeCopied] = useState(false);
  const [showPartyCode, setShowPartyCode] = useState(false);
  const [manualPartyCode, setManualPartyCode] = useState('');
  const [savingPartyCode, setSavingPartyCode] = useState(false);
  const [partyCodeError, setPartyCodeError] = useState<string | null>(null);

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

  const handleSavePartyCode = useCallback(async () => {
    if (!manualPartyCode.trim()) {
      setPartyCodeError('Please enter a party code');
      return;
    }
    setSavingPartyCode(true);
    setPartyCodeError(null);
    try {
      await onSetPartyCode(manualPartyCode.trim().toUpperCase());
      setManualPartyCode('');
    } catch (err) {
      setPartyCodeError(err instanceof Error ? err.message : 'Failed to save party code');
    } finally {
      setSavingPartyCode(false);
    }
  }, [manualPartyCode, onSetPartyCode]);

  const handleCopyPartyCode = () => {
    if (partyCode) {
      navigator.clipboard.writeText(partyCode);
      setShowPartyCodeCopied(true);
      setTimeout(() => setShowPartyCodeCopied(false), 2000);
    }
  };

  if (session.status === 'completed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] gap-8">
        <h2 className="text-3xl font-bold text-white">Draft Complete!</h2>

        {/* Party Code Section */}
        {partyCode ? (
          <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-6 text-center max-w-md w-full">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h3 className="text-xl font-bold text-green-400">Party Created!</h3>
            </div>
            <p className="text-deadlock-muted text-sm mb-4">
              Enter this code in Deadlock to join the custom match
            </p>

            <div className="relative">
              <div className="flex items-center justify-center gap-2 bg-deadlock-bg rounded-lg p-4">
                <button
                  onClick={() => setShowPartyCode(!showPartyCode)}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  title={showPartyCode ? 'Hide code' : 'Show code'}
                >
                  <span className="font-mono text-3xl font-bold text-green-400 tracking-wider">
                    {showPartyCode ? partyCode : '•••••'}
                  </span>
                  {showPartyCode ? (
                    <svg className="w-5 h-5 text-deadlock-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-deadlock-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleCopyPartyCode}
                  className="p-2 hover:bg-deadlock-border rounded-lg transition-colors"
                  title="Copy code"
                >
                  <svg className="w-5 h-5 text-deadlock-muted hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              {showPartyCodeCopied && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 text-white text-sm rounded whitespace-nowrap">
                  Code copied!
                </div>
              )}
            </div>

            <p className="text-deadlock-muted text-xs mt-4">
              Open Deadlock → Play → Custom → Enter Party Code
            </p>
          </div>
        ) : isHost ? (
          <div className="bg-amber/10 border-2 border-amber/50 rounded-xl p-6 max-w-lg w-full">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-3 h-3 bg-amber rounded-full animate-pulse"></div>
              <h3 className="text-xl font-bold text-amber animate-pulse">Action Required</h3>
              <div className="w-3 h-3 bg-amber rounded-full animate-pulse"></div>
            </div>
            <p className="text-center text-amber/90 mb-4">
              Your lobby is waiting! Create the party in Deadlock and share the code.
            </p>
            <div className="text-left text-sm text-deadlock-muted space-y-2 mb-4 bg-deadlock-bg/50 rounded-lg p-3">
              <p>1. Open <span className="text-white font-medium">Deadlock</span></p>
              <p>2. Go to <span className="text-white font-medium">Play → Custom → Create Party</span></p>
              <p>3. Copy the party code shown in Deadlock</p>
              <p>4. Paste it below to share with the lobby</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={manualPartyCode}
                onChange={(e) => setManualPartyCode(e.target.value.toUpperCase())}
                placeholder="Enter party code (e.g. LGDC5)"
                className="flex-1 px-4 py-2 bg-deadlock-bg border-2 border-amber/50 rounded-lg text-white font-mono text-lg tracking-wider placeholder:text-deadlock-muted placeholder:font-sans placeholder:text-sm focus:outline-none focus:border-amber"
                maxLength={10}
              />
              <button
                onClick={handleSavePartyCode}
                disabled={savingPartyCode || !manualPartyCode.trim()}
                className="px-6 py-2 bg-amber hover:bg-amber/80 text-black rounded-lg font-bold transition-colors disabled:opacity-50"
              >
                {savingPartyCode ? 'Saving...' : 'Share'}
              </button>
            </div>
            {partyCodeError && (
              <p className="text-red-400 text-sm mt-2">{partyCodeError}</p>
            )}
          </div>
        ) : (
          <div className="bg-amber/10 border border-amber/30 rounded-xl p-6 text-center max-w-md w-full">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber border-t-transparent"></div>
              <span className="text-xl font-bold text-amber animate-pulse">
                Waiting for Host
              </span>
            </div>
            <p className="text-amber/80">
              The host needs to create the party in Deadlock and share the code.
            </p>
            <p className="text-deadlock-muted text-sm mt-2">
              The party code will appear here once shared.
            </p>
          </div>
        )}

        {/* Play Again Button for Host */}
        {isHost && onPlayAgain && (
          <button
            onClick={async () => {
              if (!confirm('Are you sure you want to play again? This will clear the current draft and reset everyone to the lobby.')) {
                return;
              }
              setIsPlayingAgain(true);
              try {
                await onPlayAgain();
              } finally {
                setIsPlayingAgain(false);
              }
            }}
            disabled={isPlayingAgain}
            className="px-6 py-3 bg-amber hover:bg-amber/80 text-black rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            {isPlayingAgain ? 'Resetting...' : 'Play Again?'}
          </button>
        )}

        {/* Hero Selection Instruction */}
        <div className="text-center text-deadlock-muted text-sm max-w-md">
          Click a hero on your team to indicate which hero you'd like to play.
        </div>

        <div className="grid grid-cols-2 gap-8 w-full max-w-4xl">
          <CompletedTeamPanel
            team="amber"
            picks={teamPicks.amber}
            participants={participants.filter((p) => p.team === 'amber')}
            currentParticipant={currentParticipant}
            onSelectHero={onSelectHero}
          />
          <CompletedTeamPanel
            team="sapphire"
            picks={teamPicks.sapphire}
            participants={participants.filter((p) => p.team === 'sapphire')}
            currentParticipant={currentParticipant}
            onSelectHero={onSelectHero}
          />
        </div>
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
        remainingPicksInTurn={remainingPicksInTurn}
      />

      {/* Mobile layout: stacked */}
      <div className="flex flex-col gap-4 lg:hidden">
        <div className="grid grid-cols-2 gap-2">
          <TeamDraftPanel
            team="amber"
            picks={teamPicks.amber}
            bans={teamBans.amber}
            maxPicks={maxPicksPerTeam}
            maxBans={teamBans.maxPerTeam}
            isCurrentTurn={session.currentTeam === 'amber'}
            phaseType={currentPhaseType}
          />
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

        {!isMyTurn && session.status === 'active' && (
          <div className="text-center text-deadlock-muted">
            Waiting for {session.currentTeam === 'amber' ? 'Team Amber' : 'Team Sapphire'} to{' '}
            {currentPhaseType}...
          </div>
        )}
      </div>

      {/* Desktop layout: 3 columns */}
      <div className="hidden lg:grid grid-cols-[1fr_2fr_1fr] gap-4 items-start">
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

// Component for showing team panel after draft is completed
interface CompletedTeamPanelProps {
  team: DraftTeam;
  picks: DraftPick[];
  participants: LobbyParticipant[];
  currentParticipant: LobbyParticipant | null;
  onSelectHero: (heroId: string) => Promise<void>;
}

function CompletedTeamPanel({
  team,
  picks,
  participants,
  currentParticipant,
  onSelectHero,
}: CompletedTeamPanelProps) {
  const teamName = team === 'amber' ? 'Team Amber' : 'Team Sapphire';
  const isMyTeam = currentParticipant?.team === team;

  const handleHeroClick = async (heroId: string) => {
    if (!isMyTeam) return;

    // Toggle selection - if already selected, select again to update (could be same hero)
    await onSelectHero(heroId);
  };

  return (
    <div
      className={`bg-deadlock-card rounded-xl p-4 border ${
        team === 'amber' ? 'border-amber/20' : 'border-sapphire/20'
      }`}
    >
      <h3
        className={`text-lg font-bold mb-4 text-center ${
          team === 'amber' ? 'text-amber' : 'text-sapphire'
        }`}
      >
        {teamName}
      </h3>

      {/* Picked Heroes */}
      <div className="mb-4">
        <div className="text-xs text-deadlock-muted mb-2 uppercase tracking-wide">
          {isMyTeam ? 'Click to select your hero' : 'Heroes'}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {picks.map((pick) => (
            <button
              key={pick.id}
              onClick={() => handleHeroClick(pick.heroId)}
              disabled={!isMyTeam}
              className={`relative rounded-lg overflow-hidden transition-all ${
                isMyTeam ? 'hover:scale-105 cursor-pointer hover:ring-2 hover:ring-white' : 'cursor-default'
              }`}
              title={isMyTeam ? `Select ${formatHeroName(pick.heroId)}` : formatHeroName(pick.heroId)}
            >
              <img
                src={`/assets/heroes/${pick.heroId}.png`}
                alt={formatHeroName(pick.heroId)}
                className="w-full aspect-square object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/heroes/placeholder.png';
                }}
              />
              <div
                className={`absolute bottom-0 left-0 right-0 h-1 ${
                  team === 'amber' ? 'bg-amber' : 'bg-sapphire'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Team Roster */}
      <div>
        <div className="text-xs text-deadlock-muted mb-2 uppercase tracking-wide">Players</div>
        <div className="space-y-2">
          {participants.map((participant) => {
            const displayName = participant.user?.displayName || participant.anonymousName || 'Unknown';
            const selectedHero = participant.selectedHeroId;

            return (
              <div
                key={participant.id}
                className="flex items-center gap-2 p-2 bg-deadlock-bg rounded-lg"
              >
                {/* Selected Hero Icon */}
                {selectedHero ? (
                  <img
                    src={`/assets/heroes/${selectedHero}.png`}
                    alt={formatHeroName(selectedHero)}
                    className="w-8 h-8 rounded object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/assets/heroes/placeholder.png';
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-deadlock-border flex items-center justify-center text-deadlock-muted text-xs">
                    ?
                  </div>
                )}

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate text-sm">{displayName}</span>
                    {participant.id === currentParticipant?.id && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                        You
                      </span>
                    )}
                    {participant.isCaptain && (
                      <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                        Captain
                      </span>
                    )}
                  </div>
                  {selectedHero && (
                    <div className="text-xs text-deadlock-muted capitalize">
                      {formatHeroName(selectedHero)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatHeroName(heroId: string): string {
  return heroId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
