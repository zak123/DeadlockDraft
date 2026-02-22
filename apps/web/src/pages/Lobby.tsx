import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLobby } from "../hooks/useLobby";
import { useDraft } from "../hooks/useDraft";
import { useChat } from "../hooks/useChat";
import { useWaitlist } from "../hooks/useWaitlist";
import { api } from "../services/api";
import { LobbyView } from "../components/lobby/LobbyView";
import { LobbyChat } from "../components/lobby/LobbyChat";
import { WaitlistPanel } from "../components/lobby/WaitlistPanel";
import { DraftView } from "../components/draft";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Modal } from "../components/common/Modal";
import { SteamLoginButton } from "../components/auth/SteamLoginButton";

export function Lobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Check if user came from "Join Queue" button (should join waitlist, not directly)
  const shouldJoinWaitlist = searchParams.get("waitlist") === "true";
  // Check for secret invite code (allows skipping waitlist on Twitch lobbies)
  const inviteCode = searchParams.get("invite");
  const {
    lobby,
    loading,
    error,
    setReady,
    moveToTeam,
    setCaptain,
    kickParticipant,
    changeSelfTeam,
    updateLobbySettings,
    setGameMode,
    readyMatch,
    refresh,
  } = useLobby(code || null);
  const {
    draftState,
    draftConfig,
    heroes,
    partyCode,
    updateConfig,
    startDraft,
    makePick,
    cancelDraft,
  } = useDraft(code || null);
  const { messages: chatMessages, sendMessage: sendChatMessage } = useChat();

  // Waitlist for Twitch lobbies
  const {
    waitlist,
    totalCount: waitlistCount,
    joinWaitlist,
    leaveWaitlist,
    promoteUser,
    fillFromWaitlist,
    isInWaitlist,
  } = useWaitlist(
    code || null,
    lobby?.id || null,
    lobby?.isTwitchLobby || false
  );

  const [togglingAccepting, setTogglingAccepting] = useState(false);
  const [showWaitlistLinkCopied, setShowWaitlistLinkCopied] = useState(false);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [anonymousName, setAnonymousName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinedParticipantId, setJoinedParticipantId] = useState<string | null>(
    () => {
      // Check if we have a stored participant ID for this lobby
      const stored = localStorage.getItem(`lobby_participant_${code}`);
      return stored || null;
    }
  );

  // Check if user is in the lobby
  const isInLobby = lobby?.participants.some(
    (p) =>
      (user && p.userId === user.id) ||
      (joinedParticipantId && p.id === joinedParticipantId)
  );

  // Get current participant
  const currentParticipant = useMemo(() => {
    if (!lobby) return null;
    const sessionToken = localStorage.getItem("anonymousSessionToken");
    return (
      lobby.participants.find(
        (p) =>
          (user && p.userId === user.id) ||
          (sessionToken && p.sessionToken === sessionToken)
      ) || null
    );
  }, [lobby, user]);

  // Check if draft is active
  const isDraftActive =
    draftState?.session.status === "active" ||
    draftState?.session.status === "completed";

  // Check if current user is host
  const isHost = Boolean(user && lobby && lobby.hostUserId === user.id);

  // Twitch lobby state
  const isTwitchLobby = lobby?.isTwitchLobby || false;
  const isAcceptingPlayers = lobby?.twitchAcceptingPlayers || false;
  const userIsInWaitlist = user ? isInWaitlist(user.id) : false;

  // Toggle accepting players (host only)
  const handleToggleAccepting = async () => {
    if (!lobby || !isHost) return;
    setTogglingAccepting(true);
    try {
      await api.toggleAcceptingPlayers(code!, !isAcceptingPlayers);
      await refresh();
    } catch (err) {
      console.error("Failed to toggle accepting players:", err);
    } finally {
      setTogglingAccepting(false);
    }
  };

  // Copy waitlist link for viewers
  const handleCopyWaitlistLink = () => {
    const waitlistUrl = `${window.location.origin}/lobby/${code}?waitlist=true`;
    navigator.clipboard.writeText(waitlistUrl);
    setShowWaitlistLinkCopied(true);
    setTimeout(() => setShowWaitlistLinkCopied(false), 2000);
  };

  // Handle joining waitlist
  const handleJoinWaitlist = async () => {
    try {
      await joinWaitlist();
    } catch (err) {
      console.error("Failed to join waitlist:", err);
    }
  };

  // Handle leaving waitlist
  const handleLeaveWaitlist = async () => {
    try {
      await leaveWaitlist();
    } catch (err) {
      console.error("Failed to leave waitlist:", err);
    }
  };

  // Auto-join logic:
  // - Regular lobbies: auto-join for authenticated users, show modal for guests
  // - Twitch lobbies: require invite link (?invite=CODE) to auto-join, otherwise show waitlist UI
  useEffect(() => {
    if (!loading && !authLoading && lobby && !isInLobby && !userIsInWaitlist) {
      if (user) {
        // Twitch lobby with invite code - join directly via invite
        if (isTwitchLobby && inviteCode) {
          api
            .joinByInviteCode(inviteCode)
            .then((result) => {
              setJoinedParticipantId(result.participant.id);
              localStorage.setItem(
                `lobby_participant_${code}`,
                result.participant.id
              );
              // Clear the invite param after joining
              setSearchParams({});
              return refresh();
            })
            .catch((err) => {
              console.error("Failed to join via invite code:", err);
              // Invalid invite code - they can use the waitlist instead
            });
          return;
        }

        // Twitch lobby with waitlist param - join waitlist
        if (isTwitchLobby && shouldJoinWaitlist) {
          joinWaitlist()
            .then(() => {
              setSearchParams({});
            })
            .catch((err) => {
              console.error("Failed to join waitlist:", err);
            });
          return;
        }

        // Twitch lobby without invite or waitlist param - don't auto-join
        // User will see the waitlist UI
        if (isTwitchLobby) {
          return;
        }

        // Regular lobby - auto-join for authenticated users
        api
          .joinLobby(code!)
          .then((result) => {
            setJoinedParticipantId(result.participant.id);
            localStorage.setItem(
              `lobby_participant_${code}`,
              result.participant.id
            );
            return refresh();
          })
          .catch((err) => {
            console.error("Failed to auto-join:", err);
            setShowJoinModal(true);
          });
      } else if (!isTwitchLobby) {
        // Show join modal for guests (non-Twitch lobbies only)
        // Twitch lobbies require Steam auth to join waitlist
        setShowJoinModal(true);
      }
    }
  }, [
    loading,
    authLoading,
    lobby,
    isInLobby,
    isTwitchLobby,
    user,
    code,
    inviteCode,
    refresh,
    shouldJoinWaitlist,
    userIsInWaitlist,
    joinWaitlist,
    setSearchParams,
  ]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user && !anonymousName.trim()) {
      setJoinError("Please enter a name");
      return;
    }

    setJoining(true);
    setJoinError("");

    try {
      const result = await api.joinLobby(
        code!,
        user ? undefined : { anonymousName: anonymousName.trim() }
      );
      // Store participant ID to track membership
      setJoinedParticipantId(result.participant.id);
      localStorage.setItem(`lobby_participant_${code}`, result.participant.id);
      setShowJoinModal(false);
      // Refresh lobby to show updated participants
      await refresh();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to join lobby");
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveLobby = async () => {
    try {
      await api.leaveLobby(code!);
      localStorage.removeItem(`lobby_participant_${code}`);
      navigate("/");
    } catch (err) {
      console.error("Failed to leave lobby:", err);
    }
  };

  const handleCancelLobby = async () => {
    if (!confirm("Are you sure you want to cancel this lobby?")) return;

    try {
      await api.cancelLobby(code!);
      navigate("/");
    } catch (err) {
      console.error("Failed to cancel lobby:", err);
    }
  };

  const handleSetPartyCode = async (partyCode: string) => {
    await api.setPartyCode(code!, partyCode);
  };

  const handlePlayAgain = async () => {
    await api.resetLobby(code!);
  };

  const handleSelectHero = async (heroId: string) => {
    await api.selectHero(code!, heroId);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber"></div>
      </div>
    );
  }

  if (error || !lobby) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Lobby Not Found</h2>
          <p className="text-deadlock-muted mb-4">
            {error ||
              "The lobby you are looking for does not exist or has expired."}
          </p>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  if (lobby.status === "cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Lobby Cancelled</h2>
          <p className="text-deadlock-muted mb-4">
            This lobby has been cancelled by the host.
          </p>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-deadlock-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-xl font-bold hover:text-amber transition-colors"
          >
            Deadlock Draft
          </button>
          {user && (
            <div className="flex items-center gap-2">
              {user.avatarMedium && (
                <img
                  src={user.avatarMedium}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm font-medium">{user.displayName}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {isInLobby ? (
          isDraftActive && draftState ? (
            <div className="space-y-4">
              <DraftView
                draftState={draftState}
                heroes={heroes}
                currentParticipant={currentParticipant}
                participants={lobby.participants}
                onMakePick={makePick}
                onSelectHero={handleSelectHero}
                isHost={isHost}
                onCancelDraft={cancelDraft}
                onSetPartyCode={handleSetPartyCode}
                partyCode={partyCode || lobby.deadlockPartyCode}
                onPlayAgain={handlePlayAgain}
              />
              <LobbyChat
                currentUserId={user?.id}
                currentSessionToken={
                  localStorage.getItem("anonymousSessionToken") || undefined
                }
                messages={chatMessages}
                sendMessage={sendChatMessage}
                isDraftActive={true}
                currentTeam={currentParticipant?.team}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
              <div className="space-y-4">
                {/* Twitch controls for host */}
                {isTwitchLobby && isHost && (
                  <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">
                        {isAcceptingPlayers
                          ? "Queue is Open"
                          : "Queue is Closed"}
                      </div>
                      <div className="text-purple-200 text-sm">
                        {isAcceptingPlayers
                          ? "Viewers can join your waitlist"
                          : "Open the queue to let viewers join the waitlist"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 relative">
                      <Button
                        onClick={handleCopyWaitlistLink}
                        variant="secondary"
                        className="flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Waitlist Link
                      </Button>
                      <Button
                        onClick={handleToggleAccepting}
                        disabled={togglingAccepting}
                        className={
                          isAcceptingPlayers
                            ? "bg-red-600 hover:bg-red-500"
                            : "bg-purple-600 hover:bg-purple-500"
                        }
                      >
                        {togglingAccepting
                          ? "Updating..."
                          : isAcceptingPlayers
                          ? "Close Queue"
                          : "Open Queue"}
                      </Button>
                      {showWaitlistLinkCopied && (
                        <div className="absolute -bottom-8 right-0 px-2 py-1 bg-green-600 text-white text-xs rounded whitespace-nowrap">
                          Link copied to clipboard
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Twitch stream link for non-hosts */}
                {isTwitchLobby && !isHost && lobby.twitchStreamUrl && (
                  <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4">
                    <a
                      href={lobby.twitchStreamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="w-5 h-5"
                        fill="currentColor"
                      >
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                      </svg>
                      Watch{" "}
                      {lobby.host?.twitchDisplayName || lobby.host?.displayName}'s
                      Stream
                    </a>
                  </div>
                )}

                <LobbyView
                  lobby={lobby}
                  draftConfig={draftConfig}
                  onMoveToTeam={moveToTeam}
                  onSetCaptain={setCaptain}
                  onKickParticipant={kickParticipant}
                  onChangeSelfTeam={changeSelfTeam}
                  onSetReady={setReady}
                  onReadyMatch={readyMatch}
                  onLeaveLobby={handleLeaveLobby}
                  onCancelLobby={handleCancelLobby}
                  onUpdateLobbySettings={updateLobbySettings}
                  onSetGameMode={setGameMode}
                  onUpdateDraftConfig={updateConfig}
                  onStartDraft={startDraft}
                />
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
                <LobbyChat
                  currentUserId={user?.id}
                  currentSessionToken={
                    localStorage.getItem("anonymousSessionToken") || undefined
                  }
                  messages={chatMessages}
                  sendMessage={sendChatMessage}
                />
                {/* Waitlist panel for Twitch lobbies */}
                {isTwitchLobby && (
                  <WaitlistPanel
                    lobby={lobby}
                    waitlist={waitlist}
                    totalCount={waitlistCount}
                    isHost={isHost}
                    onPromote={promoteUser}
                    onFillRandom={fillFromWaitlist}
                  />
                )}
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="card p-8 text-center max-w-md">
              <h2 className="text-xl font-semibold mb-2">
                {isTwitchLobby ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="w-6 h-6 text-purple-400"
                      fill="currentColor"
                    >
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                    </svg>
                    {lobby.name}
                  </span>
                ) : (
                  `Join ${lobby.name}`
                )}
              </h2>
              <p className="text-deadlock-muted mb-4">
                {
                  lobby.participants.filter((p) => p.team !== "spectator")
                    .length
                }
                /{lobby.maxPlayers} players in lobby
                {isTwitchLobby && waitlistCount > 0 && (
                  <span className="block text-purple-400 mt-1">
                    {waitlistCount} in queue
                  </span>
                )}
              </p>

              {isTwitchLobby ? (
                // Twitch lobby join flow
                <div className="space-y-4">
                  {lobby.twitchStreamUrl && (
                    <a
                      href={lobby.twitchStreamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-purple-400 hover:text-purple-300 transition-colors mb-4"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                        fill="currentColor"
                      >
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                      </svg>
                      Watch Stream
                    </a>
                  )}

                  {!user ? (
                    <div className="space-y-3">
                      <p className="text-sm text-deadlock-muted">
                        Sign in with Steam to join the queue
                      </p>
                      <SteamLoginButton />
                    </div>
                  ) : !isAcceptingPlayers ? (
                    <p className="text-yellow-400">Queue is currently closed</p>
                  ) : userIsInWaitlist ? (
                    <div className="space-y-3">
                      <p className="text-green-400">You're in the queue!</p>
                      <Button variant="secondary" onClick={handleLeaveWaitlist}>
                        Leave Queue
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleJoinWaitlist}
                      className="bg-purple-600 hover:bg-purple-500"
                    >
                      Join Queue
                    </Button>
                  )}
                </div>
              ) : (
                // Regular lobby join
                <Button onClick={() => setShowJoinModal(true)}>
                  Join Lobby
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Join Modal */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => navigate("/")}
        title={`Join ${lobby.name}`}
      >
        <div className="space-y-4">
          <p className="text-deadlock-muted">
            {lobby.participants.length}/{lobby.maxPlayers} players already in
            lobby
          </p>

          {user ? (
            <form onSubmit={handleJoin} className="space-y-4">
              <p className="text-sm">
                Joining as <strong>{user.displayName}</strong>
              </p>
              {joinError && <p className="text-sm text-red-500">{joinError}</p>}
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={joining}>
                  {joining ? "Joining..." : "Join Lobby"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium">Sign in with Steam</p>
                <SteamLoginButton />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-deadlock-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-deadlock-card text-deadlock-muted">
                    or
                  </span>
                </div>
              </div>

              <form onSubmit={handleJoin} className="space-y-4">
                <Input
                  label="Join as Guest"
                  placeholder="Enter your name"
                  value={anonymousName}
                  onChange={(e) => setAnonymousName(e.target.value)}
                  maxLength={50}
                />
                {joinError && (
                  <p className="text-sm text-red-500">{joinError}</p>
                )}
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate("/")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={joining || !anonymousName.trim()}
                  >
                    {joining ? "Joining..." : "Join as Guest"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
