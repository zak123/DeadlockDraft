import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { draftManager } from '../services/draft-manager';
import { lobbyManager } from '../services/lobby-manager';
import { wsManager } from '../services/websocket';
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
  timePerTurn: z.number().min(10).max(120).optional(),
  allowSinglePlayer: z.boolean().optional(),
  timerEnabled: z.boolean().optional(),
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

// Start draft (host only, or any participant for API lobbies)
draft.post('/:code/draft/start', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('x-session-token');

  try {
    const draftState = await draftManager.startDraft(code, user?.id, sessionToken || undefined);
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

// Cancel draft (host only)
draft.delete('/:code/draft', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  try {
    await draftManager.cancelDraft(code, user.id);
    return c.json({ success: true });
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

// Set party code manually (host only, for when API fails)
const setPartyCodeSchema = z.object({
  partyCode: z.string().min(1).max(20),
});

draft.post('/:code/draft/party-code', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);
  const body = await c.req.json();
  const validated = setPartyCodeSchema.parse(body);

  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can set the party code' });
  }

  if (lobby.status !== 'completed') {
    throw new HTTPException(400, { message: 'Draft must be completed to set party code' });
  }

  // Save the party code
  const updatedLobby = await lobbyManager.setPartyCode(code, validated.partyCode);

  if (!updatedLobby) {
    throw new HTTPException(500, { message: 'Failed to save party code' });
  }

  // Broadcast to all clients
  wsManager.broadcastToLobby(code, {
    type: 'draft:party-created',
    partyCode: validated.partyCode,
  });

  wsManager.broadcastSystemMessage(
    code,
    'Party code set! Click to reveal the code above, then enter it in Deadlock.'
  );

  return c.json({ success: true, partyCode: validated.partyCode });
});

// Reset lobby for play again (host only)
draft.post('/:code/reset', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can reset the lobby' });
  }

  if (lobby.status !== 'completed') {
    throw new HTTPException(400, { message: 'Can only reset a completed lobby' });
  }

  // Reset the lobby
  const updatedLobby = await lobbyManager.resetLobby(code);

  if (!updatedLobby) {
    throw new HTTPException(500, { message: 'Failed to reset lobby' });
  }

  // Clear the draft state on all clients
  wsManager.broadcastToLobby(code, {
    type: 'draft:cancelled',
  });

  // Broadcast the updated lobby to all clients
  wsManager.broadcastToLobby(code, {
    type: 'lobby:update',
    lobby: updatedLobby,
  });

  wsManager.broadcastSystemMessage(code, 'Lobby has been reset. Ready for another game!');

  return c.json({ success: true, lobby: updatedLobby });
});

export { draft };
