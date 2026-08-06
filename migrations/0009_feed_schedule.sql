CREATE TABLE IF NOT EXISTS feed_schedule_settings (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  enabled    INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK (interval_minutes >= 15),
  last_auto_fetch_at INTEGER,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO feed_schedule_settings (id, enabled, interval_minutes, updated_at)
VALUES (1, 0, 360, unixepoch());
