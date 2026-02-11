import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { lobbyManager } from '../services/lobby-manager';
import { getConfig } from '../config/env';
import { rateLimit } from '../middleware/rate-limit';
import type { CreateApiLobbyResponse } from '@deadlock-draft/shared';

const apiLobbies = new Hono();

// Stricter rate limit for external API (separate key prefix to avoid sharing bucket with global limiter)
apiLobbies.use('*', rateLimit({
  windowMs: 60000,
  max: 10,
  keyGenerator: (c) => `ext:${c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'}`,
}));

const createApiLobbySchema = z.object({
  api_identifier: z.string().min(1).max(100),
  name: z.string().min(1).max(100).optional(),
  matchConfig: z
    .object({
      gameMode: z.enum(['standard', 'street_brawl']).optional(),
      mapName: z.string().optional(),
      teamSize: z.number().min(1).max(6).optional(),
      allowSpectators: z.boolean().optional(),
      maxRounds: z.number().min(1).optional(),
      roundTime: z.number().min(60).optional(),
      autoStart: z.boolean().optional(),
    })
    .optional(),
  maxPlayers: z.number().min(2).max(24).optional(),
  allowTeamChange: z.boolean().optional(),
});

apiLobbies.post('/lobbies', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const validated = createApiLobbySchema.parse(body);

  try {
    const lobby = await lobbyManager.createApiLobby(
      validated.api_identifier,
      validated.name,
      validated.matchConfig,
      validated.maxPlayers,
      validated.allowTeamChange
    );

    const config = getConfig();

    return c.json<CreateApiLobbyResponse>({
      url: `${config.FRONTEND_URL}/lobby/${lobby.code}`,
      code: lobby.code,
      lobby,
    }, 201);
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

export { apiLobbies };
