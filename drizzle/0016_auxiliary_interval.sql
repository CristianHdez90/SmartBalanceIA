ALTER TABLE notification_settings ADD COLUMN auxiliary_minutes INTEGER NOT NULL DEFAULT 30 CHECK(auxiliary_minutes IN (0,30,60,120,360,1440));
--> statement-breakpoint
CREATE TABLE notification_auxiliary_checks (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 checked_at INTEGER NOT NULL
);
