# ANTON Markets — Computational Engine Insert

**Document type:** Specification insert for Claude Code
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification
**Depends on:** Existing `connection-manager.ts`, `workflow-engine.ts`, Script Lite/Medium infrastructure

---

## Why Markets Needs a Computational Layer

LLMs are excellent at reasoning, narrative analysis, thesis construction, and natural language understanding. They are terrible at arithmetic. You cannot ask an LLM to:

- Calculate a rolling 30-day Sharpe ratio across 100 positions and trust the result
- Compute a correlation matrix between 50 securities over 252 trading days
- Run a Monte Carlo simulation with 10,000 paths
- Calculate portfolio variance given a covariance matrix
- Accurately compound daily returns into monthly/annual figures
- Perform regression analysis to decompose factor exposures

These operations require actual code execution — Python scripts running numpy, pandas, scipy, statsmodels. The good news is ANTON already has the infrastructure: `connection-manager.ts` provides a sandboxed script execution environment, the Coding Area's Script Lite tier generates Python from natural-language briefs, and the workflow engine can orchestrate multi-step processes mixing AI analysis with code execution.

Markets needs to **formalise and extend** this infrastructure for financial computation — not rebuild it.

---

## 1. The Market Computation Service

### `market-computation-service.ts`

A new service that wraps the existing script execution sandbox with financial-specific capabilities.

**Core principle:** The LLM decides *what* to compute. The script engine *does* the computation. The LLM then *interprets* the results. This three-step pattern (reason → compute → interpret) is how human analysts work — they don't calculate Sharpe ratios in their heads either.

```typescript
interface MarketComputation {
  id: string;
  name: string;
  computation_type: string;        // See computation types below
  script_template_id?: string;     // Pre-built template (if using a standard computation)
  generated_script?: string;       // AI-generated script (if custom)
  input_data: Record<string, any>; // Parameters and data references
  output_format: string;           // 'json', 'csv', 'chart_data'
  
  // Execution
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  execution_time_ms?: number;
  error?: string;
  
  // Provenance
  triggered_by: string;            // Which service/process triggered this computation
  triggered_by_id?: string;        // Thesis ID, prediction ID, index ID, etc.
}
```

**Key methods:**

- `runComputation(spec: MarketComputation)` — Execute a computation in the sandbox
- `runTemplate(templateId, params)` — Run a pre-built template with parameters
- `generateAndRun(description, data)` — AI generates a script from natural language, then executes it
- `getComputationResult(computationId)` — Retrieve results
- `scheduleComputation(spec, cronExpression)` — Schedule recurring computations

### 1.1 Pre-Built Computation Templates

These are Python scripts stored as templates that can be parameterised and executed without AI script generation. They cover the most common financial calculations:

#### Portfolio Analytics

| Template ID | Name | Inputs | Outputs |
|---|---|---|---|
| `nav_calculation` | NAV Calculator | Holdings with weights, current prices | NAV value, daily return, cumulative return |
| `portfolio_returns` | Return Calculator | Price series, holdings history | Time-weighted returns, CAGR, total return |
| `sharpe_ratio` | Sharpe Ratio | Return series, risk-free rate | Sharpe ratio (rolling and cumulative) |
| `sortino_ratio` | Sortino Ratio | Return series, risk-free rate | Sortino ratio (downside deviation only) |
| `max_drawdown` | Maximum Drawdown | NAV series | Max drawdown %, drawdown duration, recovery time |
| `volatility` | Volatility Calculator | Return series, window | Rolling volatility, annualised volatility |
| `beta_calculation` | Beta Calculator | Asset returns, benchmark returns | Beta coefficient, alpha, R-squared |
| `var_calculation` | Value at Risk | Return series, confidence level | VaR (historical, parametric), CVaR |
| `position_attribution` | Position Attribution | Holdings, returns per position | Contribution to return per holding, waterfall data |

#### Statistical Analysis

