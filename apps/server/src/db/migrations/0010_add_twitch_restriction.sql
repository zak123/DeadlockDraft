-- Replace twitch_subs_only boolean with twitch_restriction enum
-- Values: 'none', 'followers', 'subscribers'
ALTER TABLE lobbies ADD COLUMN twitch_restriction TEXT NOT NULL DEFAULT 'none';

-- Migrate existing data: convert twitch_subs_only = 1 to 'subscribers'
UPDATE lobbies SET twitch_restriction = 'subscribers' WHERE twitch_subs_only = 1;
