ALTER TABLE agent_usage_thresholds
  ADD COLUMN suspension_duration_seconds INTEGER NOT NULL DEFAULT 21600
  CHECK (
    suspension_duration_seconds BETWEEN 36 AND 31536000 AND
    suspension_duration_seconds % 36 = 0
  );

ALTER TABLE agent_usage_threshold_audit_records
  ADD COLUMN previous_suspension_duration_seconds INTEGER NOT NULL DEFAULT 21600
  CHECK (
    previous_suspension_duration_seconds BETWEEN 36 AND 31536000 AND
    previous_suspension_duration_seconds % 36 = 0
  );

ALTER TABLE agent_usage_threshold_audit_records
  ADD COLUMN new_suspension_duration_seconds INTEGER NOT NULL DEFAULT 21600
  CHECK (
    new_suspension_duration_seconds BETWEEN 36 AND 31536000 AND
    new_suspension_duration_seconds % 36 = 0
  );

DROP TRIGGER agent_request_events_record_usage_and_suspension;

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
