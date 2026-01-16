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
}));

export const lobbyParticipantsRelations = relations(lobbyParticipants, ({ one }) => ({
  lobby: one(lobbies, {
    fields: [lobbyParticipants.lobbyId],
    references: [lobbies.id],
  }),
  user: one(users, {
    fields: [lobbyParticipants.userId],
    references: [users.id],
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
