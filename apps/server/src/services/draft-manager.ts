import { db, lobbies, draftConfigs, draftSessions, draftPicks } from '../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type {
  DraftState,
  DraftConfig as SharedDraftConfig,
  DraftSession as SharedDraftSession,
  DraftPick as SharedDraftPick,
  DraftPhase,
  DraftTeam,
} from '@deadlock-draft/shared';
import type { DraftConfig, DraftSession, DraftPick, LobbyParticipant } from '../db/schema';
import { wsManager } from './websocket';
import { deadlockApiClient } from './deadlock-api';

// All available heroes
const HEROES = [
  'abrams', 'bebop', 'billy', 'calico', 'doorman', 'drifter', 'dynamo', 'grey_talon',
  'haze', 'holliday', 'infernus', 'ivy', 'kelvin', 'lady_geist', 'lash', 'mcginnis',
  'mina', 'mirage', 'mokrill', 'paige', 'paradox', 'pocket', 'seven', 'shiv',
  'sinclair', 'victor', 'vindicta', 'viscous', 'vyper', 'warden', 'wraith', 'yamato',
];

const DEFAULT_PHASES: DraftPhase[] = [
  { type: 'ban', picks: ['amber', 'sapphire'] },
  { type: 'pick', picks: ['amber', 'sapphire', 'sapphire', 'amber'] },
  { type: 'pick', picks: ['amber', 'sapphire', 'sapphire', 'amber'] },
  { type: 'ban', picks: ['sapphire', 'amber'] },
  { type: 'pick', picks: ['sapphire', 'amber', 'amber', 'sapphire'] },
];

function toDraftConfigShared(config: DraftConfig): SharedDraftConfig {
  return {
    id: config.id,
    lobbyId: config.lobbyId,
    skipBans: config.skipBans,
    phases: config.phases as DraftPhase[],
    timePerTurn: config.timePerTurn,
    allowSinglePlayer: config.allowSinglePlayer,
    timerEnabled: config.timerEnabled,
  };
}

function toDraftSessionShared(session: DraftSession): SharedDraftSession {
  return {
    id: session.id,
    lobbyId: session.lobbyId,
    status: session.status as 'pending' | 'active' | 'completed',
    currentPhaseIndex: session.currentPhaseIndex,
    currentTeam: session.currentTeam as DraftTeam,
    currentPickIndex: session.currentPickIndex,
    startedAt: session.startedAt,
    turnStartedAt: session.turnStartedAt,
  };
}

function toDraftPickShared(pick: DraftPick): SharedDraftPick {
  return {
    id: pick.id,
    draftSessionId: pick.draftSessionId,
    heroId: pick.heroId,
    team: pick.team as DraftTeam | null,
    type: pick.type as 'pick' | 'ban',
    pickOrder: pick.pickOrder,
    pickedBy: pick.pickedBy,
    pickedAt: pick.pickedAt,
  };
}

export class DraftManager {
  private turnTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  getHeroes(): string[] {
    return [...HEROES];
  }

  async getDraftConfig(lobbyId: string): Promise<SharedDraftConfig | null> {
    const config = await db.query.draftConfigs.findFirst({
      where: eq(draftConfigs.lobbyId, lobbyId),
    });
    if (!config) return null;
    return toDraftConfigShared(config);
  }

  async getOrCreateDraftConfig(lobbyId: string): Promise<SharedDraftConfig> {
    let config = await db.query.draftConfigs.findFirst({
      where: eq(draftConfigs.lobbyId, lobbyId),
    });

    if (!config) {
      [config] = await db
        .insert(draftConfigs)
        .values({
          id: nanoid(),
          lobbyId,
          skipBans: false,
          phases: DEFAULT_PHASES,
          timePerTurn: 45,
          allowSinglePlayer: false,
          timerEnabled: true,
        })
        .returning();
    }

    return toDraftConfigShared(config);
  }

