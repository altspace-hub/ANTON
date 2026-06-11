-- Migration 226: Wave 3 feedback valves + atom-layer A/B experiment
-- (CORE_EXPERIENCE_REVIEW 2026-06, items 3.3 + 3.4)
--
-- 3.3  output_feedback gains a 1-click verdict lane: the standard output
--      footer writes verdict ('good' | 'needs_work') + the exact assistant
--      message_id it rates. The existing 1-5 star path (quality-ratchet
--      submitFeedback) keeps writing `rating`; verdict-only rows carry
--      rating = NULL, so `rating` loses its NOT NULL. A row must carry at
--      least one of the two signals.
--
-- 3.4  audit_log.atom_arm tags every persisted run with its A/B arm:
--      'injected' (atom layer built as usual) or 'holdout' (~20% of runs,
--      deterministically held out so the atom layer's effect on quality
--      scores can finally be MEASURED instead of assumed). NULL = run was
--      not part of the experiment (injection off, experiment off, or
--      pre-experiment history).

-- ── 3.3 output_feedback: message-level 1-click verdict ──────────────────────

ALTER TABLE output_feedback
  ADD COLUMN IF NOT EXISTS message_id TEXT;

ALTER TABLE output_feedback
  ADD COLUMN IF NOT EXISTS verdict TEXT;

ALTER TABLE output_feedback
  ALTER COLUMN rating DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE output_feedback
    ADD CONSTRAINT output_feedback_verdict_check
    CHECK (verdict IS NULL OR verdict IN ('good', 'needs_work'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every row must carry at least one signal (all pre-existing rows have a
-- rating, so this validates cleanly).
DO $$ BEGIN
  ALTER TABLE output_feedback
    ADD CONSTRAINT output_feedback_signal_check
    CHECK (rating IS NOT NULL OR verdict IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_output_feedback_message
  ON output_feedback(message_id) WHERE message_id IS NOT NULL;

-- ── 3.4 audit_log: A/B arm tag ───────────────────────────────────────────────

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS atom_arm TEXT;

DO $$ BEGIN
  ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_atom_arm_check
    CHECK (atom_arm IS NULL OR atom_arm IN ('injected', 'holdout'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_audit_log_atom_arm
  ON audit_log(atom_arm) WHERE atom_arm IS NOT NULL;
