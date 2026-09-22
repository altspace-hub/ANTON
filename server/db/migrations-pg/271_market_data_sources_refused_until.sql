-- 271 — a refused data source waits before it is tried again (2026-09-10).
--
-- When a provider refuses the account (401/402/403/429), the source stays
-- active on purpose — a daily quota resets and nobody wants to re-enable
-- sources by hand. But every cycle retried the full symbol list, so a quota
-- exhausted at 09:00 was hammered with hundreds of refused requests all day
-- and the first minutes of the next window went to the retries. The source
-- now records until when it is refused and is skipped until then.
ALTER TABLE market_data_sources ADD COLUMN IF NOT EXISTS refused_until TIMESTAMPTZ;
