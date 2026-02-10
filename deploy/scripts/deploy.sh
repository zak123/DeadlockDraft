#!/bin/bash
set -e

echo "=== Deploying Deadlock Draft ==="

# Navigate to project directory
cd /var/www/deadlock-draft

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
bun install

# Apply manual SQL migrations before drizzle-kit push (for SQLite compatibility)
echo "Applying SQL migrations..."
cd apps/server

# Load .env so DATABASE_URL matches what drizzle-kit uses
set -a
source .env 2>/dev/null || true
set +a

bun -e "
import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
const dbPath = process.env.DATABASE_URL || './data/deadlock-draft.db';
console.log('  Using database:', dbPath);
const db = new Database(dbPath);
// Check if migration already applied (api_identifier column exists)
try {
  db.prepare('SELECT api_identifier FROM lobbies LIMIT 0').run();
  console.log('  Migration 0012 already applied');
} catch(e) {
  console.log('  Applying migration 0012_add_api_lobbies...');
  const sql = readFileSync('src/db/migrations/0012_add_api_lobbies.sql', 'utf-8');
  db.exec(sql);
  console.log('  Migration 0012 applied successfully');
}
db.close();
"

# Sync database schema
echo "Syncing database schema..."
bunx drizzle-kit push --force
cd ../..

# Build frontend
echo "Building frontend..."
bun run build:web

# Restart backend with PM2
echo "Restarting backend..."
pm2 restart deadlock-draft-server || pm2 start pm2.config.cjs

echo ""
echo "=== Deployment Complete ==="