| Template ID | Name | Inputs | Outputs |
|---|---|---|---|
| `correlation_matrix` | Correlation Matrix | Multiple price series | Correlation matrix, heatmap data |
| `rolling_correlation` | Rolling Correlation | Two price series, window | Rolling correlation over time |
| `regression_analysis` | Factor Regression | Asset returns, factor returns | Betas, alpha, residuals, R-squared, p-values |
| `cointegration_test` | Cointegration Test | Two price series | Engle-Granger test statistic, p-value, hedge ratio |
| `granger_causality` | Granger Causality | Two time series, max_lag | F-test results per lag, optimal lag, direction |
| `distribution_analysis` | Return Distribution | Return series | Skewness, kurtosis, Jarque-Bera test, QQ plot data |
| `outlier_detection` | Outlier Detection | Time series | Z-score outliers, IQR outliers, contextual outliers |

#### Signal & Prediction Support

| Template ID | Name | Inputs | Outputs |
|---|---|---|---|
| `moving_averages` | Moving Averages | Price series, windows | SMA, EMA, crossover signals |
| `momentum_indicators` | Momentum Indicators | Price/volume series | RSI, MACD, Bollinger Bands, rate of change |
| `earnings_surprise_analysis` | Earnings Surprise Pattern | Estimated vs actual earnings history | Beat rate, average surprise %, sector comparison |
| `sector_rotation_analysis` | Sector Rotation | Sector ETF prices | Relative strength, rotation signals, momentum ranking |
| `prediction_accuracy_stats` | Prediction Accuracy | Predicted vs actual outcomes | Accuracy rate, calibration data, Brier score, bucket analysis |
| `monte_carlo_simulation` | Monte Carlo Paths | Return distribution params, periods, paths | Simulated outcome distribution, confidence intervals, percentiles |
| `backtest_engine` | Strategy Backtester | Signals, prices, transaction cost | Strategy returns, benchmark returns, Sharpe, max drawdown |

#### Atom & Learning Analytics

| Template ID | Name | Inputs | Outputs |
|---|---|---|---|
| `atom_decay_calculator` | Atom Decay | Atom list with creation dates and half-lives | Updated confidence scores after decay |
| `confidence_calibration` | Calibration Analysis | Predicted confidences, actual outcomes | Calibration buckets, calibration error, reliability diagram data |
| `signal_weight_optimizer` | Signal Weight Optimization | Historical signal-outcome pairs | Optimised signal weights, improvement vs current weights |
| `correlation_map_refresh` | Correlation Map Refresh | Entity pair price series | Updated correlation strengths, newly significant/broken correlations |

### 1.2 Template Storage

Templates are stored as Python files in a dedicated directory. Each template is a parameterised script:

```
server/markets/computation-templates/
├── portfolio/
│   ├── nav_calculation.py
│   ├── portfolio_returns.py
│   ├── sharpe_ratio.py
│   ├── sortino_ratio.py
│   ├── max_drawdown.py
│   ├── volatility.py
│   ├── beta_calculation.py
│   ├── var_calculation.py
│   └── position_attribution.py
├── statistical/
│   ├── correlation_matrix.py
│   ├── rolling_correlation.py
│   ├── regression_analysis.py
│   ├── cointegration_test.py
│   ├── granger_causality.py
│   ├── distribution_analysis.py
│   └── outlier_detection.py
├── signals/
│   ├── moving_averages.py
│   ├── momentum_indicators.py
│   ├── earnings_surprise_analysis.py
│   ├── sector_rotation_analysis.py
│   ├── prediction_accuracy_stats.py
│   ├── monte_carlo_simulation.py
│   └── backtest_engine.py
└── learning/
    ├── atom_decay_calculator.py
    ├── confidence_calibration.py
    ├── signal_weight_optimizer.py
    └── correlation_map_refresh.py
```

**Template structure:**

