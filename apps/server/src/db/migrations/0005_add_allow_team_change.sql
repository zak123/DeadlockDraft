ALTER TABLE `lobbies` ADD `is_public` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `lobbies` ADD `allow_team_change` integer DEFAULT false NOT NULL;
