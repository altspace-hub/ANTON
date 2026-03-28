-- Migration 097: Add reasoning/thinking columns to gap assessor tables
-- Persists AI reasoning so it survives page refresh and is available for review

ALTER TABLE gap_assessments
  ADD COLUMN IF NOT EXISTS synthesis_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS board_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS roadmap_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS batch_reasoning TEXT;

ALTER TABLE gap_iterations
  ADD COLUMN IF NOT EXISTS synthesis_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS board_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS roadmap_reasoning TEXT;
