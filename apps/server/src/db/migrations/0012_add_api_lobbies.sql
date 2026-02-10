-- Add api_identifier column and make host_user_id nullable
-- SQLite doesn't support ALTER COLUMN, so we recreate the table

PRAGMA foreign_keys=OFF;

-- Add api_identifier first (so data copy works)
ALTER TABLE lobbies ADD COLUMN api_identifier TEXT;

-- Recreate lobbies table with host_user_id nullable
-- Note: no inline UNIQUE on code — use named index to match drizzle's expected schema
CREATE TABLE lobbies_new (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  host_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  deadlock_party_code TEXT,
  deadlock_lobby_id TEXT,
  deadlock_match_id TEXT,
  match_config TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 12,
  is_public INTEGER NOT NULL DEFAULT 0,
  allow_team_change INTEGER NOT NULL DEFAULT 0,
  is_twitch_lobby INTEGER NOT NULL DEFAULT 0,
  twitch_accepting_players INTEGER NOT NULL DEFAULT 0,
  twitch_stream_url TEXT,
  twitch_restriction TEXT NOT NULL DEFAULT 'none',
  api_identifier TEXT,
  invite_code TEXT,
  draft_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO lobbies_new SELECT
  id, code, name, host_user_id, status,
  deadlock_party_code, deadlock_lobby_id, deadlock_match_id,
  match_config, max_players, is_public, allow_team_change,
  is_twitch_lobby, twitch_accepting_players, twitch_stream_url,
  twitch_restriction, api_identifier, invite_code, draft_completed_at,
  created_at, updated_at, expires_at
FROM lobbies;

DROP TABLE lobbies;
ALTER TABLE lobbies_new RENAME TO lobbies;

-- Recreate indexes (named to match drizzle schema)
CREATE UNIQUE INDEX lobbies_code_unique ON lobbies(code);
CREATE INDEX lobbies_code_idx ON lobbies(code);
CREATE INDEX lobbies_status_idx ON lobbies(status);
CREATE INDEX lobbies_host_user_id_idx ON lobbies(host_user_id);
CREATE INDEX lobbies_twitch_lobby_idx ON lobbies(is_twitch_lobby);

PRAGMA foreign_keys=ON;
