CREATE TABLE obligation_carries (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 source_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 from_month TEXT NOT NULL,
 to_month TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0 AND amount<=999999999999),
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 CHECK(to_month=strftime('%Y-%m',from_month||'-01','+1 month'))
);
--> statement-breakpoint
CREATE INDEX idx_obligation_carries_source ON obligation_carries(user_id,source_id);
--> statement-breakpoint
CREATE INDEX idx_obligation_carries_target ON obligation_carries(user_id,target_id);
--> statement-breakpoint
CREATE TABLE obligation_history (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 obligation_id TEXT NOT NULL,
 month TEXT NOT NULL,
 from_status TEXT,
 to_status TEXT NOT NULL,
 effective_date TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 cause TEXT NOT NULL,
 basis TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_obligation_history_month ON obligation_history(user_id,month,recorded_at);
