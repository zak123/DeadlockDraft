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

# Run database migrations
echo "Running database migrations..."
bun run db:migrate

# Build frontend
echo "Building frontend..."
bun run build:web

# Restart backend with PM2
echo "Restarting backend..."
pm2 restart deadlock-draft-server || pm2 start pm2.config.cjs

echo ""
echo "=== Deployment Complete ==="
