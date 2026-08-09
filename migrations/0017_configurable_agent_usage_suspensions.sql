ALTER TABLE users ADD COLUMN ai_suspension_id TEXT;
ALTER TABLE users ADD COLUMN ai_suspended_at INTEGER;
ALTER TABLE users ADD COLUMN ai_suspended_until INTEGER;
ALTER TABLE users ADD COLUMN ai_suspension_period TEXT
  CHECK (
    ai_suspension_period IS NULL OR ai_suspension_period IN (
      'last_15_minutes',
      'last_1_hour',
      'last_6_hours',
      'last_12_hours',
      'last_24_hours'
    )
  );
ALTER TABLE users ADD COLUMN ai_suspension_threshold INTEGER
  CHECK (ai_suspension_threshold IS NULL OR ai_suspension_threshold > 0);
ALTER TABLE users ADD COLUMN ai_suspension_observed_count INTEGER
  CHECK (
    ai_suspension_observed_count IS NULL OR
    ai_suspension_observed_count > 0
  );

CREATE INDEX users_active_ai_suspension_index
  ON users(role, ai_suspended_until DESC)
  WHERE ai_suspended_until IS NOT NULL;

CREATE TABLE agent_usage_thresholds (
  period TEXT PRIMARY KEY
    CHECK (
      period IN (
        'last_15_minutes',
        'last_1_hour',
        'last_6_hours',
        'last_12_hours',
        'last_24_hours'
      )
    ),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  request_limit INTEGER NOT NULL CHECK (request_limit > 0),
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  priority INTEGER NOT NULL UNIQUE CHECK (priority BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  updated_by_user_id TEXT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO agent_usage_thresholds (
  period,
  enabled,
  request_limit,
  window_seconds,
  priority,
  updated_at,
  updated_by_user_id
) VALUES
  ('last_15_minutes', 0, 100, 900, 1, CAST(strftime('%s', 'now') AS INTEGER), NULL),
  ('last_1_hour', 0, 100, 3600, 2, CAST(strftime('%s', 'now') AS INTEGER), NULL),
  ('last_6_hours', 0, 100, 21600, 3, CAST(strftime('%s', 'now') AS INTEGER), NULL),
  ('last_12_hours', 0, 100, 43200, 4, CAST(strftime('%s', 'now') AS INTEGER), NULL),
  ('last_24_hours', 0, 100, 86400, 5, CAST(strftime('%s', 'now') AS INTEGER), NULL);

CREATE TABLE agent_usage_threshold_audit_records (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  actor_user_id TEXT,
  previous_enabled INTEGER NOT NULL CHECK (previous_enabled IN (0, 1)),
  previous_request_limit INTEGER NOT NULL CHECK (previous_request_limit > 0),
  new_enabled INTEGER NOT NULL CHECK (new_enabled IN (0, 1)),
  new_request_limit INTEGER NOT NULL CHECK (new_request_limit > 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX agent_usage_threshold_audit_actor_index
  ON agent_usage_threshold_audit_records(actor_user_id, created_at DESC);

CREATE INDEX agent_usage_threshold_audit_period_index
  ON agent_usage_threshold_audit_records(period, created_at DESC);

CREATE TABLE agent_usage_suspension_audit_records (
  id TEXT PRIMARY KEY,
  subject_user_id TEXT NOT NULL,
  triggered_period TEXT NOT NULL
    CHECK (
      triggered_period IN (
        'last_15_minutes',
        'last_1_hour',
        'last_6_hours',
        'last_12_hours',
        'last_24_hours'
      )
    ),
  configured_threshold INTEGER NOT NULL CHECK (configured_threshold > 0),
  observed_request_count INTEGER NOT NULL CHECK (observed_request_count > 0),
  suspension_started_at INTEGER NOT NULL,
  suspension_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX agent_usage_suspension_audit_subject_index
  ON agent_usage_suspension_audit_records(subject_user_id, created_at DESC);

CREATE INDEX agent_usage_suspension_audit_expiry_index
  ON agent_usage_suspension_audit_records(suspension_expires_at DESC);

CREATE TRIGGER agent_request_events_reject_active_suspension
BEFORE INSERT ON agent_request_events
WHEN EXISTS (
  SELECT 1
  FROM users
  WHERE id = NEW.user_id
    AND role = 'client'
    AND status = 'active'
    AND ai_suspended_until > NEW.attempted_at
)
BEGIN
  SELECT RAISE(ABORT, 'AI_ACCOUNT_SUSPENDED');
END;

CREATE TRIGGER agent_request_events_record_usage_and_suspension
AFTER INSERT ON agent_request_events
BEGIN
  INSERT INTO agent_request_usage (
    user_id,
    review_request_count,
    rewrite_request_count,
    updated_at
  ) VALUES (
    NEW.user_id,
    CASE WHEN NEW.request_kind = 'review' THEN 1 ELSE 0 END,
    CASE WHEN NEW.request_kind = 'rewrite' THEN 1 ELSE 0 END,
    NEW.attempted_at
  )
  ON CONFLICT(user_id) DO UPDATE SET
    review_request_count =
      review_request_count + excluded.review_request_count,
    rewrite_request_count =
      rewrite_request_count + excluded.rewrite_request_count,
    updated_at = excluded.updated_at;

  UPDATE users
  SET ai_suspension_id = NEW.id,
      ai_suspended_at = NEW.attempted_at,
      ai_suspended_until = NEW.attempted_at + 21600,
      ai_suspension_period = (
        SELECT configuration.period
        FROM agent_usage_thresholds AS configuration
        WHERE configuration.enabled = 1
          AND (
            SELECT COUNT(*)
            FROM agent_request_events AS observed_event
            WHERE observed_event.user_id = NEW.user_id
              AND observed_event.attempted_at >=
                MAX(0, NEW.attempted_at - configuration.window_seconds)
              AND observed_event.attempted_at <= NEW.attempted_at
          ) > configuration.request_limit
        ORDER BY configuration.priority ASC
        LIMIT 1
      ),
      ai_suspension_threshold = (
        SELECT configuration.request_limit
        FROM agent_usage_thresholds AS configuration
        WHERE configuration.enabled = 1
          AND (
            SELECT COUNT(*)
            FROM agent_request_events AS observed_event
            WHERE observed_event.user_id = NEW.user_id
              AND observed_event.attempted_at >=
                MAX(0, NEW.attempted_at - configuration.window_seconds)
              AND observed_event.attempted_at <= NEW.attempted_at
          ) > configuration.request_limit
        ORDER BY configuration.priority ASC
        LIMIT 1
      ),
      ai_suspension_observed_count = (
        SELECT COUNT(*)
        FROM agent_request_events AS observed_event
        INNER JOIN agent_usage_thresholds AS configuration
          ON configuration.enabled = 1
        WHERE observed_event.user_id = NEW.user_id
          AND observed_event.attempted_at >=
            MAX(0, NEW.attempted_at - configuration.window_seconds)
          AND observed_event.attempted_at <= NEW.attempted_at
          AND (
            SELECT COUNT(*)
            FROM agent_request_events AS breach_event
            WHERE breach_event.user_id = NEW.user_id
              AND breach_event.attempted_at >=
                MAX(0, NEW.attempted_at - configuration.window_seconds)
              AND breach_event.attempted_at <= NEW.attempted_at
          ) > configuration.request_limit
        GROUP BY configuration.period, configuration.priority
        ORDER BY configuration.priority ASC
        LIMIT 1
      ),
      updated_at = NEW.attempted_at
  WHERE id = NEW.user_id
    AND role = 'client'
    AND status = 'active'
    AND (
      ai_suspended_until IS NULL OR
      ai_suspended_until <= NEW.attempted_at
    )
    AND EXISTS (
      SELECT 1
      FROM agent_usage_thresholds AS configuration
      WHERE configuration.enabled = 1
        AND (
          SELECT COUNT(*)
          FROM agent_request_events AS observed_event
          WHERE observed_event.user_id = NEW.user_id
            AND observed_event.attempted_at >=
              MAX(0, NEW.attempted_at - configuration.window_seconds)
            AND observed_event.attempted_at <= NEW.attempted_at
        ) > configuration.request_limit
    );

  INSERT INTO agent_usage_suspension_audit_records (
    id,
    subject_user_id,
    triggered_period,
    configured_threshold,
    observed_request_count,
    suspension_started_at,
    suspension_expires_at,
    created_at
  )
  SELECT
    ai_suspension_id,
    id,
    ai_suspension_period,
    ai_suspension_threshold,
    ai_suspension_observed_count,
    ai_suspended_at,
    ai_suspended_until,
    ai_suspended_at
  FROM users
  WHERE id = NEW.user_id AND ai_suspension_id = NEW.id;
END;
