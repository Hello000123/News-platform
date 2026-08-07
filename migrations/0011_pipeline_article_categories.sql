ALTER TABLE pipeline_articles ADD COLUMN category TEXT
  CHECK (category IN ('technology', 'social-enterprise'));

UPDATE pipeline_articles
SET category = CASE
  WHEN feed_id IN (
    SELECT id FROM feeds
    WHERE name LIKE '%社企%' OR lower(name) LIKE '%social enterprise%'
  ) THEN 'social-enterprise'
  WHEN feed_id IN (
    SELECT id FROM feeds
    WHERE name LIKE '%科技%' OR lower(name) LIKE '%technology%' OR lower(name) LIKE '%tech%'
  ) THEN 'technology'
  ELSE NULL
END
WHERE category IS NULL;

CREATE INDEX pipeline_articles_category_publication_index
  ON pipeline_articles(category, status, published_at DESC);
