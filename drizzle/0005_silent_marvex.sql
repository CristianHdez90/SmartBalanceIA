ALTER TABLE `obligations` ADD `recurring_amount` integer;
--> statement-breakpoint
UPDATE obligations SET recurring_amount=amount;
