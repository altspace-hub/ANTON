-- Migration 096: Add unique constraint for gap_findings upsert
-- Required for ON CONFLICT (assessment_id, framework, article_id) DO UPDATE

CREATE UNIQUE INDEX IF NOT EXISTS gap_findings_assessment_framework_article_idx
  ON gap_findings (assessment_id, framework, article_id);
