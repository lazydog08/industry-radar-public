CREATE TABLE IF NOT EXISTS source_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT,
  category TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  raw_excerpt TEXT,
  raw_json TEXT,
  hash TEXT NOT NULL UNIQUE,
  heat_score REAL DEFAULT 0,
  engagement_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_items_source_time ON source_items(source, published_at);
CREATE INDEX IF NOT EXISTS idx_source_items_hash ON source_items(hash);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  summary TEXT NOT NULL,
  what_happened TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  creator_impact TEXT NOT NULL,
  content_angle TEXT NOT NULL,
  cover_angle TEXT NOT NULL,
  category TEXT NOT NULL,
  importance_score REAL NOT NULL,
  worth_following INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_count INTEGER NOT NULL DEFAULT 1,
  embedding_provider TEXT,
  embedding_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_time ON events(first_seen_at, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_score ON events(importance_score);

CREATE TABLE IF NOT EXISTS event_sources (
  event_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id, source_item_id),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(source_item_id) REFERENCES source_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_sources_event ON event_sources(event_id);
CREATE INDEX IF NOT EXISTS idx_event_sources_source ON event_sources(source);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  UNIQUE(name, type)
);

CREATE TABLE IF NOT EXISTS event_entities (
  event_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY(event_id, entity_id),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS event_tags (
  event_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY(event_id, tag_id),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  html_path TEXT NOT NULL,
  markdown_path TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_type_time ON reports(report_type, window_start);

CREATE TABLE IF NOT EXISTS report_events (
  report_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  section TEXT NOT NULL,
  is_new INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(report_id, event_id, section),
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_feedback (
  event_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(event_id, feedback_type),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_logs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  error_summary TEXT,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  filters TEXT,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS event_fts USING fts5(
  event_id UNINDEXED,
  title,
  summary,
  what_happened,
  why_it_matters,
  creator_impact,
  content_angle,
  tags,
  entities,
  tokenize='unicode61'
);
