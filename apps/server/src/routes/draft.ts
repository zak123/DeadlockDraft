import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { draftManager } from '../services/draft-manager';
import { lobbyManager } from '../services/lobby-manager';
import { requireAuth, optionalAuth, getAuthUser, type AuthVariables } from '../middleware/auth';
import type {
  UpdateDraftConfigRequest,
  StartDraftResponse,
  MakeDraftPickRequest,
  MakeDraftPickResponse,
  GetDraftStateResponse,
  GetHeroesResponse,
} from '@deadlock-draft/shared';

const draft = new Hono<{ Variables: AuthVariables }>();

// Validation schemas
const updateDraftConfigSchema = z.object({
  skipBans: z.boolean().optional(),
  phases: z
    .array(
      z.object({
        type: z.enum(['pick', 'ban']),
        picks: z.array(z.enum(['amber', 'sapphire'])),
      })
    )
    .optional(),
  timePerPick: z.number().min(10).max(120).optional(),
  timePerBan: z.number().min(10).max(120).optional(),
  allowSinglePlayer: z.boolean().optional(),
});

const makeDraftPickSchema = z.object({
  heroId: z.string().min(1),
});

// Get available heroes
draft.get('/heroes', async (c) => {
  const heroes = draftManager.getHeroes();
  return c.json<GetHeroesResponse>({ heroes });
});

// Get draft configuration for a lobby
draft.get('/:code/draft/config', async (c) => {
  const code = c.req.param('code');
  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  const config = await draftManager.getOrCreateDraftConfig(lobby.id);
  return c.json({ config });
});

// Update draft configuration (host only)
draft.patch('/:code/draft/config', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);
  const body = await c.req.json<UpdateDraftConfigRequest>();
  const validated = updateDraftConfigSchema.parse(body);

  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  try {
    const config = await draftManager.updateDraftConfig(lobby.id, user.id, validated);
    return c.json({ config });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Start draft (host only)
draft.post('/:code/draft/start', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  try {
    const draftState = await draftManager.startDraft(code, user.id);
    return c.json<StartDraftResponse>({ draftState }, 201);
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Make a pick/ban
draft.post('/:code/draft/pick', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('x-session-token');
  const body = await c.req.json<MakeDraftPickRequest>();
  const validated = makeDraftPickSchema.parse(body);

  if (!user && !sessionToken) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  try {
    const draftState = await draftManager.makePick(
      code,
      validated.heroId,
      user?.id,
      sessionToken || undefined
    );

    return c.json<MakeDraftPickResponse>({
      pick: draftState.picks[draftState.picks.length - 1],
      draftState,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Get current draft state
draft.get('/:code/draft/state', async (c) => {
  const code = c.req.param('code');
  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  const draftState = await draftManager.getDraftState(lobby.id);
  return c.json<GetDraftStateResponse>({ draftState });
});

export { draft };
