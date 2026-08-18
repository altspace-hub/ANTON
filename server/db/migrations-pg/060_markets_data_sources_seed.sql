-- Migration 060 (PG): Markets Pillar — Seed Data Sources for FMP, EODHD, RSS
-- All sources seeded as disabled (is_active=0). Users enable after setting API keys.
-- PostgreSQL version: uses ON CONFLICT DO NOTHING instead of INSERT OR IGNORE.

-- ── FMP (Financial Modeling Prep) ─────────────────────────────────────────────

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_fmp_prices',
  'FMP Global Prices',
  'api',
  'fmp',
  '{"api_key_env":"FMP_API_KEY","data_type":"price","symbols":["AAPL","MSFT","AMZN","NVDA","GOOGL","META","JPM","V","JNJ","PG"]}',
  6,
  0
) ON CONFLICT DO NOTHING;

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_fmp_news',
  'FMP Market News',
  'api',
  'fmp',
  '{"api_key_env":"FMP_API_KEY","data_type":"news"}',
  4,
  0
) ON CONFLICT DO NOTHING;

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_fmp_calendar',
  'FMP Economic Calendar',
  'api',
  'fmp',
  '{"api_key_env":"FMP_API_KEY","data_type":"event"}',
  12,
  0
) ON CONFLICT DO NOTHING;

-- ── EODHD (End of Day Historical Data) ───────────────────────────────────────

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_eodhd_sweden',
  'EODHD OMX Stockholm',
  'api',
  'eodhd',
  '{"api_key_env":"EODHD_API_KEY","exchange":"ST","symbols":["VOLV-B.ST","ASSA-B.ST","ATCO-A.ST","AZN.ST","ERIC-B.ST","HM-B.ST","SAND.ST","SEB-A.ST","SHB-A.ST","INVE-B.ST"]}',
  24,
  0
) ON CONFLICT DO NOTHING;

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_eodhd_eu',
  'EODHD European Markets',
  'api',
  'eodhd',
  '{"api_key_env":"EODHD_API_KEY","exchange":"XETRA","symbols":["ASML.AS","SAP.XETRA","SIE.XETRA","ALV.XETRA","DTE.XETRA","AIR.PA","MC.PA","OR.PA","TTE.PA","BNP.PA"]}',
  24,
  0
) ON CONFLICT DO NOTHING;

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_eodhd_india',
  'EODHD India NSE',
  'api',
  'eodhd',
  '{"api_key_env":"EODHD_API_KEY","exchange":"NSE","symbols":["RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS","HINDUNILVR.NS","ITC.NS","SBIN.NS","BHARTIARTL.NS","BAJFINANCE.NS"]}',
  24,
  0
) ON CONFLICT DO NOTHING;

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_eodhd_japan',
  'EODHD Japan TSE',
  'api',
  'eodhd',
  '{"api_key_env":"EODHD_API_KEY","exchange":"TSE","symbols":["7203.T","6758.T","6861.T","8306.T","6501.T","9984.T","6902.T","7741.T","4063.T","8035.T"]}',
  24,
  0
) ON CONFLICT DO NOTHING;

-- ── RSS Feeds (no API key required) ──────────────────────────────────────────

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_rss_wsj',
  'WSJ Markets RSS',
  'rss',
  'rss',
  '{"url":"https://feeds.a.dj.com/rss/RSSMarketsMain.xml"}',
  2,
  0
) ON CONFLICT DO NOTHING;

INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active)
VALUES (
  'mds_rss_marketwatch',
  'MarketWatch Top Stories RSS',
  'rss',
  'rss',
  '{"url":"https://feeds.marketwatch.com/marketwatch/topstories/"}',
  2,
  0
) ON CONFLICT DO NOTHING;
