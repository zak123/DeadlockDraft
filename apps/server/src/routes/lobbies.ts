import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { getCookie } from 'hono/cookie';
import { lobbyManager } from '../services/lobby-manager';
import { waitlistManager } from '../services/waitlist-manager';
import { wsManager } from '../services/websocket';
import { requireAuth, optionalAuth, getAuthUser, type AuthVariables } from '../middleware/auth';
import type {
  CreateLobbyRequest,
  CreateLobbyResponse,
  CreateTwitchLobbyRequest,
  CreateTwitchLobbyResponse,
  GetPublicLobbiesResponse,
  GetTwitchLobbiesResponse,
  GetWaitlistResponse,
  ToggleAcceptingPlayersRequest,
  PromoteFromWaitlistRequest,
  FillFromWaitlistRequest,
  FillFromWaitlistResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  UpdateLobbyRequest,
  MoveToTeamRequest,
  SelectHeroRequest,
  Team,
} from '@deadlock-draft/shared';

const lobbies = new Hono<{ Variables: AuthVariables }>();

// Validation schemas
const createLobbySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  matchConfig: z
    .object({
      gameMode: z.enum(['standard', 'street_brawl', 'custom']).optional(),
      mapName: z.string().optional(),
      teamSize: z.number().min(1).max(12).optional(),
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
      gameMode: z.enum(['standard', 'street_brawl', 'custom']).optional(),
      mapName: z.string().optional(),
      teamSize: z.number().min(1).max(12).optional(),
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

// Get lobby stats
lobbies.get('/stats', async (c) => {
  try {
    const [active, total] = await Promise.all([
      lobbyManager.getTotalActiveLobbyCount(),
      lobbyManager.getTotalLobbiesCreated(),
    ]);
    return c.json({ active, total });
  } catch (error) {
    console.error('Error fetching lobby stats:', error);
    return c.json({ active: 0, total: 0 });
  }
});

// Get public lobbies
lobbies.get('/public', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '5', 10);

  const result = await lobbyManager.getPublicLobbies(page, pageSize);

  return c.json<GetPublicLobbiesResponse>({
    lobbies: result.lobbies,
    totalCount: result.totalCount,
    page,
    pageSize,
  });
});

// Get Twitch lobbies (must be before /:code route)
lobbies.get('/twitch', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '5', 10);

  const result = await lobbyManager.getTwitchLobbies(page, pageSize);

  return c.json<GetTwitchLobbiesResponse>({
    lobbies: result.lobbies,
    totalCount: result.totalCount,
    page,
    pageSize,
  });
});

