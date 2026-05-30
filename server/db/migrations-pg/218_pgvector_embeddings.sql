-- Migration 218: pgvector backend for the embeddings table (PATH B — additive, opt-in).
--
-- Adds a vector(1536) column + HNSW cosine index alongside the existing TEXT
-- `embedding` column, so the VectorStoreAdapter can use pgvector when the operator
-- sets VECTOR_BACKEND=pgvector. The default stays the in-process JS cosine store,
-- so without that env var this migration changes NO runtime behaviour.
--
-- OPERATOR PREREQUISITE: the pgvector extension must be installed on the Postgres
-- host (e.g. `apt install postgresql-16-pgvector`, or allowlisted on managed PG).
-- This migration attempts CREATE EXTENSION but treats failure as a NON-FATAL skip
-- (caught in the plpgsql block) so a deploy BEFORE the binary is installed cannot
-- abort the fail-fast migration chain. If pgvector is installed later, run
-- `POST /api/embeddings/backfill-vec` (idempotent) to add the column + index +
-- copy existing vectors — migration 218 will already be recorded as applied.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension unavailable (%) — skipping embedding_vec column. Install pgvector and run POST /api/embeddings/backfill-vec to enable VECTOR_BACKEND=pgvector.', SQLERRM;
    RETURN;
  END;

  -- Extension present — add the indexed vector column (idempotent).
  ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding_vec vector(1536);

  -- HNSW cosine index, partial on the canonical 1536-dim rows. Mixed-provider
  -- installs may also hold 768/512-dim rows (Ollama/Voyage) which stay TEXT-only
  -- and are searched with the in-process JS cosine path.
  CREATE INDEX IF NOT EXISTS idx_embeddings_vec_hnsw
    ON embeddings USING hnsw (embedding_vec vector_cosine_ops)
    WHERE embedding_dimension = 1536;
END
$$;
