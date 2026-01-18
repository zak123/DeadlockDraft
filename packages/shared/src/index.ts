// Import draft types for use in this file
import type {
  DraftState,
  DraftSession,
  DraftPick,
} from './types/draft';

// Re-export draft types
export * from './types/draft';

// User types
export interface User {
  id: string;
  steamId: string;
  username: string;
  displayName: string;
  avatarSmall: string | null;
  avatarMedium: string | null;
  avatarLarge: string | null;
  profileUrl: string | null;
  // Twitch fields
  twitchId: string | null;
  twitchUsername: string | null;
  twitchDisplayName: string | null;
  twitchAvatar: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  steamId: string;
  displayName: string;
  avatarMedium: string | null;
  // Twitch fields for public display
  twitchId: string | null;
  twitchUsername: string | null;
  twitchDisplayName: string | null;
  twitchAvatar: string | null;
}

// Lobby types
export type LobbyStatus = 'waiting' | 'starting' | 'in_progress' | 'completed' | 'cancelled';
export type Team = 'amber' | 'sapphire' | 'spectator' | 'unassigned';
export type TwitchRestriction = 'none' | 'followers' | 'subscribers';

export interface MatchConfig {
  gameMode: string;
  mapName: string;
  teamSize: number;
  allowSpectators: boolean;
  maxRounds: number;
  roundTime: number;
}

export interface Lobby {
  id: string;
  code: string;
  name: string;
  hostUserId: string;
  status: LobbyStatus;
  deadlockPartyCode: string | null;
  deadlockLobbyId: string | null;
  deadlockMatchId: string | null;
  matchConfig: MatchConfig;
  maxPlayers: number;
  isPublic: boolean;
  allowTeamChange: boolean;
  // Twitch lobby fields
  isTwitchLobby: boolean;
  twitchAcceptingPlayers: boolean;
  twitchStreamUrl: string | null;
  twitchRestriction: TwitchRestriction;
  inviteCode: string | null; // Separate from URL code for Twitch lobbies
  draftCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface LobbyParticipant {
  id: string;
  lobbyId: string;
  userId: string | null;
  anonymousName: string | null;
  sessionToken: string | null;
  team: Team;
  isReady: boolean;
  isCaptain: boolean;
  selectedHeroId: string | null; // Hero the player wants to play after draft
  joinedAt: string;
  user?: PublicUser | null;
}

export interface LobbyWithParticipants extends Lobby {
  participants: LobbyParticipant[];
  host: PublicUser;
}

// Waitlist types
export interface WaitlistEntry {
  id: string;
  lobbyId: string;
  userId: string;
  position: number;
  joinedAt: string;
  user: PublicUser;
}

export interface TwitchLobbyWithWaitlist extends LobbyWithParticipants {
  waitlistCount: number;
  viewerCount: number; // Live viewer count from Twitch (0 if offline)
}

// API Request/Response types
export interface CreateLobbyRequest {
  name?: string;
  matchConfig?: Partial<MatchConfig>;
  maxPlayers?: number;
  isPublic?: boolean;
}

export interface GetPublicLobbiesResponse {
  lobbies: LobbyWithParticipants[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CreateLobbyResponse {
  lobby: LobbyWithParticipants;
}

export interface JoinLobbyRequest {
  anonymousName?: string;
}

export interface JoinLobbyResponse {
  lobby: LobbyWithParticipants;
  participant: LobbyParticipant;
  sessionToken?: string;
}

export interface UpdateLobbyRequest {
  name?: string;
  matchConfig?: Partial<MatchConfig>;
  maxPlayers?: number;
  allowTeamChange?: boolean;
}

export interface MoveToTeamRequest {
  team: Team;
}

export interface SetCaptainRequest {
  isCaptain: boolean;
}

// Twitch lobby types
export interface CreateTwitchLobbyRequest {
  matchConfig?: Partial<MatchConfig>;
  maxPlayers?: number;
  restriction?: TwitchRestriction;
}

export interface CreateTwitchLobbyResponse {
  lobby: LobbyWithParticipants;
}

export interface GetTwitchLobbiesResponse {
  lobbies: TwitchLobbyWithWaitlist[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ToggleAcceptingPlayersRequest {
  accepting: boolean;
}

export interface GetWaitlistResponse {
  waitlist: WaitlistEntry[];
  totalCount: number;
}

export interface PromoteFromWaitlistRequest {
  userId: string;
}

export interface FillFromWaitlistRequest {
  count: number;
}

export interface FillFromWaitlistResponse {
  promoted: LobbyParticipant[];
}

export interface SelectHeroRequest {
  heroId: string;
}

export interface AuthResponse {
  user: User;
}

// Chat channel type
export type ChatChannel = 'all' | 'team';

// WebSocket message types
export type WSClientMessage =
  | { type: 'lobby:join'; lobbyCode: string; sessionToken?: string }
  | { type: 'lobby:leave' }
  | { type: 'lobby:ready'; isReady: boolean }
  | { type: 'lobby:chat'; message: string; channel?: ChatChannel }
  | { type: 'draft:pick'; heroId: string };

export type WSServerMessage =
  | { type: 'lobby:update'; lobby: LobbyWithParticipants }
  | { type: 'lobby:participant-joined'; participant: LobbyParticipant }
  | { type: 'lobby:participant-left'; participantId: string }
  | { type: 'lobby:participant-updated'; participant: LobbyParticipant }
  | { type: 'lobby:match-created'; partyCode: string }
  | { type: 'lobby:match-starting'; matchId: string }
  | { type: 'lobby:chat'; senderId: string; senderName: string; senderTeam?: Team; message: string; timestamp: string; channel: ChatChannel; isSystem?: boolean }
  | { type: 'error'; message: string }
  | { type: 'connected'; connectionId: string }
  | { type: 'draft:started'; draftState: DraftState }
  | { type: 'draft:turn'; session: DraftSession; timeRemaining: number }
  | { type: 'draft:pick'; pick: DraftPick; draftState: DraftState }
  | { type: 'draft:completed'; draftState: DraftState }
  | { type: 'draft:timeout'; autoPick: DraftPick; draftState: DraftState }
  | { type: 'draft:cancelled' }
  | { type: 'draft:party-created'; partyCode: string }
  // Waitlist events
  | { type: 'waitlist:updated'; waitlist: WaitlistEntry[] }
  | { type: 'waitlist:joined'; entry: WaitlistEntry }
  | { type: 'waitlist:left'; userId: string }
  | { type: 'waitlist:promoted'; userId: string; participant: LobbyParticipant }
  // Hero selection events
  | { type: 'participant:hero-selected'; participantId: string; heroId: string | null };

// Deadlock API types
export interface DeadlockCreateMatchResponse {
  party_code: string;
  lobby_id: string;
}

export interface DeadlockMatchIdResponse {
  match_id: string | null;
  status: 'pending' | 'ready' | 'in_progress' | 'completed';
}

// API Error type
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
