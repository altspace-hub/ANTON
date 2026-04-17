-- Migration 131: Companion App — security review fixes
--
-- Closes the CRITICAL / HIGH gaps surfaced by the Phase H multi-expert
-- review:
--
--   • C2  intended_user_id binding bypass — add `confirmation_code`
--         column. The admin reads the 6-digit code aloud; the device
--         must echo it on completion to prove the right human is
--         scanning the QR.
--   • H2  instance_identity.privkey stored plaintext — add
--         `privkey_encrypted` + `privkey_iv` columns. The service
--         writes encrypted bytes when INSTANCE_KEY_ENCRYPTION_KEY is
--         set; legacy plaintext rows are migrated on first read.
--   • Future: a dedicated push-token ownership view that the service
--         can JOIN against without rewriting every query.

ALTER TABLE app_enrollment_tokens
  ADD COLUMN IF NOT EXISTS confirmation_code TEXT;

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS privkey_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS privkey_iv BYTEA;
