import { getConfig } from '../config/env';
import type { DeadlockCreateMatchResponse, DeadlockMatchIdResponse, MatchConfig } from '@deadlock-draft/shared';

const DEADLOCK_API_URL = 'https://api.deadlock-api.com';

export class DeadlockApiClient {
  private config = getConfig();

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${DEADLOCK_API_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.DEADLOCK_API_KEY}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deadlock API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createCustomMatch(matchConfig: MatchConfig): Promise<DeadlockCreateMatchResponse> {
    return this.request<DeadlockCreateMatchResponse>('/v1/matches/custom/create', {
      method: 'POST',
      body: JSON.stringify({
        game_mode: matchConfig.gameMode,
        map_name: matchConfig.mapName,
        team_size: matchConfig.teamSize,
        allow_spectators: matchConfig.allowSpectators,
        max_rounds: matchConfig.maxRounds,
        round_time: matchConfig.roundTime,
      }),
    });
  }

  async readyMatch(lobbyId: string): Promise<void> {
    await this.request(`/v1/matches/custom/${lobbyId}/ready`, {
      method: 'POST',
    });
  }

  async unreadyMatch(lobbyId: string): Promise<void> {
    await this.request(`/v1/matches/custom/${lobbyId}/unready`, {
      method: 'POST',
    });
  }

  async getMatchId(partyId: string): Promise<DeadlockMatchIdResponse> {
    return this.request<DeadlockMatchIdResponse>(`/v1/matches/custom/${partyId}/match-id`, {
      method: 'GET',
    });
  }
}

export const deadlockApiClient = new DeadlockApiClient();
