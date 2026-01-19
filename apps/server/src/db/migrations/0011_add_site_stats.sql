-- Site stats table for efficient global counters
CREATE TABLE site_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  total_lobbies_created INTEGER NOT NULL DEFAULT 0
);

-- Initialize with current lobby count
INSERT INTO site_stats (id, total_lobbies_created)
SELECT 1, COUNT(*) FROM lobbies;