```python
"""
ANTON Markets Computation Template: Sharpe Ratio
Description: Calculate rolling and cumulative Sharpe ratio for a return series
Inputs: return_series (JSON array of {date, return}), risk_free_rate (float), window (int)
Outputs: JSON with rolling_sharpe (array), cumulative_sharpe (float), annualised_sharpe (float)
"""

import json
import sys
import numpy as np

# ANTON injects parameters as JSON via stdin
params = json.loads(sys.stdin.read())

returns = np.array([r['return'] for r in params['return_series']])
rf = params.get('risk_free_rate', 0.0)
window = params.get('window', 30)

# Calculations
excess_returns = returns - (rf / 252)  # Daily risk-free rate
cumulative_sharpe = np.mean(excess_returns) / np.std(excess_returns) * np.sqrt(252) if np.std(excess_returns) > 0 else 0

rolling_sharpe = []
for i in range(window, len(returns)):
    window_returns = excess_returns[i-window:i]
    std = np.std(window_returns)
    s = (np.mean(window_returns) / std * np.sqrt(252)) if std > 0 else 0
    rolling_sharpe.append({
        'date': params['return_series'][i]['date'],
        'sharpe': round(s, 4)
    })

# Output as JSON to stdout
result = {
    'cumulative_sharpe': round(cumulative_sharpe, 4),
    'annualised_sharpe': round(cumulative_sharpe, 4),
    'rolling_sharpe': rolling_sharpe,
    'window_days': window,
    'data_points': len(returns)
}

print(json.dumps(result))
```

---

## 2. Integration Points — Where Computation Plugs In

### 2.1 Daily NAV Calculation (Index Service)

The `index-daily-nav` scheduled job must use the `nav_calculation` and `portfolio_returns` templates — not LLM arithmetic.

**Flow:**
1. Fetch current prices for all holdings in all active indexes (API call)
2. For each index: call `nav_calculation` template with holdings + prices
3. Store result in `market_index_nav_history`
4. Call `sharpe_ratio`, `volatility`, `max_drawdown` templates with the NAV series
5. Update rolling risk metrics in NAV history
6. Update leaderboard

### 2.2 Prediction Validation (Validation Service)

When validating predictions, the accuracy scoring must be computed — not estimated by the LLM.

**Flow:**
1. Fetch actual outcome data (API call)
2. Call `prediction_accuracy_stats` template to compute accuracy metrics
3. Call `confidence_calibration` template to update calibration buckets
4. Pass computed results to the LLM for narrative interpretation and 5 Whys analysis

### 2.3 Pattern Detection (Pattern Service)

The pattern detection engine should use computational templates for quantitative patterns:

- `correlation_matrix` template to detect entity convergence
- `rolling_correlation` template to detect trend divergence
- `outlier_detection` template to find anomalies
- `granger_causality` template to validate suspected causal relationships

### 2.4 Thesis Building (Thesis Service)

When a consul builds a thesis that involves quantitative claims, the claim must be computed:

**Example:** Macro consul says "Nordic bank stocks have outperformed EU banking index by 3.2% over the last 3 months." The system must:
1. Fetch relevant price data
2. Run `portfolio_returns` template for both Nordic banks and EU banking index
3. Compute the actual difference
4. Pass the verified number to the consul — not let the LLM estimate it

### 2.5 Rebalance Engine (Index Rebalance Service)

The rebalance process needs computation for:
- Position sizing based on conviction and risk budget
- Portfolio optimisation (minimum variance, risk parity, max Sharpe)
- Transaction cost estimation
- Pre-trade risk check (what would the portfolio look like after proposed changes)

### 2.6 Learning Loop (Validation → Learning)

The learning cycle needs computation for:
- Signal weight optimisation across historical data
- Correlation map refresh from price data
- Atom decay calculation across all active atoms
- Calibration analysis to check if confidence scores are well-calibrated

### 2.7 Backtest Framework

The backtesting system is computation-heavy by nature. The `backtest_engine` template runs the full simulation: iterate through historical dates, apply signals, generate trades, calculate returns, compare to benchmark.

---

## 3. The Reason → Compute → Interpret Pattern

This is the fundamental workflow pattern that the Markets pillar follows for any quantitative question:

```
CONSUL (LLM)                    COMPUTATION ENGINE              CONSUL (LLM)
                                                                
"I think Nordic banks          Run correlation_matrix           "The computation confirms
have been correlated           and rolling_correlation          a 0.78 correlation, but
with EUR/SEK movements"  →     templates with actual      →    it's been declining over
                               price data                       the last 30 days (0.78 →
                                                                0.62), suggesting the
                                                                relationship may be 
                                                                weakening"
```

