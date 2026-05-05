-- ==============================
-- قاعدة بيانات موقع المانجا
-- ==============================

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS kvaults (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  api_key    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manga (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  cover       TEXT DEFAULT '',
  genres      TEXT DEFAULT '',
  status      TEXT DEFAULT 'ongoing',
  author      TEXT DEFAULT '',
  type        TEXT DEFAULT 'manhwa',
  rating      REAL DEFAULT 0,
  views       INTEGER DEFAULT 0,
  is_hot      INTEGER DEFAULT 0,
  is_new      INTEGER DEFAULT 0,
  kvault_id   INTEGER,
  kvault_path TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chapters (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id       INTEGER NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
  chapter_number REAL NOT NULL,
  chapter_name   TEXT DEFAULT '',
  images         TEXT DEFAULT '[]',
  views          INTEGER DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_manga_slug ON manga(slug);
CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id);
CREATE INDEX IF NOT EXISTS idx_manga_updated ON manga(updated_at DESC);

-- إعدادات افتراضية
INSERT OR IGNORE INTO settings VALUES ('site_name', 'مانجا كلاود');
INSERT OR IGNORE INTO settings VALUES ('site_description', 'اقرأ المانجا والمانهوا المترجمة');
INSERT OR IGNORE INTO settings VALUES ('primary_color', '#e63946');
INSERT OR IGNORE INTO settings VALUES ('secondary_color', '#ff6b6b');
INSERT OR IGNORE INTO settings VALUES ('bg_color', '#0a0a0f');
INSERT OR IGNORE INTO settings VALUES ('card_color', '#16161f');
INSERT OR IGNORE INTO settings VALUES ('accent_color', '#e63946');
INSERT OR IGNORE INTO settings VALUES ('hero_style', 'slider');
INSERT OR IGNORE INTO settings VALUES ('show_popular', '1');
INSERT OR IGNORE INTO settings VALUES ('show_latest', '1');
INSERT OR IGNORE INTO settings VALUES ('chapters_per_page', '20');
INSERT OR IGNORE INTO settings VALUES ('auto_import', '0');
INSERT OR IGNORE INTO settings VALUES ('auto_import_interval', '24');
