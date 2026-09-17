-- 263_schedule_run_slots.sql
--
-- Give every markets scheduler run the identity of the SLOT it belongs to, so
-- "has this slot already run?" is a question the database can answer atomically.
--
-- ── Why ──────────────────────────────────────────────────────────────────
--
-- market_schedule_runs already separates ran / hung / threw / never-fired
-- (migration 067, wired 2026-08-26). What it could not say is which scheduled
-- occurrence a row belongs to, because started_at is when the work began, not
-- which slot it was for. Without that, a catch-up pass has no way to tell a
-- slot that ran late from one that never ran, and no way to avoid racing the
-- cron that may fire the same slot a moment later.
--
-- The catch-up exists because on 2026-09-02/03 node-cron stopped firing while
-- the process stayed alive. Inside a six-hour window on 09-02 — the host
-- demonstrably awake (Windows logged no standby session; the 20-minute
-- setInterval heartbeat ticked 18 consecutive times) — the 12:00 free sweep,
-- 12:30 midday-extraction-topup, 14:00 intraday-price-refresh, 14:30
-- phase2-pre-open and 15:00 news-fetch all failed to fire, and left no side
-- effects: zero rows fetched and zero atoms created in those hours. The same
-- shape cost 09-02 23:00 (phase6) and 09-03 07:00 (phase1). Those are the
-- phases that generate predictions, so the learning loop simply stopped being
-- fed while every dashboard looked healthy.
--
-- ── The unique index is the mechanism, not an optimisation ────────────────
--
-- Both the cron callback and the catch-up tick claim a slot by INSERTing it.
-- The unique index makes exactly one of them win: the loser gets no row back
-- from ON CONFLICT DO NOTHING and skips the work. Without it, a slot that
-- fires slightly late would be run twice — once by cron, once by the catch-up
-- that had already decided it was missed — which for the LLM phases means
-- paying twice and writing two sets of predictions for the same slot.
--
-- NULLs are distinct in a Postgres unique index by default, so the pre-existing
-- rows this migration cannot attribute, and any future caller that does not
-- pass a slot, remain unconstrained. That keeps the recorder's fail-open
-- contract intact: bookkeeping never blocks the work it observes.

ALTER TABLE market_schedule_runs
  ADD COLUMN IF NOT EXISTS slot_at TIMESTAMPTZ;

COMMENT ON COLUMN market_schedule_runs.slot_at IS
  'The scheduled occurrence this run belongs to (cron slot instant, minute precision). NULL for runs recorded before migration 263 or triggered outside the schedule.';

-- Backfill from history. Every existing row was written by a cron callback that
-- fired at its slot minute, so truncating started_at to the minute recovers the
-- slot exactly. This matters on the deploy itself: with slot_at left NULL the
-- catch-up would consider today's already-completed slots unclaimed and re-run
-- them on the first tick, which for the spending phases means paying for work
-- that already happened.
--
-- Deduplicated defensively: should any phase somehow hold two rows in one
-- minute, only the earliest is attributed and the rest stay NULL rather than
-- failing the index creation below.
WITH ranked AS (
  SELECT id,
         DATE_TRUNC('minute', started_at) AS slot,
         ROW_NUMBER() OVER (
           PARTITION BY phase, DATE_TRUNC('minute', started_at)
           ORDER BY id
         ) AS rn
    FROM market_schedule_runs
   WHERE started_at IS NOT NULL
     AND slot_at IS NULL
)
UPDATE market_schedule_runs r
   SET slot_at = ranked.slot
  FROM ranked
 WHERE r.id = ranked.id
   AND ranked.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_schedule_runs_phase_slot
  ON market_schedule_runs (phase, slot_at);

-- Supports the catch-up's per-phase "what is the newest run?" lookup.
CREATE INDEX IF NOT EXISTS idx_market_schedule_runs_phase_started
  ON market_schedule_runs (phase, started_at DESC);
