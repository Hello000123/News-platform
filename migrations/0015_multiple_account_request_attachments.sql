CREATE TABLE account_request_attachments_multiple (
  id TEXT PRIMARY KEY,
  account_request_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_request_id) REFERENCES account_requests(id) ON DELETE CASCADE
);

INSERT INTO account_request_attachments_multiple (
  id, account_request_id, storage_key, original_name,
  content_type, size_bytes, created_at
)
SELECT
  id, account_request_id, storage_key, original_name,
  content_type, size_bytes, created_at
FROM account_request_attachments;

DROP TABLE account_request_attachments;

ALTER TABLE account_request_attachments_multiple
  RENAME TO account_request_attachments;

CREATE INDEX account_request_attachments_request_index
  ON account_request_attachments(account_request_id, created_at, id);
