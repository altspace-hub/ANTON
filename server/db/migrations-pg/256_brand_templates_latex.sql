-- 256_brand_templates_latex.sql
--
-- Let a company upload its actual LaTeX house style.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
--
-- The latex-source renderer already honours a company `\documentclass` and
-- preamble taken from the brand config, so a firm can say
-- `latex_documentclass: "acmecorp"` and get `\documentclass{acmecorp}` at the
-- top of every export. But `acmecorp.cls` itself had nowhere to live:
-- brand_templates only accepted 'docx' and 'pptx', enforced both by a multer
-- allowlist in routes/templates.ts and by this CHECK constraint. The result was
-- a .tex naming a class the recipient did not have — a file that cannot compile
-- anywhere except on a machine that already has the house style installed,
-- which is precisely the machine that did not need the export.
--
-- ── Why 'latex' and not 'cls' / 'sty' / 'bib' ───────────────────────────────
--
-- The `type` column is what the application dispatches on: a docx template is
-- used by the DOCX exporter, a pptx template by the PPTX exporter. A class file,
-- a style package and a bibliography are all consumed by the SAME exporter and
-- are all shipped together in one bundle, so they are one type. The real file
-- extension survives in `file_path` (and now `original_name`), which is where an
-- extension belongs; splitting the type column three ways would have forced
-- every consumer to know that 'cls', 'sty' and 'bib' mean "ask the LaTeX
-- renderer" while adding nothing.
--
-- ── Why a NEW migration ─────────────────────────────────────────────────────
--
-- The constraint lives in schema.postgresql.sql, which is re-run at every boot
-- with CREATE TABLE IF NOT EXISTS — so editing it there changes fresh installs
-- ONLY and leaves every existing database on the narrow constraint. That is the
-- exact divergence 204/254 produced and that tests/db/migration-schema-drift.ts
-- now guards against. The widening therefore happens here, where it reaches both
-- populations, and schema.postgresql.sql is deliberately left alone.

-- ── original_name ───────────────────────────────────────────────────────────
--
-- LaTeX resolves `\documentclass{acmecorp}` by looking for a file literally
-- named `acmecorp.cls` on TEXINPUTS. Uploads are stored on disk under a random
-- UUID (deliberately — the on-disk name must not be caller-controlled), so
-- without the original filename the bundled class file would arrive as
-- `9f3c…-1a.cls` and no document could ever load it. `name` is not a substitute:
-- it is a free-text display label the uploader can set to anything, including
-- something with no extension or a path separator in it.
ALTER TABLE brand_templates ADD COLUMN IF NOT EXISTS original_name TEXT;

COMMENT ON COLUMN brand_templates.original_name IS
  'Sanitised upload filename, e.g. acmecorp.cls. LaTeX resolves \documentclass{X} to the file X.cls, so the bundled name must be the real one and not the UUID the file is stored under. NULL for rows uploaded before this column existed.';

-- ── Widen the type CHECK ────────────────────────────────────────────────────
--
-- The constraint is auto-named by PostgreSQL (`brand_templates_type_check` on
-- every install seen so far), but the name is an implementation detail of
-- whichever server version created the table, so this drops whatever CHECK
-- constraints actually reference the `type` column rather than trusting a
-- literal name. Dropping by column, re-adding by explicit name, makes the
-- migration idempotent: run it twice and the second pass drops the constraint
-- this pass created and recreates it identically.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  FOR con_name IN
    SELECT DISTINCT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'brand_templates'::regclass
       AND c.contype = 'c'
       AND a.attname = 'type'
  LOOP
    EXECUTE format('ALTER TABLE brand_templates DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE brand_templates
  ADD CONSTRAINT brand_templates_type_check
  CHECK (type IN ('docx', 'pptx', 'latex'));

COMMENT ON COLUMN brand_templates.type IS
  'Which exporter consumes this template: docx, pptx, or latex (a .cls / .sty / .bib shipped with the .tex export).';