**Step 1: Reason.** The LLM consul identifies what needs to be calculated and why. This is where domain expertise matters — knowing *which* computation is relevant.

**Step 2: Compute.** The script execution engine runs the actual calculation with real data. This produces verified numbers, not LLM estimates.

**Step 3: Interpret.** The LLM consul receives the computed results and interprets them in context. This is where the LLM adds value — it understands *what the numbers mean*, even though it can't reliably produce them.

**Implementation note for Claude Code:** This pattern should be built as a reusable utility in the market computation service:

```typescript
async function reasonComputeInterpret(
  consultId: string,
  question: string,
  computationTemplateId: string,
  computationParams: Record<string, any>,
  interpretationContext: string
): Promise<{
  reasoning: string;          // Why this computation was chosen
  computedResult: any;        // The numerical output
  interpretation: string;     // What the numbers mean in context
  atoms_created: string[];    // Atoms created from the interpretation
}> {
  // Step 1: Ask consul what to compute and why
  // Step 2: Execute computation template
  // Step 3: Feed results back to consul for interpretation
}
```

---

## 4. Workflow Integration — Market Analysis Workflows

Extend the existing workflow engine's 12 step types with a Markets-aware usage pattern. No new step types needed — the existing types cover what's required:

| Existing Step Type | Markets Usage |
|---|---|
| **Module Execution** (Type 1) | Run a Markets module (thesis builder, signal scanner, deep dive) |
| **Checkpoint** (Type 2) | Human reviews thesis before activation, approves rebalance before execution |
| **API Call** (Type 3) | Fetch market data from financial APIs |
| **Script Execution** (Type 5) | Run computation templates (Sharpe, correlation, backtest) |
| **Conditional** (Type 6) | Branch based on computed results: "If Sharpe < 0.5, flag for review" |
| **Transform** (Type 10) | Parse API responses, format data for computation templates |
| **Loop** (Type 11) | "For each holding in index, calculate position return" |
| **Parallel** (Type 12) | Run multiple computations simultaneously |

### Pre-Built Market Workflows

Seed these as workflow templates that users can activate:

#### Daily Intelligence Cycle Workflow

```
Step 1: API Call — Fetch market data from all enabled sources
Step 2: Script — Run atom extraction on raw data (LLM-powered)
Step 3: Script — Run correlation_map_refresh template
Step 4: Script — Run atom_decay_calculator template
Step 5: Module — Run Signal Scanner module on new atoms
Step 6: Parallel:
  ├── Script — Run moving_averages template on tracked entities
  ├── Script — Run momentum_indicators template on tracked entities
  └── Script — Run sector_rotation_analysis template
Step 7: Module — AI synthesis of all computed signals into dashboard update
Step 8: Conditional — If any pattern detection triggers, spawn investigation task
```

#### Index Rebalance Workflow

```
Step 1: Script — Calculate current portfolio metrics (NAV, Sharpe, drawdown, position returns)
Step 2: API Call — Fetch latest data for universe of eligible securities
Step 3: Script — Run screening calculations (valuation metrics, momentum scores, quality scores)
Step 4: Module — Consul collaboration: propose rebalance (LLM reasons using computed data)
Step 5: Script — Validate proposed portfolio (compute new portfolio's expected risk metrics)
Step 6: Checkpoint — User reviews and approves proposed rebalance
Step 7: Conditional — If approved, execute rebalance; if rejected, return to step 4 with feedback
Step 8: Script — Calculate post-rebalance portfolio metrics
Step 9: Script — Validate previous rebalance impact (compute: did last changes help or hurt?)
Step 10: Module — Generate rebalance report with computed metrics and AI narrative
```

#### Prediction Validation Workflow

```
Step 1: Script — Fetch actual outcome data for predictions due for validation
Step 2: Script — Run prediction_accuracy_stats template
Step 3: Script — Run confidence_calibration template
Step 4: Module — AI analysis: run 5 Whys on any unexplained outcomes
Step 5: Script — Run signal_weight_optimizer template with updated outcomes
Step 6: Module — Generate learning summary with computed metrics
Step 7: Script — Apply atom confidence adjustments (decay + reweighting)
Step 8: Conditional — If blind spots detected, spawn investigation tasks
```

