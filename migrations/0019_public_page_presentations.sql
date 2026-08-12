CREATE TABLE public_page_presentations (
  page_key TEXT PRIMARY KEY
    CHECK (page_key IN ('homepage', 'technology', 'social-enterprise')),
  draft_json TEXT NOT NULL,
  draft_source_updated_at INTEGER NOT NULL,
  draft_updated_by_user_id TEXT NOT NULL,
  draft_updated_at INTEGER NOT NULL,
  published_json TEXT,
  published_source_updated_at INTEGER,
  published_by_user_id TEXT,
  published_at INTEGER,
  FOREIGN KEY (draft_updated_by_user_id) REFERENCES users(id),
  FOREIGN KEY (published_by_user_id) REFERENCES users(id)
);

CREATE INDEX public_page_presentations_draft_editor_index
  ON public_page_presentations(draft_updated_by_user_id, draft_updated_at DESC);

CREATE INDEX public_page_presentations_publisher_index
  ON public_page_presentations(published_by_user_id, published_at DESC);