  async updateDraftConfig(
    lobbyId: string,
    hostUserId: string,
    updates: {
      skipBans?: boolean;
      phases?: DraftPhase[];
      timePerTurn?: number;
      allowSinglePlayer?: boolean;
      timerEnabled?: boolean;
    }
  ): Promise<SharedDraftConfig | null> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobbyId),
    });

    if (!lobby || lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can update draft configuration');
    }

    let config = await db.query.draftConfigs.findFirst({
      where: eq(draftConfigs.lobbyId, lobbyId),
    });

    if (!config) {
      [config] = await db
        .insert(draftConfigs)
        .values({
          id: nanoid(),
          lobbyId,
          skipBans: updates.skipBans ?? false,
          phases: updates.phases ?? DEFAULT_PHASES,
          timePerTurn: updates.timePerTurn ?? 45,
          allowSinglePlayer: updates.allowSinglePlayer ?? false,
          timerEnabled: updates.timerEnabled ?? true,
        })
        .returning();
    } else {
      const updateData: Partial<typeof draftConfigs.$inferInsert> = {};
      if (updates.skipBans !== undefined) updateData.skipBans = updates.skipBans;
      if (updates.phases !== undefined) updateData.phases = updates.phases;
      if (updates.timePerTurn !== undefined) updateData.timePerTurn = updates.timePerTurn;
      if (updates.allowSinglePlayer !== undefined) updateData.allowSinglePlayer = updates.allowSinglePlayer;
      if (updates.timerEnabled !== undefined) updateData.timerEnabled = updates.timerEnabled;

      [config] = await db
        .update(draftConfigs)
        .set(updateData)
        .where(eq(draftConfigs.id, config.id))
        .returning();
    }

    return toDraftConfigShared(config);
  }

  async getDraftSession(lobbyId: string): Promise<DraftSession | null> {
    return await db.query.draftSessions.findFirst({
      where: eq(draftSessions.lobbyId, lobbyId),
    }) || null;
  }

  async getDraftState(lobbyId: string): Promise<DraftState | null> {
    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.lobbyId, lobbyId),
    });

    if (!session) return null;

    const config = await this.getOrCreateDraftConfig(lobbyId);
    const picks = await db.query.draftPicks.findMany({
      where: eq(draftPicks.draftSessionId, session.id),
      orderBy: (picks, { asc }) => [asc(picks.pickOrder)],
    });

    const pickedHeroIds = picks.map(p => p.heroId);
    const availableHeroes = HEROES.filter(h => !pickedHeroIds.includes(h));

    const now = Date.now();
    const timePerTurn = config.timePerTurn;
    const elapsed = Math.floor((now - session.turnStartedAt) / 1000);
    const timeRemaining = Math.max(0, timePerTurn - elapsed);

    return {
      session: toDraftSessionShared(session),
      config,
      picks: picks.map(toDraftPickShared),
      availableHeroes,
      currentTurnTimeRemaining: timeRemaining,
    };
  }

  async startDraft(lobbyCode: string, hostUserId: string): Promise<DraftState> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, lobbyCode.toUpperCase()),
      with: {
        participants: true,
      },
    });

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can start the draft');
    }

    if (lobby.status !== 'waiting') {
      throw new Error('Lobby is not in waiting status');
    }

    // Check if draft already exists
    const existingSession = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.lobbyId, lobby.id),
    });

    if (existingSession && existingSession.status !== 'completed') {
      throw new Error('Draft is already in progress');
    }

    const config = await this.getOrCreateDraftConfig(lobby.id);

    // Validate team composition
    const amberPlayers = lobby.participants.filter(p => p.team === 'amber');
    const sapphirePlayers = lobby.participants.filter(p => p.team === 'sapphire');

    if (config.allowSinglePlayer) {
      // Single player mode requires at least one player on at least one team
      if (amberPlayers.length === 0 && sapphirePlayers.length === 0) {
        throw new Error('At least one player must be on a team to start the draft');
      }
    } else {
      // Normal mode requires both teams to have players
      if (amberPlayers.length === 0 || sapphirePlayers.length === 0) {
        throw new Error('Both teams must have at least one player to start the draft');
      }

      // Validate captains - each team must have exactly one captain
      const amberCaptain = amberPlayers.find(p => p.isCaptain);
      const sapphireCaptain = sapphirePlayers.find(p => p.isCaptain);

      if (!amberCaptain) {
        throw new Error('Team Amber must have a captain assigned');
      }
      if (!sapphireCaptain) {
        throw new Error('Team Sapphire must have a captain assigned');
      }
    }

    // Filter phases based on skipBans
    let phases = config.phases;
    if (config.skipBans) {
      phases = phases.filter(p => p.type !== 'ban');
    }

    // Determine starting team
    const firstPhase = phases[0];
    const startingTeam = firstPhase?.picks[0] || 'amber';

    const now = Date.now();
    const [session] = await db
      .insert(draftSessions)
      .values({
        id: nanoid(),
        lobbyId: lobby.id,
        status: 'active',
        currentPhaseIndex: 0,
        currentTeam: startingTeam,
        currentPickIndex: 0,
        startedAt: now,
        turnStartedAt: now,
      })
      .returning();

    // Update lobby status
    await db
      .update(lobbies)
      .set({ status: 'in_progress', updatedAt: new Date().toISOString() })
      .where(eq(lobbies.id, lobby.id));

    const draftState = await this.getDraftState(lobby.id);
    if (!draftState) {
      throw new Error('Failed to create draft state');
    }

    // Broadcast draft started
    wsManager.broadcastToLobby(lobbyCode, {
      type: 'draft:started',
      draftState,
    });

    // If single player mode is enabled, check if starting team is empty and auto-pick
    if (config.allowSinglePlayer) {
      const startingTeamPlayers = lobby.participants.filter(p => p.team === startingTeam);
      if (startingTeamPlayers.length === 0) {
        await this.autoPickForEmptyTeam(lobbyCode, lobby.id, session.id, phases);
        const updatedState = await this.getDraftState(lobby.id);
        if (updatedState) {
          return updatedState;
        }
      }
    }

    // Start turn timer
    this.startTurnTimer(lobbyCode, lobby.id, session.id);

    return draftState;
  }

  private async autoPickForEmptyTeam(
    lobbyCode: string,
    lobbyId: string,
    sessionId: string,
    phases: DraftPhase[]
  ): Promise<void> {
    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.id, sessionId),
    });

    if (!session || session.status !== 'active') return;

    const currentPhase = phases[session.currentPhaseIndex];
    if (!currentPhase) return;

    // Get available heroes
    const existingPicks = await db.query.draftPicks.findMany({
      where: eq(draftPicks.draftSessionId, sessionId),
    });

    const pickedHeroIds = existingPicks.map(p => p.heroId);
    const availableHeroes = HEROES.filter(h => !pickedHeroIds.includes(h));

    if (availableHeroes.length === 0) return;

    // Pick a random hero
    const heroId = availableHeroes[Math.floor(Math.random() * availableHeroes.length)];
    const pickOrder = existingPicks.length;

    const [pick] = await db
      .insert(draftPicks)
      .values({
        id: nanoid(),
        draftSessionId: sessionId,
        heroId,
        team: currentPhase.type === 'pick' ? session.currentTeam : null,
        type: currentPhase.type,
        pickOrder,
        pickedBy: null,
        pickedAt: Date.now(),
      })
      .returning();

    const draftState = await this.getDraftState(lobbyId);
    if (draftState) {
      wsManager.broadcastToLobby(lobbyCode, {
        type: 'draft:pick',
        pick: toDraftPickShared(pick),
        draftState,
      });
    }

    // Advance draft and check again for empty team
    await this.advanceDraft(lobbyId, sessionId, phases, lobbyCode);
  }

  async makePick(
    lobbyCode: string,
    heroId: string,
    userId?: string,
    sessionToken?: string
  ): Promise<DraftState> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, lobbyCode.toUpperCase()),
      with: {
        participants: true,
      },
    });

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.lobbyId, lobby.id),
    });

    if (!session || session.status !== 'active') {
      throw new Error('No active draft session');
    }

    const config = await this.getOrCreateDraftConfig(lobby.id);
    let phases = config.phases;
    if (config.skipBans) {
      phases = phases.filter(p => p.type !== 'ban');
    }

    const currentPhase = phases[session.currentPhaseIndex];
    if (!currentPhase) {
      throw new Error('Draft has completed');
    }

    // Find the participant
    let participant: LobbyParticipant | undefined;
    if (userId) {
      participant = lobby.participants.find(p => p.userId === userId);
    } else if (sessionToken) {
      participant = lobby.participants.find(p => p.sessionToken === sessionToken);
    }

    if (!participant) {
      throw new Error('Participant not found');
    }

    // In single-player mode, any team member can pick for any team
    // Otherwise, check if it's their team's turn and they're the captain
    if (!config.allowSinglePlayer) {
      // Check if it's their team's turn
      if (participant.team !== session.currentTeam) {
        throw new Error(`It's ${session.currentTeam}'s turn to pick`);
      }

      // Check if participant is captain
      if (!participant.isCaptain) {
        throw new Error('Only the team captain can make picks');
      }
    }

    // Verify hero is available
    const existingPicks = await db.query.draftPicks.findMany({
      where: eq(draftPicks.draftSessionId, session.id),
    });

    if (existingPicks.some(p => p.heroId === heroId)) {
      throw new Error('Hero has already been picked or banned');
    }

    if (!HEROES.includes(heroId)) {
      throw new Error('Invalid hero');
    }

    // Clear the turn timer
    this.clearTurnTimer(lobby.id);

    // Record the pick
    const pickOrder = existingPicks.length;
    const [pick] = await db
      .insert(draftPicks)
      .values({
        id: nanoid(),
        draftSessionId: session.id,
        heroId,
        team: currentPhase.type === 'pick' ? session.currentTeam : null,
        type: currentPhase.type,
        pickOrder,
        pickedBy: participant.id,
        pickedAt: Date.now(),
      })
      .returning();

    // Advance to next turn
    await this.advanceDraft(lobby.id, session.id, phases, lobbyCode);

    const draftState = await this.getDraftState(lobby.id);
    if (!draftState) {
      throw new Error('Failed to get draft state');
    }

    // Broadcast the pick
    wsManager.broadcastToLobby(lobbyCode, {
      type: 'draft:pick',
      pick: toDraftPickShared(pick),
      draftState,
    });

    // Broadcast pick/ban to chat
    const heroName = heroId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const teamName = session.currentTeam === 'amber' ? 'Amber' : 'Sapphire';
    const action = currentPhase.type === 'pick' ? 'picked' : 'banned';
    wsManager.broadcastSystemMessage(lobbyCode, `${teamName} ${action} ${heroName}`);

    return draftState;
  }

  private async advanceDraft(
    lobbyId: string,
    sessionId: string,
    phases: DraftPhase[],
    lobbyCode: string
  ): Promise<void> {
    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.id, sessionId),
    });

    if (!session) return;

    let { currentPhaseIndex, currentPickIndex } = session;
    const currentPhase = phases[currentPhaseIndex];

    currentPickIndex++;

    // Check if we need to move to next phase
    if (currentPickIndex >= currentPhase.picks.length) {
      currentPhaseIndex++;
      currentPickIndex = 0;

      // Check if draft is complete
      if (currentPhaseIndex >= phases.length) {
        await db
          .update(draftSessions)
          .set({ status: 'completed' })
          .where(eq(draftSessions.id, sessionId));

        await db
          .update(lobbies)
          .set({
            status: 'completed',
            draftCompletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(lobbies.id, lobbyId));

        const draftState = await this.getDraftState(lobbyId);
        if (draftState) {
          wsManager.broadcastToLobby(lobbyCode, {
            type: 'draft:completed',
            draftState,
          });
        }

        // Create party via Deadlock API
        this.createPartyForLobby(lobbyId, lobbyCode);

        return;
      }
    }

    const nextPhase = phases[currentPhaseIndex];
    const nextTeam = nextPhase.picks[currentPickIndex];
    const now = Date.now();

    await db
      .update(draftSessions)
      .set({
        currentPhaseIndex,
        currentPickIndex,
        currentTeam: nextTeam,
        turnStartedAt: now,
      })
      .where(eq(draftSessions.id, sessionId));

    // Broadcast turn update
    const updatedSession = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.id, sessionId),
    });

    if (updatedSession && updatedSession.status === 'active') {
      const config = await this.getOrCreateDraftConfig(lobbyId);
      const timePerTurn = config.timePerTurn;

      wsManager.broadcastToLobby(lobbyCode, {
        type: 'draft:turn',
        session: toDraftSessionShared(updatedSession),
        timeRemaining: timePerTurn,
      });

      // If single player mode, check if next team is empty and auto-pick
      if (config.allowSinglePlayer) {
        const lobby = await db.query.lobbies.findFirst({
          where: eq(lobbies.id, lobbyId),
          with: { participants: true },
        });

        if (lobby) {
          const nextTeamPlayers = lobby.participants.filter(p => p.team === nextTeam);
          if (nextTeamPlayers.length === 0) {
            // Auto-pick for empty team
            await this.autoPickForEmptyTeam(lobbyCode, lobbyId, sessionId, phases);
            return;
          }
        }
      }

      // Start new turn timer
      this.startTurnTimer(lobbyCode, lobbyId, sessionId);
    }
  }

  private async startTurnTimer(lobbyCode: string, lobbyId: string, sessionId: string): Promise<void> {
    this.clearTurnTimer(lobbyId);

    // Check if timer is enabled
    const config = await this.getOrCreateDraftConfig(lobbyId);
    if (!config.timerEnabled) {
      return; // Don't start timer if disabled
    }

    const checkAndAutoPick = async () => {
      const session = await db.query.draftSessions.findFirst({
        where: eq(draftSessions.id, sessionId),
      });

      if (!session || session.status !== 'active') return;

      const latestConfig = await this.getOrCreateDraftConfig(lobbyId);
      if (!latestConfig.timerEnabled) return; // Timer was disabled

      let phases = latestConfig.phases;
      if (latestConfig.skipBans) {
        phases = phases.filter(p => p.type !== 'ban');
      }

      const currentPhase = phases[session.currentPhaseIndex];
      if (!currentPhase) return;

      const timePerTurn = latestConfig.timePerTurn;
      const elapsed = Math.floor((Date.now() - session.turnStartedAt) / 1000);

      if (elapsed >= timePerTurn) {
        // Time's up - auto pick a random available hero
        await this.autoPickHero(lobbyCode, lobbyId, sessionId, phases);
      } else {
        // Schedule next check
        const remaining = (timePerTurn - elapsed) * 1000;
        const timer = setTimeout(checkAndAutoPick, Math.min(remaining + 100, 1000));
        this.turnTimers.set(lobbyId, timer);
      }
    };

    // Start checking
    const timer = setTimeout(checkAndAutoPick, 1000);
    this.turnTimers.set(lobbyId, timer);
  }

  private clearTurnTimer(lobbyId: string): void {
    const timer = this.turnTimers.get(lobbyId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(lobbyId);
    }
  }

  async cancelDraft(lobbyCode: string, hostUserId: string): Promise<void> {
    const lobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.code, lobbyCode.toUpperCase()),
    });

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (lobby.hostUserId !== hostUserId) {
      throw new Error('Only the host can cancel the draft');
    }

    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.lobbyId, lobby.id),
    });

    if (!session) {
      throw new Error('No draft session to cancel');
    }

    if (session.status === 'completed') {
      throw new Error('Cannot cancel a completed draft');
    }

    // Clear the turn timer
    this.clearTurnTimer(lobby.id);

    // Delete all picks for this session
    await db.delete(draftPicks).where(eq(draftPicks.draftSessionId, session.id));

    // Delete the session
    await db.delete(draftSessions).where(eq(draftSessions.id, session.id));

    // Reset lobby status back to waiting
    await db
      .update(lobbies)
      .set({ status: 'waiting', updatedAt: new Date().toISOString() })
      .where(eq(lobbies.id, lobby.id));

    // Broadcast draft cancellation
    wsManager.broadcastToLobby(lobbyCode, {
      type: 'draft:cancelled',
    });
  }

  async cancelDraftForDisconnect(lobbyCode: string, lobbyId: string, reason: string): Promise<void> {
    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.lobbyId, lobbyId),
    });

    if (!session || session.status !== 'active') {
      return; // No active draft to cancel
    }

    // Clear the turn timer
    this.clearTurnTimer(lobbyId);

    // Delete all picks for this session
    await db.delete(draftPicks).where(eq(draftPicks.draftSessionId, session.id));

    // Delete the session
    await db.delete(draftSessions).where(eq(draftSessions.id, session.id));

    // Reset lobby status back to waiting
    await db
      .update(lobbies)
      .set({ status: 'waiting', updatedAt: new Date().toISOString() })
      .where(eq(lobbies.id, lobbyId));

    // Broadcast draft cancellation
    wsManager.broadcastToLobby(lobbyCode, {
      type: 'draft:cancelled',
    });

    // Broadcast the reason to chat
    wsManager.broadcastSystemMessage(lobbyCode, reason);
  }

  /**
   * Create a party via the Deadlock API after draft completes.
   * This runs asynchronously and broadcasts the party code when ready.
   */
  private async createPartyForLobby(lobbyId: string, lobbyCode: string): Promise<void> {
    try {
      const { joinCode, botId } = await deadlockApiClient.createParty();

      // Store the party code in the lobby
      await db
        .update(lobbies)
        .set({
          deadlockPartyCode: joinCode,
          deadlockLobbyId: botId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(lobbies.id, lobbyId));

      // Broadcast party created to all clients
      wsManager.broadcastToLobby(lobbyCode, {
        type: 'draft:party-created',
        partyCode: joinCode,
      });

      // Also send a system message
      wsManager.broadcastSystemMessage(
        lobbyCode,
        `Party created! Enter code ${joinCode} in Deadlock to join.`
      );
    } catch (error) {
      console.error('Failed to create Deadlock party:', error);
      wsManager.broadcastSystemMessage(
        lobbyCode,
        'Failed to create Deadlock party. You can manually create a party in-game.'
      );
    }
  }

  private async autoPickHero(
    lobbyCode: string,
    lobbyId: string,
    sessionId: string,
    phases: DraftPhase[]
  ): Promise<void> {
    const session = await db.query.draftSessions.findFirst({
      where: eq(draftSessions.id, sessionId),
    });

    if (!session || session.status !== 'active') return;

    const currentPhase = phases[session.currentPhaseIndex];
    if (!currentPhase) return;

    // Get available heroes
    const existingPicks = await db.query.draftPicks.findMany({
      where: eq(draftPicks.draftSessionId, sessionId),
    });

    const pickedHeroIds = existingPicks.map(p => p.heroId);
    const availableHeroes = HEROES.filter(h => !pickedHeroIds.includes(h));

    if (availableHeroes.length === 0) return;

    // Pick a random hero
    const heroId = availableHeroes[Math.floor(Math.random() * availableHeroes.length)];
    const pickOrder = existingPicks.length;

    const [pick] = await db
      .insert(draftPicks)
      .values({
        id: nanoid(),
        draftSessionId: sessionId,
        heroId,
        team: currentPhase.type === 'pick' ? session.currentTeam : null,
        type: currentPhase.type,
        pickOrder,
        pickedBy: null, // Auto-pick has no picker
        pickedAt: Date.now(),
      })
      .returning();

    // Advance draft
    await this.advanceDraft(lobbyId, sessionId, phases, lobbyCode);

    const draftState = await this.getDraftState(lobbyId);
    if (draftState) {
      wsManager.broadcastToLobby(lobbyCode, {
        type: 'draft:timeout',
        autoPick: toDraftPickShared(pick),
        draftState,
      });

      // Broadcast timeout to chat
      const heroName = heroId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const teamName = session.currentTeam === 'amber' ? 'Amber' : 'Sapphire';
      const action = currentPhase.type === 'pick' ? 'auto-picked' : 'auto-banned';
      wsManager.broadcastSystemMessage(lobbyCode, `${teamName} ran out of time and ${action} ${heroName}`);
    }
  }
}

export const draftManager = new DraftManager();
