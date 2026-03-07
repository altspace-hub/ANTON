-- Migration 028: Missing compound performance indexes (DB-07)
-- These indexes dramatically improve query performance on the most-read tables.
-- All use IF NOT EXISTS so the migration is safe to re-run.

-- messages: most common pattern is "all messages in a session, chronological"
CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON messages(session_id, created_at);

-- messages: filtering by role within a session (e.g., assistant messages only)
CREATE INDEX IF NOT EXISTS idx_messages_session_role
  ON messages(session_id, role, created_at);

-- audit_log: per-user analytics queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
  ON audit_log(user_id, created_at DESC);

-- audit_log: module-level analytics
CREATE INDEX IF NOT EXISTS idx_audit_log_module_created
  ON audit_log(module_id, created_at DESC);

-- sessions: user's recent sessions list (most common dashboard query)
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
  ON sessions(user_id, updated_at DESC);

-- sessions: filtering by module within a user's sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_module
  ON sessions(user_id, module_id);

-- knowledge_collections: searching by name
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_name
  ON knowledge_collections(name);

-- document_chunks: lookup by document name within folder
CREATE INDEX IF NOT EXISTS idx_chunks_folder_doc
  ON document_chunks(folder_path, document_name);
