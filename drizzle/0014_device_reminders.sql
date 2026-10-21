CREATE TABLE notification_settings (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
 payments INTEGER NOT NULL DEFAULT 1 CHECK(payments IN (0,1)),
 promotions INTEGER NOT NULL DEFAULT 1 CHECK(promotions IN (0,1)),
 advance_days INTEGER NOT NULL DEFAULT 3 CHECK(advance_days BETWEEN 0 AND 14),
 time TEXT NOT NULL DEFAULT '08:00',
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE promotion_reminders (
 id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 supermarket TEXT NOT NULL,
 product TEXT NOT NULL,
 weekdays TEXT NOT NULL,
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,id)
);
--> statement-breakpoint
CREATE INDEX idx_promotion_reminders_user_dates ON promotion_reminders(user_id,start_date,end_date);
