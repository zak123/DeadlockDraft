import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { deadlockApiClient } from '../services/deadlock-api';
import { lobbyManager } from '../services/lobby-manager';
import { wsManager } from '../services/websocket';
import { requireAuth, getAuthUser, type AuthVariables } from '../middleware/auth';

const matches = new Hono<{ Variables: AuthVariables }>();

// Create Deadlock custom match (host only)
matches.post('/:code/match/create', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can create the match' });
  }

  if (lobby.status !== 'waiting') {
    throw new HTTPException(400, { message: 'Lobby is not in waiting status' });
  }

  if (lobby.deadlockPartyCode) {
    throw new HTTPException(400, { message: 'Match already created' });
  }

  try {
    const result = await deadlockApiClient.createCustomMatch(lobby.matchConfig);

    await lobbyManager.updateLobbyDeadlockInfo(lobby.id, {
      partyCode: result.party_code,
      deadlockLobbyId: result.lobby_id,
      status: 'starting',
    });

    // Broadcast match created to all participants
    wsManager.broadcastToLobby(code, {
      type: 'lobby:match-created',
      partyCode: result.party_code,
    });

    // Also send full lobby update
    await wsManager.broadcastLobbyUpdate(code);

    return c.json({
      partyCode: result.party_code,
      lobbyId: result.lobby_id,
    });
  } catch (error) {
    console.error('Failed to create Deadlock match:', error);
    throw new HTTPException(500, { message: 'Failed to create Deadlock match' });
  }
});

// Ready up for match (host only)
matches.post('/:code/match/ready', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can ready up' });
  }

  if (!lobby.deadlockLobbyId) {
    throw new HTTPException(400, { message: 'No Deadlock match created yet' });
  }

  try {
    await deadlockApiClient.readyMatch(lobby.deadlockLobbyId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to ready match:', error);
    throw new HTTPException(500, { message: 'Failed to ready match' });
  }
});

// Unready from match (host only)
matches.post('/:code/match/unready', requireAuth, async (c) => {
  const code = c.req.param('code');
  const user = getAuthUser(c);

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (lobby.hostUserId !== user.id) {
    throw new HTTPException(403, { message: 'Only the host can unready' });
  }

  if (!lobby.deadlockLobbyId) {
    throw new HTTPException(400, { message: 'No Deadlock match created yet' });
  }

  try {
    await deadlockApiClient.unreadyMatch(lobby.deadlockLobbyId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to unready match:', error);
    throw new HTTPException(500, { message: 'Failed to unready match' });
  }
});

// Get match status (public for lobby participants)
matches.get('/:code/match/status', async (c) => {
  const code = c.req.param('code');

  const lobby = await lobbyManager.getLobbyByCode(code);
  if (!lobby) {
    throw new HTTPException(404, { message: 'Lobby not found' });
  }

  if (!lobby.deadlockPartyCode) {
    return c.json({
      status: 'not_created',
      partyCode: null,
      matchId: null,
    });
  }

  try {
    const result = await deadlockApiClient.getMatchId(lobby.deadlockPartyCode);

    // If match ID is available and we don't have it yet, update and broadcast
    if (result.match_id && !lobby.deadlockMatchId) {
      await lobbyManager.updateLobbyDeadlockInfo(lobby.id, {
        matchId: result.match_id,
        status: 'in_progress',
      });

      wsManager.broadcastToLobby(code, {
        type: 'lobby:match-starting',
        matchId: result.match_id,
      });
    }

    return c.json({
      status: result.status,
      partyCode: lobby.deadlockPartyCode,
      matchId: result.match_id || lobby.deadlockMatchId,
    });
  } catch (error) {
    console.error('Failed to get match status:', error);
    return c.json({
      status: 'unknown',
      partyCode: lobby.deadlockPartyCode,
      matchId: lobby.deadlockMatchId,
    });
  }
});

export { matches };
