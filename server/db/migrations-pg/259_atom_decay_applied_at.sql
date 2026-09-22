-- 259_atom_decay_applied_at.sql
--
-- Makes atom decay idempotent, so it can run daily without compounding.
--
-- The old loop computed newConfidence from the CURRENT stored confidence and
-- the age since created_at. Run once that is right; run daily it decays by the
-- full lifetime age every time and collapses every atom to zero within days.
-- It never bit only because the function threw on its first statement and has
-- never actually completed (2026-08-27: 0 of 161,569 atoms had ever been
-- deactivated).
--
-- Exponential decay is memoryless, so decaying by the time elapsed since the
-- last decay composes exactly to decaying from creation. This column is that
-- marker. NULL means "never decayed", and the calculation falls back to
-- created_at, which is correct for every existing row.

ALTER TABLE market_atoms
  ADD COLUMN IF NOT EXISTS decay_applied_at TIMESTAMPTZ;

-- The decay pass scans active atoms only.
CREATE INDEX IF NOT EXISTS idx_market_atoms_active_decay
  ON market_atoms (is_active, decay_applied_at)
  WHERE is_active = 1;
