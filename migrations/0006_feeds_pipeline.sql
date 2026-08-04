PRAGMA foreign_keys = ON;

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused')),
  last_fetched_at INTEGER,
  last_fetched_ok INTEGER NOT NULL DEFAULT 1
    CHECK (last_fetched_ok IN (0, 1)),
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by_user_id TEXT NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX feeds_status_index ON feeds(status);

CREATE TABLE pipeline_articles (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT,
  author TEXT,
  pub_date INTEGER,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'rewritten', 'approved', 'discarded')),
  rewritten_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE INDEX pipeline_articles_feed_index
  ON pipeline_articles(feed_id, pub_date DESC);

CREATE INDEX pipeline_articles_status_index
  ON pipeline_articles(status, created_at DESC);
