-- LONE-02: Standardise soft-delete across all tables to use is_archived BOOLEAN DEFAULT 0
-- Tables that previously had no soft-delete column now get one.
-- Existing tables that used deleted_at or is_deleted get an is_archived alias so both work during migration.

-- sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT 0 NOT NULL;

-- projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT 0 NOT NULL;

-- registered_folders
ALTER TABLE registered_folders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT 0 NOT NULL;

-- module_configs
ALTER TABLE module_configs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT 0 NOT NULL;

-- skills
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT 0 NOT NULL;

-- reviews (if table exists)
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  content TEXT,
  is_archived BOOLEAN DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- For tables that previously used `is_deleted`, migrate values to is_archived:
-- (Run only if the column exists — SQLite doesn't support IF EXISTS on UPDATE, handled at app layer)

-- Add index on is_archived for all high-traffic tables
CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(is_archived);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(is_archived);
CREATE INDEX IF NOT EXISTS idx_module_configs_archived ON module_configs(is_archived);