---

## 5. Python Dependencies

The computation templates require specific Python packages. These should be documented as requirements for the Markets pillar:

```
# markets-computation-requirements.txt
numpy>=1.24.0
pandas>=2.0.0
scipy>=1.10.0
statsmodels>=0.14.0
scikit-learn>=1.3.0
```

On Markets pillar activation, the system should check if these packages are available in the Python execution environment and prompt the user to install them if missing.

**Note:** These are all standard, well-maintained, open-source packages with no licensing concerns. They are NOT trading execution libraries — they are computation/analysis libraries only.

---

## 6. Computation Audit Trail

Every computation execution is logged for reproducibility and debugging.

```sql
CREATE TABLE market_computation_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- What was computed
  template_id TEXT,                        -- Pre-built template ID (if used)
  computation_type TEXT NOT NULL,
  description TEXT,
  
  -- Input/Output
  input_params_hash TEXT,                  -- SHA-256 of input params (for deduplication)
  input_params TEXT,                       -- JSON: full input parameters
  output_result TEXT,                      -- JSON: computation output
  
  -- Execution
  status TEXT NOT NULL,                    -- 'completed', 'failed', 'timeout'
  execution_time_ms INTEGER,
  error_message TEXT,
  
  -- Provenance
  triggered_by_service TEXT,               -- Which service triggered this
  triggered_by_id TEXT,                    -- Thesis/prediction/index/investigation ID
  triggered_by_workflow TEXT,              -- Workflow execution ID (if part of a workflow)
  
  -- Metadata
  executed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_computation_log_type ON market_computation_log(computation_type);
CREATE INDEX idx_computation_log_status ON market_computation_log(status);
CREATE INDEX idx_computation_log_triggered ON market_computation_log(triggered_by_service);
CREATE INDEX idx_computation_log_executed ON market_computation_log(executed_at);
```

This brings the total Markets table count to **32**.

---

## 7. What This Changes in the Implementation Phases

The computation layer is not a separate phase — it's infrastructure that Phase 1 needs from day one, because even the basic daily NAV calculation requires script execution.

**Updated Phase 1 requirements:**
- Set up computation template directory structure
- Implement `market-computation-service.ts` wrapping existing script sandbox
- Implement the core portfolio analytics templates (nav_calculation, portfolio_returns, sharpe_ratio, max_drawdown, volatility)
- Verify Python dependencies are available in sandbox environment
- Implement `market_computation_log` table

**Phase 2 additions:**
- Statistical analysis templates (correlation_matrix, rolling_correlation, regression_analysis)
- Signal templates (moving_averages, momentum_indicators)

**Phase 3 additions:**
- Monte Carlo simulation template
- Backtest engine template

**Phase 4 additions:**
- Learning analytics templates (atom_decay_calculator, confidence_calibration, signal_weight_optimizer, correlation_map_refresh)
- Prediction accuracy computation templates

**Phase 5 additions:**
- Advanced computation templates (cointegration, Granger causality, factor decomposition)
- Workflow templates (daily cycle, rebalance, validation)

---

## 8. The AI-Generated Computation Path

Not every computation fits a pre-built template. When a consul needs a custom calculation — "compute the average earnings surprise for Nordic banks over the last 8 quarters, weighted by market cap" — the system should be able to generate and execute a one-off script.

This follows the Coding Area's Script Lite pattern:

1. **Consul identifies the need:** "I need to calculate X to support my analysis"
2. **System generates script:** Using the Script Lite generation flow, but with financial context injected (available data schemas, common financial calculations, standard libraries)
3. **Script executes in sandbox:** Same execution environment as templates
4. **Result returned to consul:** Consul interprets the result in context
5. **Script optionally saved:** If the computation is useful, it can be saved as a new custom template for reuse

**Implementation:** Extend the Script Lite generation prompt with financial context awareness. When triggered from within the Markets pillar, the script generator should know about available market data structures, common financial operations, and ANTON's data schemas.

---

*End of insert. This integrates across all existing spec documents — the computation service is used by the index service, validation service, pattern service, thesis service, learning loop, and backtest framework.*
