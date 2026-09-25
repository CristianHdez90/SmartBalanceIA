CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`kind` text NOT NULL,
	`obligation_id` text,
	`amount` integer NOT NULL,
	`date` text,
	`description` text NOT NULL,
	FOREIGN KEY (`obligation_id`) REFERENCES `obligations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movements_month` ON `movements` (`month`);--> statement-breakpoint
CREATE INDEX `idx_movements_obligation` ON `movements` (`obligation_id`);--> statement-breakpoint
CREATE TABLE `obligations` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_obligations_month` ON `obligations` (`month`);