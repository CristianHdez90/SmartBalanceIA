CREATE TABLE `daily_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_daily_expenses_month_date` ON `daily_expenses` (`month`,`date`);--> statement-breakpoint
CREATE INDEX `idx_daily_expenses_category` ON `daily_expenses` (`category`);