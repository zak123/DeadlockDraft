import { getConfig } from '../config/env';
import type { DeadlockCreateMatchResponse, DeadlockMatchIdResponse, MatchConfig } from '@deadlock-draft/shared';

// Response from the party API
interface CreatePartyResult {
  success: boolean;
  bot_id: string;
  party_info?: {
    party_id: number;
    member_count: number;
    is_private_lobby: boolean;
    join_code: string | null;
    join_code_numeric: number | null;
    members: Array<{
      account_id: number;
      name: string;
      is_ready: boolean;
      player_type: number;
      team: number;
    }>;
  } | null;
  error?: string | null;
}

export class DeadlockApiClient {
  private config = getConfig();

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    usePartyApi = false
  ): Promise<T> {
    // Use party API URL for party endpoints, fallback to old API for match endpoints
    const baseUrl = usePartyApi
      ? this.config.DEADLOCK_API_URL
      : 'https://api.deadlock-api.com';

    if (usePartyApi && !this.config.DEADLOCK_API_URL) {
      throw new Error('DEADLOCK_API_URL is not configured');
    }

    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add auth header for old API
    if (!usePartyApi && this.config.DEADLOCK_API_KEY) {
      headers['Authorization'] = `Bearer ${this.config.DEADLOCK_API_KEY}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deadlock API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a party using the Deadlock Party API.
   * Returns the join code that players need to enter in-game.
   */
  async createParty(): Promise<{ joinCode: string; botId: string }> {
    const result = await this.request<CreatePartyResult>(
      '/party/create',
      { method: 'POST' },
      true
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to create party');
    }

    if (!result.party_info?.join_code) {
      throw new Error('Party created but no join code received');
    }

    return {
      joinCode: result.party_info.join_code,
      botId: result.bot_id,
    };
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
