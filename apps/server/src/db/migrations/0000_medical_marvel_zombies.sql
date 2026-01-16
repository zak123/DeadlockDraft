CREATE TABLE `lobbies` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`host_user_id` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`deadlock_party_code` text,
	`deadlock_lobby_id` text,
	`deadlock_match_id` text,
	`match_config` text NOT NULL,
	`max_players` integer DEFAULT 12 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lobbies_code_unique` ON `lobbies` (`code`);--> statement-breakpoint
CREATE INDEX `lobbies_code_idx` ON `lobbies` (`code`);--> statement-breakpoint
CREATE INDEX `lobbies_status_idx` ON `lobbies` (`status`);--> statement-breakpoint
CREATE INDEX `lobbies_host_user_id_idx` ON `lobbies` (`host_user_id`);--> statement-breakpoint
CREATE TABLE `lobby_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`lobby_id` text NOT NULL,
	`user_id` text,
	`anonymous_name` text,
	`session_token` text,
	`team` text DEFAULT 'unassigned' NOT NULL,
	`is_ready` integer DEFAULT false NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lobby_participants_lobby_id_idx` ON `lobby_participants` (`lobby_id`);--> statement-breakpoint
CREATE INDEX `lobby_participants_user_id_idx` ON `lobby_participants` (`user_id`);--> statement-breakpoint
CREATE INDEX `lobby_participants_session_token_idx` ON `lobby_participants` (`session_token`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`steam_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_small` text,
	`avatar_medium` text,
	`avatar_large` text,
	`profile_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_steam_id_unique` ON `users` (`steam_id`);--> statement-breakpoint
CREATE INDEX `users_steam_id_idx` ON `users` (`steam_id`);