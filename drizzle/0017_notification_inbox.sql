CREATE TABLE notification_inbox (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 day TEXT NOT NULL,
 kind TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 section TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 read_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,id)
);
--> statement-breakpoint
CREATE INDEX idx_notification_inbox_user ON notification_inbox(user_id,active,read_at,created_at);
