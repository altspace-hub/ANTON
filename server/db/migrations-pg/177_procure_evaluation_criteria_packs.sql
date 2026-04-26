-- 177_procure_evaluation_criteria_packs.sql — reusable evaluation-criteria
-- packs + scorecard snapshots for the Procure pillar.
--
-- Phase B.2 follow-on. Extends the per-cycle evaluation criteria from
-- mig 091 with reusable per-category packs (so a "SaaS-procurement
-- standard criteria" pack can be applied to any cycle in the saas-tools
-- category) and stores point-in-time scorecard snapshots for audit.

CREATE TABLE IF NOT EXISTS procure_criteria_packs (
  id                TEXT PRIMARY KEY,
  pack_name         TEXT NOT NULL,
  category          TEXT NOT NULL,
  jurisdiction      TEXT,
  criteria          JSONB NOT NULL,          -- array of { code, label, weight, scale: 1-5 | 1-10, guidance }
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source            TEXT                      -- 'seed' / 'user' / 'community-pack'
);

CREATE INDEX IF NOT EXISTS procure_criteria_packs_category_idx
  ON procure_criteria_packs(category) WHERE is_active = TRUE;

-- Seed one anchor: standard SaaS-procurement criteria. Contributors can
-- add jurisdiction-specific overlays (EU GDPR addendum, US SOC2 emphasis, etc).
INSERT INTO procure_criteria_packs (id, pack_name, category, jurisdiction, criteria, source) VALUES
  ('pack_saas_standard_v1',
   'SaaS — standard evaluation criteria',
   'saas-tools',
   NULL,
   '[
     {"code": "fit",        "label": "Functional fit",            "weight": 0.30, "scale": "1-5", "guidance": "Does the product cover the must-haves identified in the requirements?"},
     {"code": "security",   "label": "Security posture",          "weight": 0.20, "scale": "1-5", "guidance": "Certifications (SOC2, ISO27001), data residency, encryption, audit logs."},
     {"code": "tco",        "label": "Total cost of ownership",   "weight": 0.20, "scale": "1-5", "guidance": "Subscription + onboarding + integration + training. Lower TCO = higher score."},
     {"code": "support",    "label": "Vendor support quality",    "weight": 0.10, "scale": "1-5", "guidance": "SLA terms, response times, named-contact availability, community size."},
     {"code": "lock_in",    "label": "Switching cost / lock-in",  "weight": 0.10, "scale": "1-5", "guidance": "Data export options, contract length, switching cost. Low lock-in = high score."},
     {"code": "roadmap",    "label": "Vendor roadmap fit",        "weight": 0.10, "scale": "1-5", "guidance": "Vendor''s public roadmap aligns with our 12-month direction?"}
   ]'::jsonb,
   'seed')
ON CONFLICT (id) DO NOTHING;

-- Scorecard snapshots: when a cycle is closed, snapshot the scoring
-- matrix that drove the decision. This makes audits + post-mortems
-- much easier — the cycle's live evaluation_criteria can keep evolving
-- after close without rewriting history.

CREATE TABLE IF NOT EXISTS procure_scorecard_snapshots (
  id                TEXT PRIMARY KEY,
  cycle_id          TEXT NOT NULL,
  taken_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  taken_by          TEXT,
  snapshot          JSONB NOT NULL,          -- { vendors: [...], criteria: [...], scores: [[...]], winner: id }
  rationale_md      TEXT,
  immutable         BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS procure_scorecard_snapshots_cycle_idx
  ON procure_scorecard_snapshots(cycle_id, taken_at DESC);
