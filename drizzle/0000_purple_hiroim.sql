CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`target_id` text,
	`time_control` text NOT NULL,
	`color` text NOT NULL,
	`rated` integer NOT NULL,
	`min_rating` integer,
	`max_rating` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`game_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `challenges_org_status` ON `challenges` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`white_id` text,
	`black_id` text,
	`bot_id` text,
	`time_control` text NOT NULL,
	`time_class` text NOT NULL,
	`rated` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`result` text,
	`termination` text,
	`moves` text DEFAULT '' NOT NULL,
	`white_ms` integer NOT NULL,
	`black_ms` integer NOT NULL,
	`turn_started_at` integer NOT NULL,
	`draw_offer` text,
	`white_rating` integer,
	`black_rating` integer,
	`white_delta` integer,
	`black_delta` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`end_token` text,
	`created_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `games_white` ON `games` (`white_id`,`status`);--> statement-breakpoint
CREATE INDEX `games_black` ON `games` (`black_id`,`status`);--> statement-breakpoint
CREATE INDEX `games_org_status` ON `games` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`bullet` integer DEFAULT 1200 NOT NULL,
	`blitz` integer DEFAULT 1200 NOT NULL,
	`rapid` integer DEFAULT 1200 NOT NULL,
	`daily` integer DEFAULT 1200 NOT NULL,
	`puzzle` integer DEFAULT 1200 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `puzzle_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`puzzle_id` text NOT NULL,
	`solved` integer NOT NULL,
	`ms` integer NOT NULL,
	`rating_change` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempts_user` ON `puzzle_attempts` (`user_id`,`created_at`);