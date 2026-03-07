-- MGOV-01/02: Model policy governance tables
-- model_allowed: per-user model allowlist (NULL user_id = global default)
-- compliance_policy: per-module enforcement (forces specific model + thinking_level)

CREATE TABLE IF NOT EXISTS model_allowed (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,              -- NULL = global policy (applies to all users)
  model_id   TEXT NOT NULL,     -- model identifier, e.g. 'claude-opus-4-6'
  created_by TEXT,              -- admin user who set the policy
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_allowed_user ON model_allowed(user_id);

-- Global default: allow all models (insert to restrict)
-- Leave empty = all models allowed for everyone

CREATE TABLE IF NOT EXISTS compliance_policy (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id      TEXT NOT NULL UNIQUE,   -- e.g. 'gap-analysis'
  enforce_model  TEXT,                   -- NULL = no enforcement
  enforce_thinking TEXT,                 -- NULL = no enforcement (e.g. 'investigate')
  enforce_creativity TEXT,               -- NULL = no enforcement
  note           TEXT,                   -- Admin note / reason
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compliance_policy_module ON compliance_policy(module_id);
