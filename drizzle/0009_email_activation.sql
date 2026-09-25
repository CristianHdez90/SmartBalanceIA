ALTER TABLE `users` ADD `email_verified_at` integer;
--> statement-breakpoint
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `role` = 'admin' OR `status` = 'active';
--> statement-breakpoint
CREATE TABLE `email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`verified_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_email_verification_user_status` ON `email_verifications` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_email_verification_expiry` ON `email_verifications` (`expires_at`);
