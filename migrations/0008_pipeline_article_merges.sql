ALTER TABLE pipeline_articles ADD COLUMN merged_into_article_id TEXT;

CREATE INDEX pipeline_articles_unmerged_status_index
  ON pipeline_articles(status, merged_into_article_id, created_at DESC);
