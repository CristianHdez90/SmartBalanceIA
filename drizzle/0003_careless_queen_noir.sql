ALTER TABLE `obligations` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `obligations` ADD `cutoff_day` integer;--> statement-breakpoint
ALTER TABLE `obligations` ADD `due_day` integer;--> statement-breakpoint
ALTER TABLE `obligations` ADD `total_debt` integer;--> statement-breakpoint
ALTER TABLE `obligations` ADD `bank` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `obligations` ADD `banking_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `obligations` ADD `interest_mv` real;--> statement-breakpoint
ALTER TABLE `obligations` ADD `interest_ea` real;
--> statement-breakpoint
UPDATE obligations SET series_id = CASE WHEN instr(id,'2026-08-')>0 THEN substr(id,instr(id,'2026-08-')) ELSE substr(id,-36) END WHERE series_id IS NULL;
