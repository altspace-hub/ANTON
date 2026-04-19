-- ──────────────────────────────────────────────────────────────────────────────
-- 147_portal_capability_invocations.sql — Portals Phase 6: invocation inbox.
--
-- When a visitor's ANTON calls capability_invoke against a portal hosted on
-- this instance, the portal handler validates the input against the
-- capability's inputSchema and writes a row here. The portal owner picks up
-- the row from their Manage UI (or via a workflow) and either responds
-- inline (for synchronous capabilities like `inquire`) or processes
-- out-of-band (for `order` / `book` / `delegate` etc.).
--
-- Status lifecycle: pending → acknowledged → responded | rejected.
--
-- The structured response stored in `output` is what the visitor receives.
-- For verbs like `order` it contains the orderId + initial status; for
-- `inquire` it contains the inquiryId + (optionally) an inline answer.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_capability_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,

  -- Which capability the visitor invoked
  capability_id TEXT NOT NULL,
  capability_verb TEXT NOT NULL,
  aap_endpoint TEXT NOT NULL,

  -- Who is calling (visitor's ANTON contact hash; null for anonymous-allowed caps)
  visitor_contact_hash TEXT,

  -- The validated input payload
  input JSONB NOT NULL,

  -- The structured response sent back to the visitor.
  -- For verbs that return immediately (inquire, query) this is set at insert.
  -- For async verbs (order, book) this starts as a placeholder + status:'pending'.
  output JSONB,

  -- A portal-local stable identifier the visitor can quote later (e.g. ORD-2026-1234).
  response_id TEXT NOT NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending',           -- pending / acknowledged / responded / rejected
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,

  -- Audit / errors
  validation_warnings JSONB,                        -- non-blocking ajv warnings
  rejection_reason TEXT,                            -- when status=rejected

  metadata JSONB
);

CREATE INDEX IF NOT EXISTS ix_portal_capability_invocations_portal
  ON portal_capability_invocations(portal_id);
CREATE INDEX IF NOT EXISTS ix_portal_capability_invocations_status
  ON portal_capability_invocations(portal_id, status);
CREATE INDEX IF NOT EXISTS ix_portal_capability_invocations_visitor
  ON portal_capability_invocations(visitor_contact_hash) WHERE visitor_contact_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_portal_capability_invocations_received_at
  ON portal_capability_invocations(received_at DESC);

-- Real-time NOTIFY when a new invocation lands so the owner's UI can surface
-- it without polling. Payload: id + capability + status + visitor (hashed).
CREATE OR REPLACE FUNCTION notify_portal_invocation_change() RETURNS trigger AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'id', NEW.id,
    'portal_id', NEW.portal_id,
    'capability_id', NEW.capability_id,
    'status', NEW.status,
    'visitor', NEW.visitor_contact_hash,
    'changed_at', NOW()
  );
  PERFORM pg_notify('portal_invocation_change', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portal_invocation_notify ON portal_capability_invocations;
CREATE TRIGGER trg_portal_invocation_notify
  AFTER INSERT OR UPDATE OF status ON portal_capability_invocations
  FOR EACH ROW EXECUTE FUNCTION notify_portal_invocation_change();
