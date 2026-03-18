-- Migration 055: Markets Pillar Work Package 6 — Workflow Definitions & Seed Indexes
-- Inserts pre-built workflow definitions for daily intelligence, index rebalance,
-- and prediction validation. Also seeds 5 starter index portfolios.
-- Uses INSERT OR IGNORE for idempotency (safe to run multiple times).

-- ── Workflow Definitions ───────────────────────────────────────────────────────

INSERT OR IGNORE INTO workflow_definitions (id, name, description, trigger_type, steps, config, status)
VALUES (
  'wf_markets_daily_intelligence',
  'Daily Intelligence Cycle',
  'Markets Pillar daily intelligence cycle — fetches data, extracts atoms, runs decay, scans signals, computes indicators, and synthesises dashboard.',
  'scheduled',
  '[{"step":1,"type":"api_call","name":"Fetch Market Data","config":{"endpoint":"/api/markets/data/fetch-all","method":"POST"}},{"step":2,"type":"script","name":"Extract Atoms","config":{"endpoint":"/api/markets/atoms/extract","method":"POST"}},{"step":3,"type":"script","name":"Refresh Correlation Map","config":{"template":"correlation_map_refresh","area":"markets"}},{"step":4,"type":"script","name":"Apply Atom Decay","config":{"template":"atom_decay_calculator","area":"markets"}},{"step":5,"type":"llm","name":"Signal Scanner","config":{"prompt":"market-signal-scanner","thinking":"think"}},{"step":6,"type":"parallel","name":"Compute Indicators","config":{"templates":["moving_averages","momentum_indicators","sector_rotation_analysis"],"area":"markets"}},{"step":7,"type":"llm","name":"AI Synthesis","config":{"prompt":"market-macro-brief","thinking":"think_hard"}},{"step":8,"type":"conditional","name":"Pattern Check","config":{"condition":"patterns_detected > 0","true_action":"spawn_investigation","false_action":"skip"}}]',
  '{"schedule":"0 6 * * 1-5","area":"markets"}',
  'active'
);

INSERT OR IGNORE INTO workflow_definitions (id, name, description, trigger_type, steps, config, status)
VALUES (
  'wf_markets_index_rebalance',
  'Index Rebalance',
  'Markets Pillar index rebalance workflow — computes metrics, screens universe, generates consul proposal, validates risk, and executes with approval.',
  'manual',
  '[{"step":1,"type":"script","name":"Current Portfolio Metrics","config":{"template":"sharpe_ratio","area":"markets"}},{"step":2,"type":"api_call","name":"Fetch Universe Data","config":{"endpoint":"/api/markets/data/fetch-all","method":"POST"}},{"step":3,"type":"script","name":"Screening Calculations","config":{"templates":["fundamental_ratios","price_momentum"],"area":"markets"}},{"step":4,"type":"llm","name":"Consul Rebalance Proposal","config":{"prompt":"market-index-composer","thinking":"investigate"}},{"step":5,"type":"script","name":"Validate Risk Metrics","config":{"templates":["var_calculation","drawdown_analysis"],"area":"markets"}},{"step":6,"type":"approval","name":"User Review","config":{"message":"Review the proposed rebalance and approve or reject."}},{"step":7,"type":"conditional","name":"Execute Decision","config":{"condition":"approved","true_action":"continue","false_action":"goto_step_4"}},{"step":8,"type":"script","name":"Post-Rebalance Metrics","config":{"template":"sharpe_ratio","area":"markets"}},{"step":9,"type":"script","name":"Validate Previous Rebalance","config":{"endpoint":"/api/markets/indexes/validate-previous"}},{"step":10,"type":"llm","name":"Generate Rebalance Report","config":{"prompt":"market-index-composer","thinking":"think"}}]',
  '{"area":"markets","requires_approval":true}',
  'active'
);

INSERT OR IGNORE INTO workflow_definitions (id, name, description, trigger_type, steps, config, status)
VALUES (
  'wf_markets_prediction_validation',
  'Prediction Validation',
  'Markets Pillar prediction validation — checks outcomes, calculates accuracy, runs calibration, investigates failures, and optimises signal weights.',
  'scheduled',
  '[{"step":1,"type":"api_call","name":"Fetch Outcome Data","config":{"endpoint":"/api/markets/data/fetch-all","method":"POST"}},{"step":2,"type":"script","name":"Prediction Accuracy Stats","config":{"template":"prediction_accuracy_stats","area":"markets"}},{"step":3,"type":"script","name":"Confidence Calibration","config":{"template":"confidence_calibration","area":"markets"}},{"step":4,"type":"llm","name":"5 Whys Analysis","config":{"prompt":"market-investigation","thinking":"investigate"}},{"step":5,"type":"script","name":"Signal Weight Optimizer","config":{"template":"signal_weight_optimizer","area":"markets"}},{"step":6,"type":"llm","name":"Learning Summary","config":{"prompt":"market-prediction-review","thinking":"think_hard"}},{"step":7,"type":"script","name":"Atom Confidence Adjustments","config":{"template":"atom_decay_calculator","area":"markets"}},{"step":8,"type":"conditional","name":"Blind Spot Check","config":{"condition":"blind_spots_found > 0","true_action":"spawn_investigation","false_action":"complete"}}]',
  '{"schedule":"0 20 * * 5","area":"markets"}',
  'active'
);

-- ── Seed Indexes ───────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status)
VALUES (
  'midx_seed_us100',
  'ANTON US 100',
  'Large-cap US equities — AI-selected top 100 US companies by market cap, conviction, and fundamental quality.',
  'geographic',
  'Large-cap quality with AI conviction overlay',
  '["US_LARGE_CAP"]',
  100,
  'monthly',
  'equal',
  'SPY',
  'draft'
);

INSERT OR IGNORE INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status)
VALUES (
  'midx_seed_nordic30',
  'ANTON Nordic 30',
  'Nordic markets — 30 highest-conviction Nordic companies across Sweden, Norway, Denmark, and Finland.',
  'geographic',
  'Nordic market leadership with conviction weighting',
  '["NORDIC_ALL"]',
  30,
  'quarterly',
  'conviction',
  'OMXS30',
  'draft'
);

INSERT OR IGNORE INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status)
VALUES (
  'midx_seed_value20',
  'ANTON Value 20',
  'Global value stocks — 20 deeply undervalued companies identified through fundamental analysis and AI screening.',
  'philosophy',
  'Deep value with margin of safety and catalyst awareness',
  '["GLOBAL_DEVELOPED"]',
  20,
  'quarterly',
  'conviction',
  'VTV',
  'draft'
);

INSERT OR IGNORE INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status)
VALUES (
  'midx_seed_esg20',
  'ANTON ESG Leaders 20',
  'ESG-screened portfolio — 20 companies with highest ESG scores that also meet financial quality criteria.',
  'philosophy',
  'ESG leadership without sacrificing returns',
  '["GLOBAL_ESG_SCREENED"]',
  20,
  'quarterly',
  'equal',
  'ESGU',
  'draft'
);

INSERT OR IGNORE INTO market_indexes (id, name, description, index_type, philosophy, universe, max_holdings, rebalance_frequency, weighting_method, benchmark_symbol, status)
VALUES (
  'midx_seed_nextgen10',
  'ANTON NextGen 10',
  'Emerging tech and innovation — 10 high-conviction companies at the forefront of AI, biotech, clean energy, and space.',
  'sector',
  'Innovation-first with high growth potential and disruption thesis',
  '["GLOBAL_INNOVATION"]',
  10,
  'monthly',
  'conviction',
  'ARKK',
  'draft'
);
