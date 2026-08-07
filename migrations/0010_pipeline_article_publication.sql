ALTER TABLE pipeline_articles ADD COLUMN published_at INTEGER;

CREATE INDEX pipeline_articles_publication_index
  ON pipeline_articles(status, published_at DESC);
