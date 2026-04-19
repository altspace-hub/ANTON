-- ──────────────────────────────────────────────────────────────────────────────
-- 149_portal_performance_indexes.sql — Portals scaling fixes from expert audit.
--
-- Adds five missing indexes that prevent sequential scans on hot paths:
--
--   1. (metadata->>'ownerId')             — every "list my portals" query
--   2. status (partial WHERE public_index) — search-engine candidate set
--   3. capability_summary (GIN, jsonb_path_ops)
--                                          — verb / tag / serviceArea / language
--                                            filters that previously pulled the
--                                            full JSONB column to JS for filtering
--   4. (status, received_at DESC)         — inbox status + recency queries
--   5. (portal_id, sort_order, path)      — page list ordering
--
-- Idempotent (CREATE INDEX IF NOT EXISTS throughout).
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Owner expression index — drives GET /portals scoped to caller.
CREATE INDEX IF NOT EXISTS ix_portals_owner_id_expr
  ON portals((metadata->>'ownerId'));

-- 2. Active-public composite — narrows the search-engine candidate set.
--    The existing partial ix_portals_public_index covers the boolean predicate
--    but not status; this composite filters both in one btree pass.
CREATE INDEX IF NOT EXISTS ix_portals_public_active
  ON portals(status) WHERE public_index = TRUE;

-- 3. JSONB GIN on capability_summary — lets us push verb / tag /
--    serviceAreas / languages filters into SQL via the ?| array operator.
--    jsonb_path_ops is smaller and faster than the default ops for the
--    @>, ?, ?|, ?& operators we'll use.
CREATE INDEX IF NOT EXISTS ix_portals_capability_summary_gin
  ON portals USING gin (capability_summary jsonb_path_ops);

-- 4. Inbox: composite (status, received_at DESC) — picks the right index for
--    "show me my pending invocations newest first" without forcing the
--    planner to choose between the existing single-column indexes.
CREATE INDEX IF NOT EXISTS ix_portal_capability_invocations_status_received
  ON portal_capability_invocations(status, received_at DESC);

-- 5. Page list ordering — listPages does ORDER BY sort_order, path. The
--    existing portal_id index requires a separate sort step; this composite
--    is index-friendly for the full ORDER BY.
CREATE INDEX IF NOT EXISTS ix_portal_pages_sort
  ON portal_pages(portal_id, sort_order, path);
