-- Migration 220: A2A transport — three constraints that break every real
-- cross-instance exchange (found by the two-instance verification ladder,
-- plan item 3.5, tests/a2a/two-instance.integration.test.ts).
--
-- 1. missions.mission_delegation_log.event
--    The CHECK from migration 120 allows 14 event values, but
--    mission-delegation.ts writes 23 distinct ones (e.g. 'accept_notified',
--    'peer_accepted', 'status_update_ignored', 'subgraph_built',
--    'payment_proposed', 'result_ingested'). The first inbound ACCEPT threw
--    on the audit INSERT — and the catch-handler's own logEvent
--    ('accept_notify_failed') threw too — so the Phase-A accept/decline
--    notification loop could never complete against real PostgreSQL.
--    The live dev database had ZERO rows in this table, confirming the leg
--    never ran end-to-end. An append-only audit log must never reject new
--    vocabulary at the cost of breaking the feature it audits: drop the CHECK.
--
-- 2. community_message_queue.delivery_method
--    Migration 089 allowed ('local','http','relay'); Track A5 renamed the
--    transport outcome values to 'https' / 'mesh' (peer-transport-service).
--    Every SUCCESSFUL remote delivery therefore threw at the bookkeeping
--    UPDATE ("SET delivery_method = 'https'"), leaving the queue row pending
--    forever — the peer received the message but the sender retried it as
--    failed. Extend the CHECK with the current vocabulary (legacy 'http'
--    kept for existing rows).

-- 3. beehive_message_log.hive_id FK → beehive_sessions(id)
--    beehive-protocol.ts audits EVERY inbound message BEFORE applying it
--    (handleInbound → auditLog → applyInvite/applyStateSync). The very first
--    'hive:invite' (or bootstrap 'hive:state_sync') from a remote Queen
--    references a hive the recipient does not know yet, so the audit INSERT
--    violated the FK and the whole inbound message was rejected — multi-
--    instance Beehive could never bootstrap. The audit log must accept
--    messages about not-yet-known hives; drop the FK (hive_id stays indexed).

ALTER TABLE missions.mission_delegation_log
  DROP CONSTRAINT IF EXISTS mission_delegation_log_event_check;

ALTER TABLE community_message_queue
  DROP CONSTRAINT IF EXISTS community_message_queue_delivery_method_check;

ALTER TABLE community_message_queue
  ADD CONSTRAINT community_message_queue_delivery_method_check
  CHECK (delivery_method IN ('local', 'http', 'https', 'mesh', 'relay'));

ALTER TABLE beehive_message_log
  DROP CONSTRAINT IF EXISTS beehive_message_log_hive_id_fkey;

CREATE INDEX IF NOT EXISTS idx_beehive_message_log_hive ON beehive_message_log(hive_id, sequence);
