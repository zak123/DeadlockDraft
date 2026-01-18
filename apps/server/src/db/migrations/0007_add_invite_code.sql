-- Add invite_code for Twitch lobbies (separate from URL code to prevent waitlist bypass)
ALTER TABLE lobbies ADD COLUMN invite_code TEXT;
CREATE UNIQUE INDEX lobbies_invite_code_idx ON lobbies(invite_code) WHERE invite_code IS NOT NULL;
