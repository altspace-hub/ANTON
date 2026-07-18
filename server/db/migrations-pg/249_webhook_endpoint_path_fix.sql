-- Migration 249: correct advertised webhook endpoint paths.
--
-- webhook_triggers.endpoint_path was minted as '/api/webhooks/inbound/<id>', but the
-- public receiver is mounted at the root ('/webhooks/inbound/<id>') — outside the /api
-- auth+CSRF stack. The advertised URL therefore 404'd. New rows are minted correctly
-- (webhook-listener.ts); this backfills any pre-existing rows so their displayed URL
-- points at the path that actually receives.
UPDATE webhook_triggers
SET endpoint_path = '/webhooks/inbound/' || substring(endpoint_path from '[^/]+$')
WHERE endpoint_path LIKE '/api/webhooks/inbound/%';
