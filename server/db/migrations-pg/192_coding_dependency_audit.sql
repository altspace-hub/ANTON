-- 192_coding_dependency_audit.sql — dependency audit results +
-- known-vulnerability tracking for the Coding area.
--
-- When a coding session updates package.json / requirements.txt / Cargo.toml,
-- the review engine can run an audit (pnpm audit / pip-audit / cargo audit /
-- govulncheck) and persist the findings here so they're auditable +
-- trendable over time. Distinct from coding_review_findings (those are
-- code-level findings; these are dependency-level).

CREATE TABLE IF NOT EXISTS coding_dependency_audits (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT,
  user_id             TEXT NOT NULL DEFAULT 'default',
  repo_uri            TEXT NOT NULL,
  audited_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  audit_tool          TEXT NOT NULL,                  -- 'pnpm_audit' / 'npm_audit' / 'pip_audit' / 'cargo_audit' / 'govulncheck' / 'snyk' / 'osv'
  manifest_path       TEXT,                           -- e.g. 'package.json', 'requirements.txt'
  manifest_sha256     TEXT,                           -- so we can dedupe re-audits of unchanged manifests
  total_dependencies  INTEGER,
  total_vulns         INTEGER DEFAULT 0,
  vulns_critical      INTEGER DEFAULT 0,
  vulns_high          INTEGER DEFAULT 0,
  vulns_medium        INTEGER DEFAULT 0,
  vulns_low           INTEGER DEFAULT 0,
  raw_output          JSONB,                          -- full tool output for traceability
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS coding_dependency_audits_user_repo_idx
  ON coding_dependency_audits(user_id, repo_uri, audited_at DESC);

CREATE INDEX IF NOT EXISTS coding_dependency_audits_session_idx
  ON coding_dependency_audits(session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coding_dependency_audits_recent_idx
  ON coding_dependency_audits(audited_at DESC);

-- Per-vulnerability detail: one row per CVE / advisory, joined to audit.
CREATE TABLE IF NOT EXISTS coding_dependency_vulns (
  id                  TEXT PRIMARY KEY,
  audit_id            TEXT NOT NULL,
  package_name        TEXT NOT NULL,
  package_version     TEXT NOT NULL,
  advisory_id         TEXT,                           -- e.g. 'CVE-2024-12345' / 'GHSA-xxxx-yyyy-zzzz'
  severity            TEXT NOT NULL,                  -- 'critical' / 'high' / 'medium' / 'low' / 'info'
  title               TEXT NOT NULL,
  description_md      TEXT,
  fixed_in_version    TEXT,                           -- nullable when no fix available
  cwe                 TEXT,
  cvss_score          NUMERIC,
  is_direct_dep       BOOLEAN,                        -- true = listed in manifest; false = transitive
  status              TEXT NOT NULL DEFAULT 'open',   -- 'open' / 'fix_pending' / 'patched' / 'accepted_risk' / 'no_fix_available'
  resolved_at         TIMESTAMP,
  resolution_notes    TEXT
);

CREATE INDEX IF NOT EXISTS coding_dependency_vulns_audit_idx
  ON coding_dependency_vulns(audit_id);

CREATE INDEX IF NOT EXISTS coding_dependency_vulns_open_idx
  ON coding_dependency_vulns(severity, audit_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS coding_dependency_vulns_advisory_idx
  ON coding_dependency_vulns(advisory_id);
