CREATE TABLE article_presentations (
  article_id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  draft_source_updated_at INTEGER NOT NULL,
  draft_updated_by_user_id TEXT NOT NULL,
  draft_updated_at INTEGER NOT NULL,
  published_json TEXT,
  published_source_updated_at INTEGER,
  published_by_user_id TEXT,
  published_at INTEGER,
  FOREIGN KEY (article_id) REFERENCES pipeline_articles(id) ON DELETE CASCADE,
  FOREIGN KEY (draft_updated_by_user_id) REFERENCES users(id),
  FOREIGN KEY (published_by_user_id) REFERENCES users(id)
);

CREATE INDEX article_presentations_draft_editor_index
  ON article_presentations(draft_updated_by_user_id, draft_updated_at DESC);

CREATE INDEX article_presentations_publisher_index
  ON article_presentations(published_by_user_id, published_at DESC);
