// Draft types

export type DraftTeam = 'amber' | 'sapphire';
export type DraftPhaseType = 'pick' | 'ban';
export type DraftSessionStatus = 'pending' | 'active' | 'completed';

export interface DraftPhase {
  type: DraftPhaseType;
  picks: DraftTeam[];
}

export interface DraftConfig {
  id: string;
  lobbyId: string;
  skipBans: boolean;
  phases: DraftPhase[];
  timePerTurn: number;
  allowSinglePlayer: boolean;
  timerEnabled: boolean;
}

export interface DraftSession {
  id: string;
  lobbyId: string;
  status: DraftSessionStatus;
  currentPhaseIndex: number;
  currentTeam: DraftTeam;
  currentPickIndex: number;
  startedAt: number;
  turnStartedAt: number;
}

export interface DraftPick {
  id: string;
  draftSessionId: string;
  heroId: string;
  team: DraftTeam | null;
  type: DraftPhaseType;
  pickOrder: number;
  pickedBy: string | null;
  pickedAt: number;
}

// Full draft state for client
export interface DraftState {
  session: DraftSession;
  config: DraftConfig;
  picks: DraftPick[];
  availableHeroes: string[];
  currentTurnTimeRemaining: number;
}

// API Request/Response types
export interface UpdateDraftConfigRequest {
  skipBans?: boolean;
  phases?: DraftPhase[];
  timePerTurn?: number;
  allowSinglePlayer?: boolean;
  timerEnabled?: boolean;
}

export interface StartDraftResponse {
  draftState: DraftState;
}

export interface MakeDraftPickRequest {
  heroId: string;
}

export interface MakeDraftPickResponse {
  pick: DraftPick;
  draftState: DraftState;
}

export interface GetDraftStateResponse {
  draftState: DraftState | null;
}

export interface GetHeroesResponse {
  heroes: string[];
}

// Default draft configuration
export const DEFAULT_DRAFT_PHASES: DraftPhase[] = [
  { type: 'ban', picks: ['amber', 'sapphire'] },
  { type: 'pick', picks: ['amber', 'sapphire', 'sapphire', 'amber'] },
  { type: 'pick', picks: ['amber', 'sapphire', 'sapphire', 'amber'] },
  { type: 'ban', picks: ['sapphire', 'amber'] },
  { type: 'pick', picks: ['sapphire', 'amber', 'amber', 'sapphire'] },
];

export const DEFAULT_TIME_PER_TURN = 60;

// WebSocket message types for draft
export type WSDraftClientMessage =
  | { type: 'draft:pick'; heroId: string };

export type WSDraftServerMessage =
  | { type: 'draft:started'; draftState: DraftState }
  | { type: 'draft:turn'; session: DraftSession; timeRemaining: number }
  | { type: 'draft:pick'; pick: DraftPick; draftState: DraftState }
  | { type: 'draft:completed'; draftState: DraftState }
  | { type: 'draft:timeout'; autoPick: DraftPick; draftState: DraftState };
