import type {
  User,
  LobbyWithParticipants,
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  UpdateLobbyRequest,
  MoveToTeamRequest,
  Team,
  ApiError,
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

  getSteamLoginUrl(): string {
    return `${API_BASE}/auth/steam`;
  }

  // Lobbies
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
}

export const api = new ApiClient();
