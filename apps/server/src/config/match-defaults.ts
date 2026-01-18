import type { MatchConfig } from '@deadlock-draft/shared';

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  gameMode: 'custom',
  mapName: 'default',
  teamSize: 6,
  allowSpectators: true,
  maxRounds: 1,
  roundTime: 3600,
};

export const LOBBY_CODE_LENGTH = 6;
export const DEFAULT_MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 2;
