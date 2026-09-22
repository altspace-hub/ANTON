-- 268 — the model-led intake conversation on an engagement (2026-09-08).
--
-- Scope and Client Intelligence were static forms (a 7-item checklist, then a
-- 16-field form) and every March engagement on this instance stalled there.
-- ANTON now interviews the consultant for those phases; the conversation is
-- kept on the engagement so it can continue across visits, and the values it
-- confirms are written to the same rows the forms edit.
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS intake_conversation TEXT NOT NULL DEFAULT '[]';
