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
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  steamId: string;
  displayName: string;
  avatarMedium: string | null;
}

// Lobby types
export type LobbyStatus = 'waiting' | 'starting' | 'in_progress' | 'completed' | 'cancelled';
export type Team = 'amber' | 'sapphire' | 'spectator' | 'unassigned';

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
  joinedAt: string;
  user?: PublicUser | null;
}

export interface LobbyWithParticipants extends Lobby {
  participants: LobbyParticipant[];
  host: PublicUser;
}

// API Request/Response types
export interface CreateLobbyRequest {
  name: string;
  matchConfig?: Partial<MatchConfig>;
  maxPlayers?: number;
  isPublic?: boolean;
}

export interface GetPublicLobbiesResponse {
  lobbies: LobbyWithParticipants[];
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
}

export interface MoveToTeamRequest {
  team: Team;
}

export interface SetCaptainRequest {
  isCaptain: boolean;
}

export interface AuthResponse {
  user: User;
}

// WebSocket message types
export type WSClientMessage =
  | { type: 'lobby:join'; lobbyCode: string; sessionToken?: string }
  | { type: 'lobby:leave' }
  | { type: 'lobby:ready'; isReady: boolean }
  | { type: 'lobby:chat'; message: string }
  | { type: 'draft:pick'; heroId: string };

export type WSServerMessage =
  | { type: 'lobby:update'; lobby: LobbyWithParticipants }
  | { type: 'lobby:participant-joined'; participant: LobbyParticipant }
  | { type: 'lobby:participant-left'; participantId: string }
  | { type: 'lobby:participant-updated'; participant: LobbyParticipant }
  | { type: 'lobby:match-created'; partyCode: string }
  | { type: 'lobby:match-starting'; matchId: string }
  | { type: 'lobby:chat'; senderId: string; senderName: string; message: string; timestamp: string }
  | { type: 'error'; message: string }
  | { type: 'connected'; connectionId: string }
  | { type: 'draft:started'; draftState: DraftState }
  | { type: 'draft:turn'; session: DraftSession; timeRemaining: number }
  | { type: 'draft:pick'; pick: DraftPick; draftState: DraftState }
  | { type: 'draft:completed'; draftState: DraftState }
  | { type: 'draft:timeout'; autoPick: DraftPick; draftState: DraftState }
  | { type: 'draft:cancelled' };

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
