-- GOV-02: Add system_prompt_version_id to audit_log
-- Links every AI request in the audit trail to the exact system prompt version that was active.
-- NULL = no versioned prompt registered for that module (graceful fallback).

ALTER TABLE audit_log ADD COLUMN system_prompt_version_id TEXT REFERENCES system_prompts(id);

CREATE INDEX IF NOT EXISTS idx_audit_log_prompt_version
  ON audit_log(system_prompt_version_id)
  WHERE system_prompt_version_id IS NOT NULL;
