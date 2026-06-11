-- Migration 223: run_artifacts — persist the assembled 7-layer system prompt +
-- pinned source manifest per assistant message (Core Experience Review 2026-06,
-- Wave 1 item 1.6 — the reproducibility keystone).
--
-- Before this, the composed system prompt evaporated after the API call and the
-- resolved knowledge sources were only console.logged (routes/claude.ts ~L630).
-- One row is written per persisted assistant message in the same onComplete
-- path that persists the message (fire-and-forget; failures are logged and
-- never break streaming) — see server/services/run-artifact-writer.ts.
--
-- Columns:
--   composed_prompt  Final system prompt string as passed to the LLM
--                    (static + dynamic when the cache-split composer was used).
--                    Capped at 2 MB by the writer; `truncated` flags capping and
--                    prompt_sha256 ALWAYS covers the full, untruncated prompt.
--   prompt_sha256    sha256 (hex) of the full composed prompt — the pin.
--   prompt_chars     Char length of the full prompt (pre-truncation).
--   layer_summary    JSONB array of { layer, chars, sha256 } for each
--                    identifiable prompt layer (org context, knowledge pack,
--                    atoms, knowledge additions, reference documents, …).
--   source_manifest  JSONB array of ResolvedSourceDetail — resolved knowledge
--                    sources with per-source content sha256 + char count + type
--                    + name/url/path + retrieved_at where content was available
--                    at resolve time (urls/local/uploaded/RAG chunks). Sources
--                    whose content never passes through the resolver (Claude
--                    built-in knowledge, native web_search tool results) carry
--                    contentHashed=false.

CREATE TABLE IF NOT EXISTS run_artifacts (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id      TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  composed_prompt TEXT,
  prompt_sha256   TEXT NOT NULL,
  prompt_chars    INTEGER NOT NULL DEFAULT 0,
  truncated       BOOLEAN NOT NULL DEFAULT FALSE,
  layer_summary   JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One artifact per assistant message (the writer relies on this for its
-- ON CONFLICT (message_id) DO NOTHING idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_artifacts_message ON run_artifacts(message_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_session ON run_artifacts(session_id);
