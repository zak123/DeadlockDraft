import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  steamId: text('steam_id').notNull().unique(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  avatarSmall: text('avatar_small'),
  avatarMedium: text('avatar_medium'),
  avatarLarge: text('avatar_large'),
  profileUrl: text('profile_url'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  steamIdIdx: index('users_steam_id_idx').on(table.steamId),
}));

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
}));

// Lobbies table
export const lobbies = sqliteTable('lobbies', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  hostUserId: text('host_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['waiting', 'starting', 'in_progress', 'completed', 'cancelled'] }).notNull().default('waiting'),
  deadlockPartyCode: text('deadlock_party_code'),
  deadlockLobbyId: text('deadlock_lobby_id'),
  deadlockMatchId: text('deadlock_match_id'),
  matchConfig: text('match_config', { mode: 'json' }).notNull().$type<{
    gameMode: string;
    mapName: string;
    teamSize: number;
    allowSpectators: boolean;
    maxRounds: number;
    roundTime: number;
  }>(),
  maxPlayers: integer('max_players').notNull().default(12),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text('expires_at').notNull(),
}, (table) => ({
  codeIdx: index('lobbies_code_idx').on(table.code),
  statusIdx: index('lobbies_status_idx').on(table.status),
  hostUserIdIdx: index('lobbies_host_user_id_idx').on(table.hostUserId),
}));

// Lobby participants table
export const lobbyParticipants = sqliteTable('lobby_participants', {
  id: text('id').primaryKey(),
  lobbyId: text('lobby_id').notNull().references(() => lobbies.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  anonymousName: text('anonymous_name'),
  sessionToken: text('session_token'),
  team: text('team', { enum: ['amber', 'sapphire', 'spectator', 'unassigned'] }).notNull().default('unassigned'),
  isReady: integer('is_ready', { mode: 'boolean' }).notNull().default(false),
  joinedAt: text('joined_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  lobbyIdIdx: index('lobby_participants_lobby_id_idx').on(table.lobbyId),
  userIdIdx: index('lobby_participants_user_id_idx').on(table.userId),
  sessionTokenIdx: index('lobby_participants_session_token_idx').on(table.sessionToken),
}));

// Draft config table
export const draftConfigs = sqliteTable('draft_configs', {
  id: text('id').primaryKey(),
  lobbyId: text('lobby_id').notNull().references(() => lobbies.id, { onDelete: 'cascade' }).unique(),
  skipBans: integer('skip_bans', { mode: 'boolean' }).notNull().default(false),
  phases: text('phases', { mode: 'json' }).notNull().$type<Array<{
    type: 'pick' | 'ban';
    picks: Array<'amber' | 'sapphire'>;
  }>>(),
  timePerPick: integer('time_per_pick').notNull().default(30),
  timePerBan: integer('time_per_ban').notNull().default(20),
  allowSinglePlayer: integer('allow_single_player', { mode: 'boolean' }).notNull().default(false),
  timerEnabled: integer('timer_enabled', { mode: 'boolean' }).notNull().default(true),
}, (table) => ({
  lobbyIdIdx: index('draft_configs_lobby_id_idx').on(table.lobbyId),
}));

// Draft sessions table
export const draftSessions = sqliteTable('draft_sessions', {
  id: text('id').primaryKey(),
  lobbyId: text('lobby_id').notNull().references(() => lobbies.id, { onDelete: 'cascade' }).unique(),
  status: text('status', { enum: ['pending', 'active', 'completed'] }).notNull().default('pending'),
  currentPhaseIndex: integer('current_phase_index').notNull().default(0),
  currentTeam: text('current_team', { enum: ['amber', 'sapphire'] }).notNull().default('amber'),
  currentPickIndex: integer('current_pick_index').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  turnStartedAt: integer('turn_started_at').notNull(),
}, (table) => ({
  lobbyIdIdx: index('draft_sessions_lobby_id_idx').on(table.lobbyId),
  statusIdx: index('draft_sessions_status_idx').on(table.status),
}));

// Draft picks table
export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey(),
  draftSessionId: text('draft_session_id').notNull().references(() => draftSessions.id, { onDelete: 'cascade' }),
  heroId: text('hero_id').notNull(),
  team: text('team', { enum: ['amber', 'sapphire'] }),
  type: text('type', { enum: ['pick', 'ban'] }).notNull(),
  pickOrder: integer('pick_order').notNull(),
  pickedBy: text('picked_by').references(() => lobbyParticipants.id, { onDelete: 'set null' }),
  pickedAt: integer('picked_at').notNull(),
}, (table) => ({
  draftSessionIdIdx: index('draft_picks_draft_session_id_idx').on(table.draftSessionId),
  heroIdIdx: index('draft_picks_hero_id_idx').on(table.heroId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  hostedLobbies: many(lobbies),
  participations: many(lobbyParticipants),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const lobbiesRelations = relations(lobbies, ({ one, many }) => ({
  host: one(users, {
    fields: [lobbies.hostUserId],
    references: [users.id],
  }),
  participants: many(lobbyParticipants),
  draftConfig: one(draftConfigs),
  draftSession: one(draftSessions),
}));

export const lobbyParticipantsRelations = relations(lobbyParticipants, ({ one, many }) => ({
  lobby: one(lobbies, {
    fields: [lobbyParticipants.lobbyId],
    references: [lobbies.id],
  }),
  user: one(users, {
    fields: [lobbyParticipants.userId],
    references: [users.id],
  }),
  draftPicks: many(draftPicks),
}));

export const draftConfigsRelations = relations(draftConfigs, ({ one }) => ({
  lobby: one(lobbies, {
    fields: [draftConfigs.lobbyId],
    references: [lobbies.id],
  }),
}));

export const draftSessionsRelations = relations(draftSessions, ({ one, many }) => ({
  lobby: one(lobbies, {
    fields: [draftSessions.lobbyId],
    references: [lobbies.id],
  }),
  picks: many(draftPicks),
}));

export const draftPicksRelations = relations(draftPicks, ({ one }) => ({
  draftSession: one(draftSessions, {
    fields: [draftPicks.draftSessionId],
    references: [draftSessions.id],
  }),
  participant: one(lobbyParticipants, {
    fields: [draftPicks.pickedBy],
    references: [lobbyParticipants.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Lobby = typeof lobbies.$inferSelect;
export type NewLobby = typeof lobbies.$inferInsert;
export type LobbyParticipant = typeof lobbyParticipants.$inferSelect;
export type NewLobbyParticipant = typeof lobbyParticipants.$inferInsert;
export type DraftConfig = typeof draftConfigs.$inferSelect;
export type NewDraftConfig = typeof draftConfigs.$inferInsert;
export type DraftSession = typeof draftSessions.$inferSelect;
export type NewDraftSession = typeof draftSessions.$inferInsert;
export type DraftPick = typeof draftPicks.$inferSelect;
export type NewDraftPick = typeof draftPicks.$inferInsert;
