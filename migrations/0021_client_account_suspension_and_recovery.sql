ALTER TABLE users ADD COLUMN manual_suspended_at INTEGER;
ALTER TABLE users ADD COLUMN manual_suspension_reason TEXT;
ALTER TABLE users
  ADD COLUMN manual_suspended_by_user_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX users_manual_suspension_index
  ON users(role, manual_suspended_at DESC)
  WHERE manual_suspended_at IS NOT NULL;

CREATE TABLE client_account_suspension_audit_records (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL
    CHECK (action IN ('manual_suspended', 'recovered')),
  reason TEXT,
  recovered_manual_suspension INTEGER NOT NULL DEFAULT 0
    CHECK (recovered_manual_suspension IN (0, 1)),
  recovered_automatic_suspension INTEGER NOT NULL DEFAULT 0
    CHECK (recovered_automatic_suspension IN (0, 1)),
  created_at INTEGER NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'not_attempted'
    CHECK (
      email_status IN ('not_attempted', 'pending', 'sent', 'preview', 'failed')
    ),
  provider_message_id TEXT,
  email_error_code TEXT,
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (
    (
      action = 'manual_suspended' AND
      reason IS NOT NULL AND
      recovered_manual_suspension = 0 AND
      recovered_automatic_suspension = 0
    ) OR (
      action = 'recovered' AND
      reason IS NULL AND
      (
        recovered_manual_suspension = 1 OR
        recovered_automatic_suspension = 1
      )
    )
  )
);

CREATE INDEX client_account_suspension_client_index
  ON client_account_suspension_audit_records(client_user_id, created_at DESC);

CREATE INDEX client_account_suspension_actor_index
  ON client_account_suspension_audit_records(actor_user_id, created_at DESC);

DROP TRIGGER agent_request_events_reject_active_suspension;
DROP TRIGGER agent_request_events_record_usage_and_suspension;

CREATE TRIGGER agent_request_events_reject_active_suspension
BEFORE INSERT ON agent_request_events
WHEN EXISTS (
  SELECT 1
  FROM users
  WHERE id = NEW.user_id
    AND role = 'client'
    AND status = 'active'
    AND (
      manual_suspended_at IS NOT NULL OR
      ai_suspended_until > NEW.attempted_at
    )
)
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNT_SUSPENDED');
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
      ai_suspended_until = NEW.attempted_at + (
        SELECT configuration.suspension_duration_seconds
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
    AND manual_suspended_at IS NULL
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

  UPDATE sessions
  SET revoked_at = NEW.attempted_at
  WHERE user_id = NEW.user_id
    AND revoked_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM users
      WHERE id = NEW.user_id AND ai_suspension_id = NEW.id
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
