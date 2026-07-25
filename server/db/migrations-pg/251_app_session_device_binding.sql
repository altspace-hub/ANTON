-- 251_app_session_device_binding.sql
--
-- Bind Companion app sessions to the device that enrolled them, so that
-- unpairing a device actually ends its access.
--
-- THE BUG THIS CLOSES. revokeDevice() only ever did:
--     UPDATE app_devices SET revoked_at = NOW() ...
--     UPDATE app_push_tokens SET enabled = FALSE ...
-- It never touched app_session_tokens, and it could not have: the table had no
-- device_id, so there was no way to express "this device's sessions". Meanwhile
-- app-auth.ts authenticates on the token row + connected_users.status alone and
-- never joins app_devices. Net effect: unpairing a lost, stolen or ex-employee
-- phone revoked nothing. The holder of the plaintext token kept full access for
-- the remainder of the 30-day TTL (SESSION_TTL_MS in app-enrollment-service.ts),
-- while listDevices() filtered `revoked_at IS NULL` so the UI showed the device
-- as gone. The one control an operator reaches for was inert, and silently so.
--
-- NULLABLE on purpose. Sessions issued before this migration have no device
-- attribution and can never gain one retroactively. Rather than guess, the
-- application treats a NULL device_id as unattributable and revokeDevice()
-- clears those sessions for the affected user too — see the query there. New
-- sessions from completeEnrollment() always carry a device_id.
--
-- ON DELETE CASCADE is a backstop, not the mechanism: app_devices rows are
-- soft-revoked (revoked_at), never deleted, so the real revocation path is the
-- explicit DELETE in revokeDevice(). The cascade only matters if a device row is
-- ever hard-deleted, in which case orphaned sessions must not survive it.

ALTER TABLE app_session_tokens
  ADD COLUMN IF NOT EXISTS device_id TEXT
    REFERENCES app_devices(id) ON DELETE CASCADE;

-- revokeDevice() deletes by device_id on every unpair, so this index is on the
-- hot path of the security control itself.
CREATE INDEX IF NOT EXISTS idx_app_session_tokens_device
  ON app_session_tokens(device_id);
