CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, page_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  page_id TEXT,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS page_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_revisions_page ON page_revisions(page_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pages_archived ON pages(workspace_id, archived_at);
