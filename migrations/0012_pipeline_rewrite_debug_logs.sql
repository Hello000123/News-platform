CREATE TABLE pipeline_rewrite_debug_logs (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  article_id TEXT NOT NULL,
  article_title TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  output_language TEXT NOT NULL,
  requested_length_option TEXT,
  effective_length_option TEXT,
  related_report_count INTEGER NOT NULL DEFAULT 1,
  source_origin TEXT
    CHECK (source_origin IS NULL OR source_origin IN ('saved_scraper', 'live_page', 'rss_preview')),
  source_characters INTEGER,
  linked_characters INTEGER,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('success', 'failure')),
  validation_status TEXT
    CHECK (validation_status IS NULL OR validation_status IN ('passed', 'passed_after_retry')),
  attempts INTEGER,
  error_code TEXT,
  error_message TEXT,
  error_details_json TEXT NOT NULL DEFAULT '[]',
  retryable INTEGER
    CHECK (retryable IS NULL OR retryable IN (0, 1)),
  stage TEXT
    CHECK (stage IS NULL OR stage IN ('review_request', 'rewrite_request')),
  provider TEXT,
  provider_model TEXT,
  provider_http_status INTEGER,
  cause_summary TEXT,
  quotation_issue_kinds_json TEXT NOT NULL DEFAULT '[]',
  quotation_issue_count INTEGER NOT NULL DEFAULT 0,
  candidate_characters INTEGER,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX pipeline_rewrite_debug_created_index
  ON pipeline_rewrite_debug_logs(created_at DESC);

CREATE INDEX pipeline_rewrite_debug_batch_index
  ON pipeline_rewrite_debug_logs(batch_id, created_at DESC);

CREATE INDEX pipeline_rewrite_debug_article_index
  ON pipeline_rewrite_debug_logs(article_id, created_at DESC);

CREATE INDEX pipeline_rewrite_debug_user_index
  ON pipeline_rewrite_debug_logs(requested_by_user_id, created_at DESC);
