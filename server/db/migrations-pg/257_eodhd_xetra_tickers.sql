-- 257_eodhd_xetra_tickers.sql
--
-- Correct the EODHD ticker suffix for the German names in the EU price source.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
--
-- mds_eodhd_eu was seeded (migration 060) with SAP.DE, SIE.DE, ALV.DE and
-- DTE.DE. EODHD does not serve those: every request returns HTTP 404. The
-- fetcher logs the 404 and continues, so the source still reported
-- last_fetch_status='success' while four of its ten symbols had never ingested
-- a single row — verified 2026-08-18: zero rows in market_data_raw have ever
-- carried a '%.DE' symbol.
--
-- EODHD lists them under the .XETRA exchange code. Confirmed against the live
-- API on 2026-08-18: SAP.DE and SIE.DE both 404, while SAP.XETRA and
-- SIE.XETRA return bars through 2026-08-17.
--
-- ── Safety ──────────────────────────────────────────────────────────────────
--
-- Renaming the configured symbol changes the ticker stored on ingest, so this
-- would orphan existing references. There are none: no active index holding,
-- watchlist row or prediction targets a '%.DE' symbol, precisely because the
-- feed never worked. Nothing to migrate, only the config to correct.
--
-- Scoped with a jsonb equality check so an operator who has already edited
-- this source by hand is left alone.

UPDATE market_data_sources
   SET config = jsonb_set(
         config::jsonb,
         '{symbols}',
         '["ASML.AS","SAP.XETRA","SIE.XETRA","ALV.XETRA","DTE.XETRA","AIR.PA","MC.PA","OR.PA","TTE.PA","BNP.PA"]'::jsonb
       )::text,
       updated_at = NOW()
 WHERE id = 'mds_eodhd_eu'
   AND config::jsonb -> 'symbols'
       = '["ASML.AS","SAP.DE","SIE.DE","ALV.DE","DTE.DE","AIR.PA","MC.PA","OR.PA","TTE.PA","BNP.PA"]'::jsonb;
