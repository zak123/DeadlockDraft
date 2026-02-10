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
bun -e "
import { Database } from 'bun:sqlite';
const db = new Database(process.env.DATABASE_URL || './data/deadlock-draft.db');
try { db.run('ALTER TABLE lobbies ADD COLUMN api_identifier TEXT'); console.log('  Added api_identifier column'); } catch(e) { console.log('  api_identifier column already exists'); }
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
