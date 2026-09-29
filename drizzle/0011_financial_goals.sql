CREATE TABLE financial_goals (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  target INTEGER NOT NULL CHECK (target > 0 AND target <= 999999999999),
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved >= 0 AND saved <= 999999999999),
  due_date TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_financial_goals_user ON financial_goals(user_id,archived,due_date);
