-- Add selected_hero_id to lobby_participants for post-draft hero selection
ALTER TABLE lobby_participants ADD COLUMN selected_hero_id TEXT;
