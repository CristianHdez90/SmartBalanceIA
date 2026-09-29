CREATE TABLE balance_transfers (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 from_month TEXT NOT NULL,
 to_month TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 999999999999),
 created_at INTEGER NOT NULL,
 CHECK(to_month = strftime('%Y-%m',from_month || '-01','+1 month'))
);
--> statement-breakpoint
CREATE INDEX idx_balance_transfers_from ON balance_transfers(user_id,from_month);
--> statement-breakpoint
CREATE INDEX idx_balance_transfers_to ON balance_transfers(user_id,to_month);