// Create Twitch lobby (must be before /:code route)
lobbies.post('/twitch', requireAuth, async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json<CreateTwitchLobbyRequest>().catch(() => ({}));

  const createTwitchLobbySchema = z.object({
    matchConfig: z
      .object({
        gameMode: z.enum(['standard', 'street_brawl', 'custom']).optional(),
        mapName: z.string().optional(),
        teamSize: z.number().min(1).max(12).optional(),
        allowSpectators: z.boolean().optional(),
        maxRounds: z.number().min(1).optional(),
        roundTime: z.number().min(60).optional(),
      })
      .optional(),
    maxPlayers: z.number().min(2).max(24).optional(),
    restriction: z.enum(['none', 'followers', 'subscribers']).optional(),
  });

  const validated = createTwitchLobbySchema.parse(body);

  try {
    const lobby = await lobbyManager.createTwitchLobby(
      user,
      validated.matchConfig,
      validated.maxPlayers,
      validated.restriction
    );

    return c.json<CreateTwitchLobbyResponse>({ lobby }, 201);
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Join Twitch lobby via invite code (bypasses waitlist)
lobbies.post('/twitch/join-invite', requireAuth, async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json<{ inviteCode: string }>();

  const joinInviteSchema = z.object({
    inviteCode: z.string().min(1).max(20),
  });

  const validated = joinInviteSchema.parse(body);

  try {
    const result = await lobbyManager.joinLobbyByInviteCode(validated.inviteCode, user);

    if (!result) {
      throw new HTTPException(404, { message: 'Invalid invite code' });
    }

    // Broadcast to other participants
    await wsManager.broadcastLobbyUpdate(result.lobby.code);

    return c.json<JoinLobbyResponse>({
      lobby: result.lobby,
      participant: result.participant,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
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
lobbies.get('/:code', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('X-Session-Token');

  const lobby = await lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  // For Twitch lobbies with a party code, verify the user is a participant
  // This prevents random users from seeing the party code
  if (lobby.isTwitchLobby && lobby.deadlockPartyCode) {
    const isParticipant = lobby.participants.some(p =>
      (user && p.userId === user.id) ||
      (sessionToken && p.sessionToken === sessionToken)
    );

    if (!isParticipant) {
      // Return lobby without the party code
      return c.json({
        lobby: {
          ...lobby,
          deadlockPartyCode: null,
        },
      });
    }
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

// Kick participant (host only)
lobbies.delete('/:code/participants/:participantId', requireAuth, async (c) => {
  const code = c.req.param('code');
  const participantId = c.req.param('participantId');
  const user = getAuthUser(c);

  try {
    const lobby = await lobbyManager.kickParticipant(code, user.id, participantId);

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

// ===============================
// Twitch Lobby Endpoints (with :code param)
// ===============================

const toggleAcceptingSchema = z.object({
  accepting: z.boolean(),
});

const promoteFromWaitlistSchema = z.object({
  userId: z.string(),
});

const fillFromWaitlistSchema = z.object({
  count: z.number().min(1).max(24),
});

// Toggle accepting players (host only)
lobbies.post('/:code/twitch/accepting', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);
  const body = await c.req.json<ToggleAcceptingPlayersRequest>();
  const validated = toggleAcceptingSchema.parse(body);

  try {
    const lobby = await lobbyManager.toggleAcceptingPlayers(
      code,
      user.id,
      validated.accepting
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

// ===============================
// Waitlist Endpoints
// ===============================

// Get waitlist for a lobby
lobbies.get('/:code/waitlist', async (c) => {
  const code = c.req.param('code');

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (!lobby.isTwitchLobby) {
    throw new HTTPException(400, { message: 'Not a Twitch lobby' });
  }

  const waitlist = await waitlistManager.getWaitlist(lobby.id);
  const totalCount = await waitlistManager.getWaitlistCount(lobby.id);

  return c.json<GetWaitlistResponse>({ waitlist, totalCount });
});

// Join waitlist (requires auth)
lobbies.post('/:code/waitlist/join', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (!lobby.isTwitchLobby) {
    throw new HTTPException(400, { message: 'Not a Twitch lobby' });
  }

  // Check restriction (followers or subscribers)
  if (lobby.twitchRestriction !== 'none') {
    // User must have Twitch linked
    if (!user.twitchId) {
      const restrictionText = lobby.twitchRestriction === 'subscribers' ? 'subscribers-only' : 'followers-only';
      throw new HTTPException(403, {
        message: `This lobby is ${restrictionText}. Please link your Twitch account first.`,
      });
    }

    // Get host to check relationship
    if (!lobby.host.twitchId) {
      throw new HTTPException(500, { message: 'Host Twitch account not found' });
    }

    const { twitchAuthService } = await import('../services/twitch-auth');
    const hostName = lobby.host.twitchDisplayName || lobby.host.twitchUsername;

    if (lobby.twitchRestriction === 'followers') {
      // Check if user follows the host
      const isFollowing = await twitchAuthService.isUserFollowing(
        user.twitchId,
        lobby.host.twitchId
      );

      if (!isFollowing) {
        throw new HTTPException(403, {
          message: `This lobby is followers-only. You must follow ${hostName} to join.`,
        });
      }
    } else if (lobby.twitchRestriction === 'subscribers') {
      // User must have access token for subscription check
      if (!user.twitchAccessToken) {
        throw new HTTPException(403, {
          message: 'This lobby is subscribers-only. Please link your Twitch account first.',
        });
      }

      // Get valid access token (refresh if needed)
      const accessToken = await twitchAuthService.getValidAccessToken(user);
      if (!accessToken) {
        throw new HTTPException(403, {
          message: 'Could not verify Twitch subscription. Please re-link your Twitch account.',
        });
      }

      // Check if user is subscribed to host
      const isSubscribed = await twitchAuthService.isUserSubscribed(
        accessToken,
        user.twitchId,
        lobby.host.twitchId
      );

      if (!isSubscribed) {
        throw new HTTPException(403, {
          message: `This lobby is subscribers-only. You must be subscribed to ${hostName} to join.`,
        });
      }
    }
  }

  const entry = await waitlistManager.joinWaitlist(lobby.id, user.id);
  if (!entry) {
    throw new HTTPException(400, {
      message: 'Could not join waitlist. Either the waitlist is full, you are already in it, or the lobby is not accepting players.',
    });
  }

  // Broadcast waitlist update
  await wsManager.broadcastWaitlistJoined(code, entry);

  return c.json({ entry }, 201);
});

// Leave waitlist
lobbies.post('/:code/waitlist/leave', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  const left = await waitlistManager.leaveWaitlist(lobby.id, user.id);
  if (!left) {
    throw new HTTPException(400, { message: 'Not in waitlist' });
  }

  // Broadcast waitlist update
  await wsManager.broadcastWaitlistLeft(code, user.id);

  return c.json({ success: true });
});

// Promote user from waitlist to lobby (host only)
lobbies.post('/:code/waitlist/promote', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);
  const body = await c.req.json<PromoteFromWaitlistRequest>();
  const validated = promoteFromWaitlistSchema.parse(body);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can promote from waitlist' });
  }

  const participant = await waitlistManager.promoteToLobby(lobby.id, validated.userId);
  if (!participant) {
    throw new HTTPException(400, { message: 'Could not promote user. Either they are not in the waitlist or the lobby is full.' });
  }

  // Broadcast updates
  await wsManager.broadcastWaitlistPromoted(code, validated.userId, participant);
  await wsManager.broadcastLobbyUpdate(code);

  return c.json({ participant });
});

// Fill lobby with random users from waitlist (host only)
lobbies.post('/:code/waitlist/fill-random', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);
  const body = await c.req.json<FillFromWaitlistRequest>();
  const validated = fillFromWaitlistSchema.parse(body);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can fill from waitlist' });
  }

  const promoted = await waitlistManager.fillFromWaitlist(lobby.id, validated.count);

  // Broadcast updates for each promoted user
  for (const participant of promoted) {
    if (participant.userId) {
      await wsManager.broadcastWaitlistPromoted(code, participant.userId, participant);
    }
  }
  await wsManager.broadcastLobbyUpdate(code);

  // Also broadcast the updated waitlist
  const waitlist = await waitlistManager.getWaitlist(lobby.id);
  await wsManager.broadcastWaitlistUpdated(code, waitlist);

  return c.json<FillFromWaitlistResponse>({ promoted: promoted.map(p => ({
    id: p.id,
    lobbyId: p.lobbyId,
    userId: p.userId,
    anonymousName: p.anonymousName,
    sessionToken: null,
    team: p.team as Team,
    isReady: p.isReady,
    isCaptain: p.isCaptain,
    selectedHeroId: p.selectedHeroId,
    joinedAt: p.joinedAt,
  })) });
});

// ===============================
// Hero Selection Endpoints
// ===============================

const selectHeroSchema = z.object({
  heroId: z.string().min(1).max(50),
});

// Select hero (after draft is completed)
lobbies.post('/:code/select-hero', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('x-session-token');
  const body = await c.req.json<SelectHeroRequest>();
  const validated = selectHeroSchema.parse(body);

  try {
    const result = await lobbyManager.selectHero(
      code,
      validated.heroId,
      user?.id,
      sessionToken || undefined
    );

    if (!result) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast hero selection to all participants
    wsManager.broadcastToLobby(code, {
      type: 'participant:hero-selected',
      participantId: result.participantId,
      heroId: result.heroId,
    });

    return c.json({ success: true, participantId: result.participantId, heroId: result.heroId });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

// Clear hero selection
lobbies.delete('/:code/select-hero', optionalAuth, async (c) => {
  const code = c.req.param('code');
  const user = c.get('user');
  const sessionToken = c.req.header('x-session-token');

  try {
    const result = await lobbyManager.selectHero(
      code,
      null,
      user?.id,
      sessionToken || undefined
    );

    if (!result) {
      throw new HTTPException(404, { message: 'Lobby not found' });
    }

    // Broadcast hero deselection to all participants
    wsManager.broadcastToLobby(code, {
      type: 'participant:hero-selected',
      participantId: result.participantId,
      heroId: null,
    });

    return c.json({ success: true, participantId: result.participantId, heroId: null });
  } catch (error) {
    if (error instanceof Error) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
});

export { lobbies };
