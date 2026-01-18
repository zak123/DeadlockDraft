import type {
  User,
  LobbyWithParticipants,
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  UpdateLobbyRequest,
  MoveToTeamRequest,
  SetCaptainRequest,
  Team,
  ApiError,
  DraftConfig,
  DraftState,
  UpdateDraftConfigRequest,
  StartDraftResponse,
  MakeDraftPickResponse,
  GetDraftStateResponse,
  GetHeroesResponse,
  GetPublicLobbiesResponse,
} from '@deadlock-draft/shared';

const API_BASE = '/api';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const sessionToken = localStorage.getItem('anonymousSessionToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (sessionToken) {
      headers['X-Session-Token'] = sessionToken;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json() as Promise<T>;
  }

  // Auth
  async getMe(): Promise<User | null> {
    const result = await this.request<{ user: User | null }>('/auth/me');
    return result.user;
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
  }

  getSteamLoginUrl(returnTo?: string): string {
    const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    return `${API_BASE}/auth/steam${params}`;
  }

  // Lobbies
  async getPublicLobbies(): Promise<LobbyWithParticipants[]> {
    const result = await this.request<GetPublicLobbiesResponse>('/lobbies/public');
    return result.lobbies;
  }

  async createLobby(data: CreateLobbyRequest): Promise<LobbyWithParticipants> {
    const result = await this.request<CreateLobbyResponse>('/lobbies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result.lobby;
  }

  async getLobby(code: string): Promise<LobbyWithParticipants> {
    const result = await this.request<{ lobby: LobbyWithParticipants }>(`/lobbies/${code}`);
    return result.lobby;
  }

  async joinLobby(code: string, data?: JoinLobbyRequest): Promise<JoinLobbyResponse> {
    const result = await this.request<JoinLobbyResponse>(`/lobbies/${code}/join`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });

    // Store anonymous session token if provided
    if (result.sessionToken) {
      localStorage.setItem('anonymousSessionToken', result.sessionToken);
    }

    return result;
  }

  async leaveLobby(code: string): Promise<void> {
    await this.request(`/lobbies/${code}/leave`, { method: 'POST' });
    localStorage.removeItem('anonymousSessionToken');
  }

  async updateLobby(code: string, data: UpdateLobbyRequest): Promise<LobbyWithParticipants> {
    const result = await this.request<{ lobby: LobbyWithParticipants }>(`/lobbies/${code}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return result.lobby;
  }

  async cancelLobby(code: string): Promise<void> {
    await this.request(`/lobbies/${code}`, { method: 'DELETE' });
  }

  async moveToTeam(
    code: string,
    participantId: string,
    team: Team
  ): Promise<LobbyWithParticipants> {
    const result = await this.request<{ lobby: LobbyWithParticipants }>(
      `/lobbies/${code}/participants/${participantId}/team`,
      {
        method: 'PATCH',
        body: JSON.stringify({ team } as MoveToTeamRequest),
      }
    );
    return result.lobby;
  }

  async setCaptain(
    code: string,
    participantId: string,
    isCaptain: boolean
  ): Promise<LobbyWithParticipants> {
    const result = await this.request<{ lobby: LobbyWithParticipants }>(
      `/lobbies/${code}/participants/${participantId}/captain`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isCaptain } as SetCaptainRequest),
      }
    );
    return result.lobby;
  }

  // Matches
  async createMatch(code: string): Promise<{ partyCode: string; lobbyId: string }> {
    return this.request(`/lobbies/${code}/match/create`, { method: 'POST' });
  }

  async readyMatch(code: string): Promise<void> {
    await this.request(`/lobbies/${code}/match/ready`, { method: 'POST' });
  }

  async unreadyMatch(code: string): Promise<void> {
    await this.request(`/lobbies/${code}/match/unready`, { method: 'POST' });
  }

  async getMatchStatus(code: string): Promise<{
    status: string;
    partyCode: string | null;
    matchId: string | null;
  }> {
    return this.request(`/lobbies/${code}/match/status`);
  }

  // Draft
  async getHeroes(): Promise<string[]> {
    const result = await this.request<GetHeroesResponse>('/heroes');
    return result.heroes;
  }

  async getDraftConfig(code: string): Promise<DraftConfig> {
    const result = await this.request<{ config: DraftConfig }>(`/lobbies/${code}/draft/config`);
    return result.config;
  }

  async updateDraftConfig(code: string, data: UpdateDraftConfigRequest): Promise<DraftConfig> {
    const result = await this.request<{ config: DraftConfig }>(`/lobbies/${code}/draft/config`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return result.config;
  }

  async startDraft(code: string): Promise<DraftState> {
    const result = await this.request<StartDraftResponse>(`/lobbies/${code}/draft/start`, {
      method: 'POST',
    });
    return result.draftState;
  }

  async makeDraftPick(code: string, heroId: string): Promise<MakeDraftPickResponse> {
    return this.request<MakeDraftPickResponse>(`/lobbies/${code}/draft/pick`, {
      method: 'POST',
      body: JSON.stringify({ heroId }),
    });
  }

  async getDraftState(code: string): Promise<DraftState | null> {
    const result = await this.request<GetDraftStateResponse>(`/lobbies/${code}/draft/state`);
    return result.draftState;
  }

  async cancelDraft(code: string): Promise<void> {
    await this.request(`/lobbies/${code}/draft`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
