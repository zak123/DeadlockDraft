-- Add api_identifier column for API-created lobbies
ALTER TABLE lobbies ADD COLUMN api_identifier TEXT;
