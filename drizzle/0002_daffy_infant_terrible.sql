CREATE TABLE `coach_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`month` text NOT NULL,
	`include_context` integer NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coach_conversation` ON `coach_turns` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_coach_month_context` ON `coach_turns` (`month`,`include_context`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_coach_usage` ON `coach_turns` (`created_at`);