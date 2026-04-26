-- 189_coding_review_findings.sql — review findings register + severity
-- workflow for the Coding area's review-engine.
--
-- The coding-review-engine generates structured findings per code review
-- (security, performance, correctness, style, etc). This migration adds
-- the persistent register so findings can be triaged, fixed, and audited
-- across sessions — not lost as transient LLM output.

CREATE TABLE IF NOT EXISTS coding_review_findings (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT,                           -- coding_sessions.id where the finding was raised
  user_id             TEXT NOT NULL DEFAULT 'default',
  detected_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finding_category    TEXT NOT NULL,                  -- 'security' / 'performance' / 'correctness' / 'style' / 'accessibility' / 'tests' / 'docs' / 'maintainability'
  severity            TEXT NOT NULL DEFAULT 'medium', -- 'critical' / 'high' / 'medium' / 'low' / 'info'
  rule_code           TEXT,                           -- short code, e.g. 'sec-001-sql-injection'
  title               TEXT NOT NULL,
  description_md      TEXT NOT NULL,
  file_path           TEXT,
  line_start          INTEGER,
  line_end            INTEGER,
  suggested_fix_md    TEXT,
  status              TEXT NOT NULL DEFAULT 'open',   -- 'open' / 'in_progress' / 'fixed' / 'dismissed' / 'wontfix' / 'duplicate'
  resolved_at         TIMESTAMP,
  resolved_by         TEXT,
  resolution_notes    TEXT,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS coding_review_findings_user_idx
  ON coding_review_findings(user_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS coding_review_findings_session_idx
  ON coding_review_findings(session_id);

CREATE INDEX IF NOT EXISTS coding_review_findings_open_idx
  ON coding_review_findings(severity, detected_at DESC) WHERE status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS coding_review_findings_category_idx
  ON coding_review_findings(finding_category, severity);

-- Lightweight ruleset registry: what rule codes the review engine knows
-- about, with optional pack_id for community-curated rule packs.

CREATE TABLE IF NOT EXISTS coding_review_rules (
  rule_code           TEXT PRIMARY KEY,
  category            TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  description_md      TEXT,
  default_severity    TEXT NOT NULL DEFAULT 'medium',
  applies_languages   JSONB DEFAULT '[]',             -- empty = all langs; or e.g. ["typescript","javascript"]
  pack_id             TEXT,                            -- optional grouping
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS coding_review_rules_pack_idx
  ON coding_review_rules(pack_id) WHERE is_active = TRUE;

-- Anchor seeds — 5 baseline rules covering OWASP-flavoured concerns.
INSERT INTO coding_review_rules (rule_code, category, display_name, description_md, default_severity) VALUES
  ('sec-001-sql-injection',
   'security', 'SQL injection risk',
   'String concatenation into SQL query detected. Use parameterised queries (`db.run("SELECT ... WHERE id = ?", id)`) instead.',
   'critical'),
  ('sec-002-shell-injection',
   'security', 'Shell injection risk',
   'Use of `shell: true` or template-literal command construction detected. Use `execFile()` with arg arrays.',
   'critical'),
  ('sec-003-secret-leak',
   'security', 'Possible secret in logs / output',
   'String matching credential / token / api_key / password pattern in log statement. Log IDs and event types only.',
   'high'),
  ('correctness-001-missing-await',
   'correctness', 'Async function called without await',
   'Async function returning a Promise is invoked without `await`. Likely bug — the Promise is unawaited.',
   'high'),
  ('perf-001-n-plus-1',
   'performance', 'Possible N+1 query',
   'Loop over an array with a DB query inside. Consider batching with `IN (?,?,?)` or a single JOIN.',
   'medium')
ON CONFLICT (rule_code) DO NOTHING;
