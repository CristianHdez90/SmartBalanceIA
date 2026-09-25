CREATE TABLE `coach_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coach_usage_time` ON `coach_usage` (`created_at`);