-- Migration 068: Expanded universe — S&P 100, sector ETFs, indices, fundamentals

-- ── S&P 100 prices (3 batches) ────────────────────────────────────────────────
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_sp100_b1', 'FMP S&P 100 Batch 1 (A-D)', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"price","symbols":["AAPL","ABBV","ABT","ACN","ADBE","AIG","AMD","AMGN","AMT","AMZN","AVGO","AXP","BA","BAC","BK","BKNG","BLK","BMY","C","CAT","CHTR","CL","CMCSA","COF","COP","COST","CRM","CSCO","CVS","CVX","DE","DHR","DIS","DOW","DUK"]}', 24, 0),
('mds_fmp_sp100_b2', 'FMP S&P 100 Batch 2 (E-M)', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"price","symbols":["EMR","EXC","F","FDX","GD","GE","GILD","GM","GOOG","GOOGL","GS","HD","HON","IBM","INTC","JNJ","JPM","KHC","KO","LIN","LLY","LOW","MA","MCD","MDLZ","MDT","MET","META","MMM","MO","MRK","MS","MSFT"]}', 24, 0),
('mds_fmp_sp100_b3', 'FMP S&P 100 Batch 3 (N-Z)', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"price","symbols":["NEE","NFLX","NKE","NVDA","ORCL","OXY","PEP","PFE","PG","PM","PYPL","QCOM","RTX","SBUX","SCHW","SO","SPG","T","TGT","TMO","TMUS","TXN","UNH","UNP","UPS","USB","V","VZ","WBA","WFC","WMT","XOM"]}', 24, 0)
ON CONFLICT (id) DO NOTHING;

-- ── Sector ETFs ───────────────────────────────────────────────────────────────
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_sector_etfs', 'FMP Sector ETFs', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"price","symbols":["XLF","XLE","XLK","XLV","XLI","XLB","XLY","XLP","XLU","XLRE","XLC"]}', 12, 1)
ON CONFLICT (id) DO NOTHING;

-- ── Index proxies ─────────────────────────────────────────────────────────────
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_indices', 'FMP Major Index ETFs', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"price","symbols":["SPY","QQQ","DIA","IWM","VTI","EFA","EEM"]}', 12, 1)
ON CONFLICT (id) DO NOTHING;

-- ── Fundamentals (top 30 companies, weekly fetch) ─────────────────────────────
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_fundamentals', 'FMP Fundamentals Top 30', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"fundamental_full","symbols":["AAPL","MSFT","AMZN","NVDA","GOOGL","META","JPM","V","JNJ","PG","UNH","HD","MA","DIS","NFLX","ADBE","CRM","INTC","AMD","AVGO","COST","LLY","TMO","ABT","MRK","PFE","KO","PEP","WMT","CVX"]}', 168, 1)
ON CONFLICT (id) DO NOTHING;

-- ── Economic calendar ─────────────────────────────────────────────────────────
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_econ_cal', 'FMP Economic Calendar', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"event"}', 12, 1)
ON CONFLICT (id) DO NOTHING;

-- ── Analyst estimates (top 30, weekly) ────────────────────────────────────────
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_estimates', 'FMP Analyst Estimates Top 30', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"analyst_estimates","symbols":["AAPL","MSFT","AMZN","NVDA","GOOGL","META","JPM","V","JNJ","PG","UNH","HD","MA","DIS","NFLX","ADBE","CRM","INTC","AMD","AVGO","COST","LLY","TMO","ABT","MRK","PFE","KO","PEP","WMT","CVX"]}', 168, 1)
ON CONFLICT (id) DO NOTHING;
