ALTER TABLE `users` ADD `firebase_uid` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_firebase_uid_unique` ON `users` (`firebase_uid`);
--> statement-breakpoint
CREATE INDEX `idx_users_firebase_uid` ON `users` (`firebase_uid`);
