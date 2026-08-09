CREATE TABLE pipeline_rewrite_commits (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  output_language TEXT NOT NULL,
  requested_length_option TEXT,
  related_report_count INTEGER NOT NULL CHECK (related_report_count >= 1),
  validation_status TEXT NOT NULL
    CHECK (validation_status IN ('passed', 'passed_after_retry')),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 3),
  created_at INTEGER NOT NULL,
  UNIQUE (batch_id, article_id, requested_by_user_id),
  FOREIGN KEY (article_id) REFERENCES pipeline_articles(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX pipeline_rewrite_commits_user_batch_index
  ON pipeline_rewrite_commits(requested_by_user_id, batch_id, created_at DESC);
