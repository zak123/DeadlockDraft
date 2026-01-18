import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { getCookie } from 'hono/cookie';
import { lobbyManager } from '../services/lobby-manager';
import { wsManager } from '../services/websocket';
import { requireAuth, optionalAuth, getAuthUser, type AuthVariables } from '../middleware/auth';
import type {
  CreateLobbyRequest,
  CreateLobbyResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  UpdateLobbyRequest,
  MoveToTeamRequest,
  Team,
} from '@deadlock-draft/shared';

const lobbies = new Hono<{ Variables: AuthVariables }>();

// Validation schemas
const createLobbySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  matchConfig: z
    .object({
      gameMode: z.string().optional(),
      mapName: z.string().optional(),
      teamSize: z.number().min(1).max(6).optional(),
      allowSpectators: z.boolean().optional(),
      maxRounds: z.number().min(1).optional(),
      roundTime: z.number().min(60).optional(),
    })
    .optional(),
  maxPlayers: z.number().min(2).max(24).optional(),
  isPublic: z.boolean().optional(),
});

const joinLobbySchema = z.object({
  anonymousName: z.string().min(1).max(50).optional(),
});

const updateLobbySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  matchConfig: z
    .object({
      gameMode: z.string().optional(),
      mapName: z.string().optional(),
      teamSize: z.number().min(1).max(6).optional(),
      allowSpectators: z.boolean().optional(),
      maxRounds: z.number().min(1).optional(),
      roundTime: z.number().min(60).optional(),
    })
    .optional(),
  maxPlayers: z.number().min(2).max(24).optional(),
  allowTeamChange: z.boolean().optional(),
});

const moveToTeamSchema = z.object({
  team: z.enum(['amber', 'sapphire', 'spectator', 'unassigned']),
});

const setCaptainSchema = z.object({
  isCaptain: z.boolean(),
});

// Get public lobbies
lobbies.get('/public', async (c) => {
  const publicLobbies = await lobbyManager.getPublicLobbies();
  return c.json({ lobbies: publicLobbies });
});

// Create lobby (requires auth)
lobbies.post('/', requireAuth, async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json<CreateLobbyRequest>();
  const validated = createLobbySchema.parse(body);

  const lobby = await lobbyManager.createLobby(
    user,
    validated.name,
    validated.matchConfig,
    validated.maxPlayers,
    validated.isPublic
  );

  return c.json<CreateLobbyResponse>({ lobby }, 201);
});

// Get lobby by code (public)
lobbies.get('/:code', async (c) => {
  const code = c.req.param('code');
  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  return c.json({ lobby });
});

// Join lobby (optional auth)
lobbies.post('/:code/join', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const body = await c.req.json<JoinLobbyRequest>().catch(() => ({}));
  const validated = joinLobbySchema.parse(body);

  if (!user && !validated.anonymousName) {
    throw new HTTPException(400, {
      message: 'Anonymous name required for non-authenticated users',
    });
  }

  try {
    const result = await lobbyManager.joinLobby(code, user || undefined, validated.anonymousName);

    if (!result) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast to other participants
    await wsManager.broadcastLobbyUpdate(code);

    const response: JoinLobbyResponse = {
      lobby: result.lobby,
      participant: result.participant,
      sessionToken: result.sessionToken,
    };

    return c.json(response);
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Leave lobby
lobbies.post('/:code/leave', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('x-session-token');

  try {
    const lobby = await lobbyManager.leaveLobby(
      code,
      user?.id,
      sessionToken || undefined
    );

    if (!lobby) {
      throw new HTTPException(404, { message: 'Lobby or participant not found' });
    }

    // Broadcast to other participants
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Change own team (when allowTeamChange is enabled)
lobbies.post('/:code/change-team', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('x-session-token');
  const body = await c.req.json<{ team: string }>();
  const validated = moveToTeamSchema.parse(body);

  try {
    const lobby = await lobbyManager.changeSelfTeam(
      code,
      validated.team as 'amber' | 'sapphire' | 'spectator' | 'unassigned',
      user?.id,
      sessionToken || undefined
    );

    if (!lobby) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast update
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({ lobby });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Update lobby settings (host only)
lobbies.patch('/:code', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);
  const body = await c.req.json<UpdateLobbyRequest>();
  const validated = updateLobbySchema.parse(body);

  try {
    const lobby = await lobbyManager.updateLobby(code, user.id, validated);

    if (!lobby) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast update to all participants
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({ lobby });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Cancel lobby (host only)
lobbies.delete('/:code', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  try {
    await lobbyManager.cancelLobby(code, user.id);

    // Broadcast cancellation
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Move participant to team (host only)
lobbies.patch('/:code/participants/:participantId/team', requireAuth, async (c) => {
  const code = c.req.param('code');
  const participantId = c.req.param('participantId');
  const user = getAuthUser(c);
  const body = await c.req.json<MoveToTeamRequest>();
  const validated = moveToTeamSchema.parse(body);

  try {
    const lobby = await lobbyManager.moveParticipantToTeam(
      code,
      user.id,
      participantId,
      validated.team as Team
    );

    if (!lobby) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast update
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({ lobby });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Set participant captain status (host only)
lobbies.patch('/:code/participants/:participantId/captain', requireAuth, async (c) => {
  const code = c.req.param('code');
  const participantId = c.req.param('participantId');
  const user = getAuthUser(c);
  const body = await c.req.json();
  const validated = setCaptainSchema.parse(body);

  try {
    const lobby = await lobbyManager.setParticipantCaptain(
      code,
      user.id,
      participantId,
      validated.isCaptain
    );

    if (!lobby) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast update
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({ lobby });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

export { lobbies };
