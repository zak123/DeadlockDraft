-- Add subscribers only field to lobbies for Twitch lobbies
ALTER TABLE lobbies ADD COLUMN twitch_subs_only INTEGER NOT NULL DEFAULT 0;
