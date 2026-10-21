CREATE TABLE web_push_subscriptions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_test_at INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX idx_web_push_user ON web_push_subscriptions(user_id);
--> statement-breakpoint
CREATE TABLE web_push_deliveries (
 subscription_id TEXT NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 state TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 1,
 retry_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(subscription_id,day)
);
