PRAGMA foreign_keys = ON;

ALTER TABLE pipeline_articles ADD COLUMN published_by_user_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX pipeline_articles_client_publication_index
  ON pipeline_articles(
    published_by_user_id,
    status,
    published_at DESC
  );

CREATE TABLE client_company_summaries (
  client_user_id TEXT PRIMARY KEY,
  company_name TEXT,
  company_type TEXT,
  products_or_services_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(products_or_services_json)),
  short_description TEXT,
  recurring_subjects_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(recurring_subjects_json)),
  insufficient_information INTEGER NOT NULL DEFAULT 1
    CHECK (insufficient_information IN (0, 1)),
  source_article_count INTEGER NOT NULL DEFAULT 0
    CHECK (source_article_count >= 0),
  source_latest_published_at INTEGER,
  model_id TEXT,
  generated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  generated_by_user_id TEXT NOT NULL,
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by_user_id) REFERENCES users(id)
);

CREATE INDEX client_company_summaries_company_type_index
  ON client_company_summaries(company_type COLLATE NOCASE);

CREATE INDEX client_company_summaries_generated_index
  ON client_company_summaries(generated_at DESC);
