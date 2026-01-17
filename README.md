# Deadlock Draft

A custom match coordinator for [Deadlock](https://store.steampowered.com/app/1422450/Deadlock/) - Valve's team-based shooter. Create lobbies, organize teams, and start custom matches with friends.

**Live at: [deadlockdraft.com](https://deadlockdraft.com)**

## Features

- **Steam Authentication** - Sign in with your Steam account to create and host lobbies
- **Lobby System** - Create lobbies with shareable 6-character codes
- **Team Management** - Assign players to Amber or Sapphire teams, or as spectators
- **Real-time Updates** - WebSocket-powered live updates for all lobby participants
- **Anonymous Joining** - Players can join lobbies without Steam accounts using a display name
- **Match Creation** - Generate Deadlock party codes to start custom matches

## Tech Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS
- **Backend**: Bun, Hono, Drizzle ORM
- **Database**: SQLite
- **Auth**: Steam OpenID
- **Deployment**: PM2, Nginx, GitHub Actions CI/CD

## Project Structure

```
deadlock-draft/
├── apps/
│   ├── server/          # Backend API (Hono + Bun)
│   └── web/             # Frontend (React + Vite)
├── packages/
│   └── shared/          # Shared TypeScript types
├── deploy/
│   ├── nginx/           # Nginx configurations
│   └── scripts/         # Deployment scripts
└── .github/
    └── workflows/       # CI/CD pipelines
```

## Local Development

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Steam API Key](https://steamcommunity.com/dev/apikey)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/zak123/DeadlockDraft.git
   cd DeadlockDraft
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your values:
   ```env
   NODE_ENV=development
   PORT=3000
   APP_URL=http://localhost:3000
   FRONTEND_URL=http://localhost:5173
   DATABASE_URL=./data/deadlock-draft.db
   STEAM_API_KEY=your_steam_api_key
   DEADLOCK_API_KEY=
   SESSION_SECRET=your_32_character_secret_here
   LOBBY_EXPIRY_HOURS=2
   ```

4. **Setup database**
   ```bash
   bun run db:generate
   bun run db:migrate
   ```

5. **Start development servers**
   ```bash
   bun run dev
   ```

   This starts:
   - Backend: http://localhost:3000
   - Frontend: http://localhost:5173

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start all services in development mode |
| `bun run dev:server` | Start only the backend |
| `bun run dev:web` | Start only the frontend |
| `bun run build` | Build all packages |
| `bun run build:web` | Build frontend for production |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run db:generate` | Generate Drizzle schema |
| `bun run db:migrate` | Run database migrations |

## Deployment

### Server Requirements

- Ubuntu 22.04+ (or similar Linux)
- 1GB RAM minimum
- Nginx
- Bun
- Node.js (for PM2)
- PM2

### Initial VPS Setup

1. **Run the setup script**
   ```bash
   bash deploy/scripts/setup-server.sh
   ```

2. **Clone the repository**
   ```bash
   cd /var/www/deadlock-draft
   git clone https://github.com/zak123/DeadlockDraft.git .
   ```

3. **Configure production environment**
   ```bash
   cat > .env << 'EOF'
   NODE_ENV=production
   PORT=3000
   APP_URL=https://yourdomain.com
   FRONTEND_URL=https://yourdomain.com
   DATABASE_URL=./data/deadlock-draft.db
   STEAM_API_KEY=your_steam_api_key
   DEADLOCK_API_KEY=
   SESSION_SECRET=your_32_character_secret_here
   LOBBY_EXPIRY_HOURS=2
   EOF

   cp .env apps/server/.env
   ```

4. **Build and start**
   ```bash
   bun install
   bun run db:generate
   bun run db:migrate
   bun run build:web
   pm2 start pm2.config.cjs
   pm2 save
   pm2 startup
   ```

5. **Configure Nginx**
   ```bash
   sudo cp deploy/nginx/deadlock-draft-ip.conf /etc/nginx/sites-available/deadlock-draft
   sudo ln -s /etc/nginx/sites-available/deadlock-draft /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **Add SSL (optional, requires domain)**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

### GitHub Actions CI/CD

The repository includes automated deployment workflows:

- **CI** (`ci.yml`) - Runs on all PRs: builds and typechecks
- **Deploy Staging** (`deploy-staging.yml`) - Deploys PR branch for testing
- **Deploy Production** (`deploy-production.yml`) - Deploys to production on merge to main

#### Required Secrets

Configure these in GitHub repository settings (Settings > Secrets > Actions):

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | Server IP address |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private SSH key (ed25519) |
| `VPS_PORT` | SSH port (default: 22) |

### Manual Deployment

```bash
ssh user@your-server
cd /var/www/deadlock-draft
bash deploy/scripts/deploy.sh
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/steam` | Initiate Steam login |
| GET | `/api/auth/steam/callback` | Steam OAuth callback |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Lobbies

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/lobbies` | Create a lobby |
| GET | `/api/lobbies/:code` | Get lobby details |
| POST | `/api/lobbies/:code/join` | Join a lobby |
| POST | `/api/lobbies/:code/leave` | Leave a lobby |
| POST | `/api/lobbies/:code/move` | Move player to team |
| POST | `/api/lobbies/:code/ready` | Set ready status |
| POST | `/api/lobbies/:code/match` | Create Deadlock match |
| DELETE | `/api/lobbies/:code` | Cancel lobby (host only) |

### WebSocket

Connect to `/ws` for real-time lobby updates. See `packages/shared/src/index.ts` for message types.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `APP_URL` | Backend URL | `http://localhost:3000` |
| `FRONTEND_URL` | Frontend URL | `http://localhost:5173` |
| `DATABASE_URL` | SQLite database path | `./data/deadlock-draft.db` |
| `STEAM_API_KEY` | Steam Web API key | Required |
| `DEADLOCK_API_KEY` | Deadlock API key | Optional |
| `SESSION_SECRET` | Session encryption key (32+ chars) | Required |
| `LOBBY_EXPIRY_HOURS` | Hours until lobby expires | `2` |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
