-- 205_app_enrollment_transport.sql — Phase 0 of ANTON Mesh transport
--
-- Adds optional transport-routing columns to app_enrollment_tokens so a
-- pairing QR can specify HOW the device should reach the instance, not
-- just WHERE the instance lives. See docs/ANTON_MESH_SPEC.md §4.
--
-- Both columns are nullable. Existing rows + new rows that don't set them
-- behave exactly as before (the consumers default to 'public_https' when
-- transport is NULL). No data migration required.

ALTER TABLE app_enrollment_tokens
  ADD COLUMN IF NOT EXISTS transport TEXT NULL;

ALTER TABLE app_enrollment_tokens
  ADD COLUMN IF NOT EXISTS relay_endpoints TEXT NULL;

-- Cheap CHECK so a typo can't quietly land an unsupported transport.
-- We extend this enum as new transports ship; for now only the two are
-- recognised.
ALTER TABLE app_enrollment_tokens
  DROP CONSTRAINT IF EXISTS app_enrollment_tokens_transport_chk;

ALTER TABLE app_enrollment_tokens
  ADD CONSTRAINT app_enrollment_tokens_transport_chk
  CHECK (transport IS NULL OR transport IN ('public_https', 'mesh'));
