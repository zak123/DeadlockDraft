-- Add Twitch fields to users table
ALTER TABLE users ADD COLUMN twitch_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN twitch_username TEXT;
ALTER TABLE users ADD COLUMN twitch_display_name TEXT;
ALTER TABLE users ADD COLUMN twitch_avatar TEXT;
ALTER TABLE users ADD COLUMN twitch_access_token TEXT;
ALTER TABLE users ADD COLUMN twitch_refresh_token TEXT;
ALTER TABLE users ADD COLUMN twitch_token_expires_at TEXT;

-- Add Twitch fields to lobbies table
ALTER TABLE lobbies ADD COLUMN is_twitch_lobby INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lobbies ADD COLUMN twitch_accepting_players INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lobbies ADD COLUMN twitch_stream_url TEXT;
ALTER TABLE lobbies ADD COLUMN draft_completed_at TEXT;

-- Create waitlist table
CREATE TABLE lobby_waitlist (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  joined_at TEXT NOT NULL
);

-- Create unique index for waitlist
CREATE UNIQUE INDEX lobby_waitlist_unique ON lobby_waitlist(lobby_id, user_id);

-- Create index for faster lobby lookups
CREATE INDEX lobby_waitlist_lobby_id_idx ON lobby_waitlist(lobby_id);
