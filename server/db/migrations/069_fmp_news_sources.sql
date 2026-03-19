-- Migration 069: FMP News sources (correct endpoints)

-- Re-enable FMP Market News with correct endpoint
UPDATE market_data_sources SET is_active = 1 WHERE id = 'mds_fmp_news';

-- Add stock-specific news for portfolio holdings
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_stock_news', 'FMP Stock News (Holdings)', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"stock_news","symbols":["AAPL","MSFT","AMZN","NVDA","GOOGL","META","JPM","V","JNJ","NFLX","CVX","AMD","UNH","COST","BA"]}', 4, 1)
ON CONFLICT (id) DO NOTHING;

-- Disable Reuters (DNS broken)
UPDATE market_data_sources SET is_active = 0 WHERE id = 'mds_rss_reuters';
