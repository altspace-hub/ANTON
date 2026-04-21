-- ── 155_markets_thesis_lifecycle.sql ─────────────────────────────────────────
-- Markets effectiveness M3 — thesis lifecycle bookkeeping.
--
-- Context: the April 2026 audit found 0 of 130 theses ever closed — status
-- had transitions (validated / invalidated / archived) but nothing ever
-- executed them. Theses accumulate indefinitely, drown the dashboard, and
-- the system learns nothing from which ones actually played out.
--
-- This migration adds the minimal columns the new lifecycle service needs
-- to record when + why a thesis closed. No behaviour change by itself —
-- the service in market-thesis-lifecycle-service.ts does the reasoning.

ALTER TABLE market_theses
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE market_theses
  ADD COLUMN IF NOT EXISTS close_reason TEXT;

-- Fast path for the lifecycle sweep: find every non-terminal thesis in one
-- index scan (partial index — terminal rows stay out of the working set).
CREATE INDEX IF NOT EXISTS idx_market_theses_open
  ON market_theses (updated_at)
  WHERE status IN ('draft', 'active', 'monitoring');
