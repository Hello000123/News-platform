CREATE TABLE agent_request_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('review', 'rewrite')),
  attempted_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX agent_request_events_user_time_index
  ON agent_request_events(user_id, attempted_at DESC);

CREATE INDEX agent_request_events_time_user_index
  ON agent_request_events(attempted_at DESC, user_id);

CREATE TABLE agent_request_event_tracking (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  started_at INTEGER NOT NULL
);

INSERT INTO agent_request_event_tracking (singleton_id, started_at)
VALUES (1, CAST(strftime('%s', 'now') AS INTEGER));
