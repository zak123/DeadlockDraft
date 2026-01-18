import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DraftConfig,
  UpdateDraftConfigRequest,
} from "@deadlock-draft/shared";

interface DraftConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DraftConfig | null;
  allowTeamChange: boolean;
  onSave: (
    updates: UpdateDraftConfigRequest
  ) => Promise<DraftConfig | undefined>;
  onUpdateLobbySettings: (settings: {
    allowTeamChange?: boolean;
  }) => Promise<void>;
}

export function DraftConfigModal({
  isOpen,
  onClose,
  config,
  allowTeamChange,
  onSave,
  onUpdateLobbySettings,
}: DraftConfigModalProps) {
  const [skipBans, setSkipBans] = useState(false);
  const [timePerTurn, setTimePerTurn] = useState(45);
  const [allowSinglePlayer, setAllowSinglePlayer] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (config) {
      isInitialLoad.current = true;
      setSkipBans(config.skipBans);
      setTimePerTurn(config.timePerTurn);
      setAllowSinglePlayer(config.allowSinglePlayer);
      setTimerEnabled(config.timerEnabled);
      // Allow a tick for state to settle before enabling auto-save
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 0);
    }
  }, [config]);

  const autoSave = useCallback(
    async (updates: UpdateDraftConfigRequest) => {
      try {
        await onSave(updates);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save settings"
        );
      }
    },
    [onSave]
  );

  // Auto-save when settings change (with debounce for number inputs)
  useEffect(() => {
    if (isInitialLoad.current || !isOpen) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(() => {
      autoSave({ skipBans, timePerTurn, allowSinglePlayer, timerEnabled });
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    skipBans,
    timePerTurn,
    allowSinglePlayer,
    timerEnabled,
    autoSave,
    isOpen,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-deadlock-card rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-bold mb-6">Draft Configuration</h2>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Skip Ban Phases</div>
              <div className="text-sm text-deadlock-muted">
                Go straight to picking heroes
              </div>
            </div>
            <button
              onClick={() => setSkipBans(!skipBans)}
              className={`w-14 h-8 rounded-full transition-colors ${
                skipBans ? "bg-amber" : "bg-deadlock-border"
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  skipBans ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Turn Timer</div>
              <div className="text-sm text-deadlock-muted">
                Auto-pick when time runs out
              </div>
            </div>
            <button
              onClick={() => setTimerEnabled(!timerEnabled)}
              className={`w-14 h-8 rounded-full transition-colors ${
                timerEnabled ? "bg-amber" : "bg-deadlock-border"
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  timerEnabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {timerEnabled && (
            <div>
              <label className="block font-medium mb-2">
                Time Per Turn (seconds)
              </label>
              <input
                type="number"
                min={10}
                max={120}
                value={timePerTurn}
                onChange={(e) => setTimePerTurn(Number(e.target.value))}
                className="w-full px-4 py-2 bg-deadlock-bg border border-deadlock-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Ignore Player Count</div>
              <div className="text-sm text-deadlock-muted">
                Allow draft to start with less than 6 players per team
              </div>
            </div>
            <button
              onClick={() => setAllowSinglePlayer(!allowSinglePlayer)}
              className={`w-14 h-8 rounded-full transition-colors ${
                allowSinglePlayer ? "bg-amber" : "bg-deadlock-border"
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  allowSinglePlayer ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Allow Team Changes</div>
              <div className="text-sm text-deadlock-muted">
                Let players change their own team
              </div>
            </div>
            <button
              onClick={() =>
                onUpdateLobbySettings({ allowTeamChange: !allowTeamChange })
              }
              className={`w-14 h-8 rounded-full transition-colors ${
                allowTeamChange ? "bg-amber" : "bg-deadlock-border"
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  allowTeamChange ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="bg-deadlock-bg rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Draft Order</div>
            <div className="text-xs text-deadlock-muted space-y-1">
              {skipBans ? (
                <>
                  <div>1. Pick: Amber → Sapphire → Sapphire → Amber</div>
                  <div>2. Pick: Amber → Sapphire → Sapphire → Amber</div>
                  <div>3. Pick: Sapphire → Amber → Amber → Sapphire</div>
                </>
              ) : (
                <>
                  <div>1. Ban: Amber → Sapphire</div>
                  <div>2. Pick: Amber → Sapphire → Sapphire → Amber</div>
                  <div>3. Pick: Amber → Sapphire → Sapphire → Amber</div>
                  <div>4. Ban: Sapphire → Amber</div>
                  <div>5. Pick: Sapphire → Amber → Amber → Sapphire</div>
                </>
              )}
            </div>
            <div className="text-xs text-deadlock-muted mt-2">
              Total: {skipBans ? "6 picks" : "2 bans, 6 picks"} per team
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-deadlock-border hover:bg-deadlock-muted/30 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
