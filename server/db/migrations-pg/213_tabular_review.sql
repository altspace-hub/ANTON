-- Wave 1 — Tabular Review workspace (May 23 2026).
--
-- "Drop a folder of N documents, get an N×M grid of AI-answered cells."
-- One row per document, one column per playbook question. Each cell is an
-- independent Claude call running through a bounded-parallelism executor.
--
-- The MVP ships ONE hardcoded playbook (AMLR Obligation Mapping). Wave 2
-- introduces a `tabular_review_playbooks` table; Wave 1 stores only the
-- playbook ID string per run so the migration is forward-compatible.
--
-- Cells are append-only-ish: a cell row exists from creation as `pending`
-- and gets updated in place to `running` → `done` | `error`. The executor
-- never deletes cells; a re-run UPDATEs the same (run_id, doc_id, column_id)
-- triple (Wave 2 will use a per-cell `attempt` int if needed).

CREATE TABLE IF NOT EXISTS tabular_review_runs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  playbook_id     TEXT NOT NULL,
  -- Snapshot of the playbook definition at run-time so the run remains
  -- replayable even if the playbook source changes later.
  playbook_snapshot JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'done', 'error', 'cancelled')),
  total_cells     INT NOT NULL DEFAULT 0,
  completed_cells INT NOT NULL DEFAULT 0,
  failed_cells    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_tabular_review_runs_user_created
  ON tabular_review_runs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tabular_review_documents (
  run_id          TEXT NOT NULL REFERENCES tabular_review_runs(id) ON DELETE CASCADE,
  doc_id          TEXT NOT NULL,                -- stable per-run id (UUID)
  file_name       TEXT NOT NULL,
  byte_size       INT NOT NULL DEFAULT 0,
  -- The plaintext extracted from the upload. Truncated to ~30K chars per
  -- doc on insert so a 1000-page PDF doesn't blow up Claude calls or the
  -- DB row. Wave 2 will chunk; Wave 1 keeps the prefix.
  text_excerpt    TEXT NOT NULL,
  text_truncated  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, doc_id)
);

CREATE TABLE IF NOT EXISTS tabular_review_cells (
  run_id          TEXT NOT NULL REFERENCES tabular_review_runs(id) ON DELETE CASCADE,
  doc_id          TEXT NOT NULL,                -- matches tabular_review_documents.doc_id
  column_id       TEXT NOT NULL,                -- column key from playbook_snapshot.columns[].id
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'covered', 'partial', 'missing',
                                       'not_applicable', 'error')),
  -- Structured result from the per-cell Claude call. Shape:
  --   { status, evidence, rationale, model, input_tokens, output_tokens }
  -- `null` while pending / running; populated on completion.
  result          JSONB,
  model_used      TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (run_id, doc_id, column_id)
);

CREATE INDEX IF NOT EXISTS idx_tabular_review_cells_run_status
  ON tabular_review_cells(run_id, status);

COMMENT ON TABLE tabular_review_runs IS
  'A single tabular-review job: one playbook applied to N documents. Wave 1 (May 23 2026).';
COMMENT ON TABLE tabular_review_documents IS
  'The documents inside a run. Text is denormalised onto the run so the run is self-contained for re-export.';
COMMENT ON TABLE tabular_review_cells IS
  'One row per (run × doc × column). Updated in place; the grid the user sees is just SELECT * FROM here for a given run_id.';
