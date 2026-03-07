-- Migration 033: Multi-tenant user isolation (DB-01, DB-02, DB-03)
-- Adds user_id to tables that currently allow any user to read any other user's data.
-- Also adds org_id for future multi-organisation support (DB-03).
-- All new columns default to 'default' so existing data continues to work in solo mode.

-- registered_folders: allows user-specific folder registrations
ALTER TABLE registered_folders ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE registered_folders ADD COLUMN org_id  TEXT NOT NULL DEFAULT 'default';

-- module_configs: allows per-user custom module configurations
ALTER TABLE module_configs ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE module_configs ADD COLUMN org_id  TEXT NOT NULL DEFAULT 'default';

-- projects: project scope per user/org
ALTER TABLE projects ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE projects ADD COLUMN org_id  TEXT NOT NULL DEFAULT 'default';

-- skills: per-user custom skills library
ALTER TABLE skills ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE skills ADD COLUMN org_id  TEXT NOT NULL DEFAULT 'default';

-- reviews: per-user review history
ALTER TABLE reviews ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE reviews ADD COLUMN org_id  TEXT NOT NULL DEFAULT 'default';

-- sessions: add org_id for future multi-org scoping (user_id already added in earlier migration)
ALTER TABLE sessions ADD COLUMN org_id TEXT NOT NULL DEFAULT 'default';

-- messages: add org_id for denormalised multi-org queries
ALTER TABLE messages ADD COLUMN org_id TEXT NOT NULL DEFAULT 'default';

-- Indexes for the new columns (fast per-user lookups)
CREATE INDEX IF NOT EXISTS idx_registered_folders_user ON registered_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_module_configs_user     ON module_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user           ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_user             ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user            ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org            ON sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_messages_org            ON messages(org_id);
