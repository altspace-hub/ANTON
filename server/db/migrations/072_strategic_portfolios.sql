-- Migration 072: Strategic portfolio indexes with distinct investment philosophies

-- ANTON Growth 20 — high-growth tech/AI momentum
INSERT INTO market_indexes (id, name, description, index_type, philosophy, status, universe, max_holdings,
  rebalance_frequency, weighting_method, budget, currency, benchmark_symbol)
VALUES (
  'midx_growth_20', 'ANTON Growth 20',
  'High-growth technology and innovation leaders. Momentum-weighted, monthly rebalance. Targets companies with strong revenue growth, AI/cloud exposure, and positive price momentum.',
  'philosophy', 'growth', 'draft',
  '["NVDA","AMZN","NFLX","AMD","META","GOOGL","MSFT","CRM","ADBE","AVGO","COST","AAPL"]',
  20, 'monthly', 'conviction', 100000000, 'USD', 'QQQ'
) ON CONFLICT (id) DO NOTHING;

-- ANTON Value 20 — deep value with margin of safety
INSERT INTO market_indexes (id, name, description, index_type, philosophy, status, universe, max_holdings,
  rebalance_frequency, weighting_method, budget, currency, benchmark_symbol)
VALUES (
  'midx_value_20', 'ANTON Value 20',
  'Undervalued large-caps with strong fundamentals. Seeks companies trading below intrinsic value with catalysts for re-rating. Fundamental-weighted, quarterly rebalance.',
  'philosophy', 'value', 'draft',
  '["JPM","BAC","CVX","KO","PEP","JNJ","V","PG","WMT","ABBV","MRK"]',
  20, 'quarterly', 'conviction', 100000000, 'USD', 'VTV'
) ON CONFLICT (id) DO NOTHING;

-- ANTON Defensive 15 — low-beta, dividend, stability
INSERT INTO market_indexes (id, name, description, index_type, philosophy, status, universe, max_holdings,
  rebalance_frequency, weighting_method, budget, currency, benchmark_symbol)
VALUES (
  'midx_defensive_15', 'ANTON Defensive 15',
  'Low-volatility dividend aristocrats and defensive sector leaders. Prioritises capital preservation and income. Equal-weighted for diversification.',
  'philosophy', 'defensive', 'draft',
  '["JNJ","PG","KO","WMT","UNH","COST","MRK","PEP","ABBV","MCD"]',
  15, 'quarterly', 'equal', 100000000, 'USD', 'XLP'
) ON CONFLICT (id) DO NOTHING;

-- ANTON Momentum 10 — pure technical momentum
INSERT INTO market_indexes (id, name, description, index_type, philosophy, status, universe, max_holdings,
  rebalance_frequency, weighting_method, budget, currency, benchmark_symbol)
VALUES (
  'midx_momentum_10', 'ANTON Momentum 10',
  'Pure momentum strategy selecting the 10 highest relative-strength stocks from the US 100 universe. Weekly rebalance to capture short-term trends. High turnover, high conviction.',
  'philosophy', 'momentum', 'draft',
  '["AAPL","MSFT","AMZN","NVDA","GOOGL","META","JPM","V","NFLX","CVX","AMD","UNH","COST","BA","WMT","KO","PEP","BAC","ADBE","ABBV"]',
  10, 'weekly', 'conviction', 100000000, 'USD', 'SPY'
) ON CONFLICT (id) DO NOTHING;

-- ANTON ESG Leaders 20 — values-constrained quality
INSERT INTO market_indexes (id, name, description, index_type, philosophy, status, universe, max_holdings,
  rebalance_frequency, weighting_method, budget, currency, benchmark_symbol)
VALUES (
  'midx_esg_20', 'ANTON ESG 20',
  'ESG-screened quality companies with sustainable competitive advantages. Excludes weapons, fossil fuels, tobacco. Integrates with ANTON values constraints system.',
  'philosophy', 'esg', 'draft',
  '["MSFT","AAPL","GOOGL","AMZN","NVDA","JNJ","PG","COST","UNH","NFLX","CRM","ADBE","AMD","V","WMT","MRK"]',
  20, 'quarterly', 'equal', 100000000, 'USD', 'ESGU'
) ON CONFLICT (id) DO NOTHING;

-- Link default domain strategy for finance
INSERT INTO domain_strategies (id, user_id, domain, strategy_type, strategy_label, parameters, atom_weights)
VALUES (
  'ds_default_finance', 'default', 'finance', 'balanced',
  'Balanced Growth — moderate risk, diversified across strategies',
  '{"risk_tolerance":"moderate","rebalance_frequency":"monthly","target_annual_return":0.10}',
  '{"fact":1.0,"signal":1.0,"insight":1.0,"event":1.2,"prediction":0.8,"outcome":1.5}'
) ON CONFLICT DO NOTHING;

-- Also for solo user
INSERT INTO domain_strategies (id, user_id, domain, strategy_type, strategy_label, parameters, atom_weights)
VALUES (
  'ds_solo_finance', 'solo', 'finance', 'balanced',
  'Balanced Growth — moderate risk, diversified across strategies',
  '{"risk_tolerance":"moderate","rebalance_frequency":"monthly","target_annual_return":0.10}',
  '{"fact":1.0,"signal":1.0,"insight":1.0,"event":1.2,"prediction":0.8,"outcome":1.5}'
) ON CONFLICT DO NOTHING;
