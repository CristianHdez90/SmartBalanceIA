CREATE TABLE `promotion_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`cache_date` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_promotion_cache_date` ON `promotion_cache` (`cache_date`);