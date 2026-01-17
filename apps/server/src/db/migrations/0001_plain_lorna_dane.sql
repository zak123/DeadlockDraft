CREATE TABLE `draft_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`lobby_id` text NOT NULL,
	`skip_bans` integer DEFAULT false NOT NULL,
	`phases` text NOT NULL,
	`time_per_pick` integer DEFAULT 30 NOT NULL,
	`time_per_ban` integer DEFAULT 20 NOT NULL,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_configs_lobby_id_unique` ON `draft_configs` (`lobby_id`);--> statement-breakpoint
CREATE INDEX `draft_configs_lobby_id_idx` ON `draft_configs` (`lobby_id`);--> statement-breakpoint
CREATE TABLE `draft_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_session_id` text NOT NULL,
	`hero_id` text NOT NULL,
	`team` text,
	`type` text NOT NULL,
	`pick_order` integer NOT NULL,
	`picked_by` text,
	`picked_at` integer NOT NULL,
	FOREIGN KEY (`draft_session_id`) REFERENCES `draft_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`picked_by`) REFERENCES `lobby_participants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `draft_picks_draft_session_id_idx` ON `draft_picks` (`draft_session_id`);--> statement-breakpoint
CREATE INDEX `draft_picks_hero_id_idx` ON `draft_picks` (`hero_id`);--> statement-breakpoint
CREATE TABLE `draft_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`lobby_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_phase_index` integer DEFAULT 0 NOT NULL,
	`current_team` text DEFAULT 'amber' NOT NULL,
	`current_pick_index` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`turn_started_at` integer NOT NULL,
	FOREIGN KEY (`lobby_id`) REFERENCES `lobbies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_sessions_lobby_id_unique` ON `draft_sessions` (`lobby_id`);--> statement-breakpoint
CREATE INDEX `draft_sessions_lobby_id_idx` ON `draft_sessions` (`lobby_id`);--> statement-breakpoint
CREATE INDEX `draft_sessions_status_idx` ON `draft_sessions` (`status`);