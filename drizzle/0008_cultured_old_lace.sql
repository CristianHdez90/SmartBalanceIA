CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_events_key_time` ON `auth_events` (`event_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `password_reset_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`approved_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_reset_user_status` ON `password_reset_requests` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_reset_created` ON `password_reset_requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`approved_at` integer,
	`approved_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_status` ON `users` (`status`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `coach_turns` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `coach_usage` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_expenses` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `movements` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `obligations` ADD `user_id` text DEFAULT 'legacy' NOT NULL;