import type { DatabaseAdapter } from '../db/database.js';
import { executeScript, type ScriptExecutionResult } from './script-executor.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'computation-templates', 'markets');

// ── Available Templates ──────────────────────────────────────────────────────

interface TemplateInfo {
  name: string;
  description: string;
  inputSchema: string;
}

const AVAILABLE_TEMPLATES: TemplateInfo[] = [
  {
    name: 'portfolio_nav',
    description: 'Compute Net Asset Value for a portfolio of holdings',
    inputSchema: '{ holdings: [{ symbol, shares, price }], cash: number }',
  },
  {
    name: 'returns_basic',
    description: 'Compute simple and log returns, cumulative and annualized returns',
    inputSchema: '{ prices: [number], period: "daily"|"weekly"|"monthly" }',
  },
  {
    name: 'volatility_basic',
    description: 'Compute historical volatility and rolling volatility windows',
    inputSchema: '{ prices: [number], period: "daily"|"weekly"|"monthly", window: number }',
  },
  {
    name: 'moving_averages',
    description: 'Compute SMA and EMA with crossover detection',
    inputSchema: '{ prices: [number], windows: [number] }',
  },
  {
    name: 'correlation_matrix',
    description: 'Compute pairwise correlation between multiple price series',
    inputSchema: '{ series: { symbol: [number] }, method: "pearson"|"spearman" }',
  },
  // Phase 2 templates
  {
    name: 'sharpe_ratio',
    description: 'Compute Sharpe ratio, annualized return, and excess return',
    inputSchema: '{ returns: [number], risk_free_rate: number, period: "daily"|"weekly"|"monthly" }',
  },
  {
    name: 'drawdown_analysis',
    description: 'Compute max drawdown, current drawdown, and recovery analysis',
    inputSchema: '{ prices: [number] }',
  },
  {
    name: 'beta_calculation',
    description: 'Compute beta, alpha, R-squared vs benchmark',
    inputSchema: '{ asset_prices: [number], benchmark_prices: [number], period: "daily"|"weekly"|"monthly" }',
  },
  {
    name: 'sector_rotation',
    description: 'Analyze sector momentum and rotation signals',
    inputSchema: '{ sectors: { name: [number] }, window: number }',
  },
  {
    name: 'sentiment_score',
    description: 'Aggregate sentiment from text items',
    inputSchema: '{ items: [{ text: string, source: string, weight: number }] }',
  },
  {
    name: 'price_momentum',
    description: 'RSI, MACD, and momentum indicators',
    inputSchema: '{ prices: [number], short_window: number, long_window: number, signal_window: number }',
  },
  {
    name: 'fundamental_ratios',
    description: 'P/E, P/B, dividend yield, debt/equity, EV/EBITDA',
    inputSchema: '{ price: number, earnings_per_share: number, book_value_per_share: number, ... }',
  },
  // Phase 3 templates
  {
    name: 'atom_decay_calculator',
    description: 'Calculate confidence decay for market atoms over time',
    inputSchema: '{ atoms: [{ confidence: number, age_days: number, decay_rate: number }] }',
  },
  {
    name: 'backtest_engine',
    description: 'Run backtests on trading strategies with historical data',
    inputSchema: '{ prices: [number], signals: [1|-1|0], initial_capital: number, commission: number }',
  },
  {
    name: 'cointegration_test',
    description: 'Test for cointegration between two price series (Engle-Granger)',
    inputSchema: '{ series_a: [number], series_b: [number], significance: number }',
  },
  {
    name: 'confidence_calibration',
    description: 'Evaluate prediction calibration — are stated probabilities accurate?',
    inputSchema: '{ predictions: [{ predicted_probability: number, actual_outcome: 0|1 }], n_bins: number }',
  },
  {
    name: 'correlation_map_refresh',
    description: 'Refresh pairwise correlation map across multiple assets',
    inputSchema: '{ series: { symbol: [number] }, window: number, method: "pearson"|"spearman" }',
  },
  {
    name: 'distribution_analysis',
    description: 'Analyze return distribution: skewness, kurtosis, normality tests',
    inputSchema: '{ returns: [number] }',
  },
  {
    name: 'earnings_surprise_analysis',
    description: 'Analyze earnings surprise impact on price movements',
    inputSchema: '{ earnings: [{ estimated: number, actual: number, price_before: number, price_after: number }] }',
  },
  {
    name: 'granger_causality',
    description: 'Test if one time series Granger-causes another',
    inputSchema: '{ series_x: [number], series_y: [number], max_lag: number }',
  },
  {
    name: 'momentum_indicators',
    description: 'Compute RSI, MACD, Stochastic, Williams %R, and CCI',
    inputSchema: '{ prices: [number], rsi_period: number, macd_fast: number, macd_slow: number }',
  },
  {
    name: 'monte_carlo_simulation',
    description: 'Monte Carlo simulation for portfolio returns with confidence intervals',
    inputSchema: '{ mean_return: number, volatility: number, days: number, simulations: number, initial_value: number }',
  },
  {
    name: 'outlier_detection',
    description: 'Detect statistical outliers in a data series (Z-score and IQR methods)',
    inputSchema: '{ data: [number], z_threshold: number }',
  },
  {
    name: 'position_attribution',
    description: 'Attribute portfolio returns to individual positions',
    inputSchema: '{ positions: [{ symbol: string, weight: number, return: number }] }',
  },
  {
    name: 'prediction_accuracy_stats',
    description: 'Compute accuracy metrics for a set of predictions (Brier, log loss, calibration)',
    inputSchema: '{ predictions: [{ predicted: number, actual: 0|1 }] }',
  },
  {
    name: 'regression_analysis',
    description: 'Linear and polynomial regression with R², p-values, residual analysis',
    inputSchema: '{ x: [number], y: [number], degree: number }',
  },
  {
    name: 'rolling_correlation',
    description: 'Compute rolling correlation between two series over a sliding window',
    inputSchema: '{ series_a: [number], series_b: [number], window: number }',
  },
  {
    name: 'rolling_returns',
    description: 'Compute rolling returns over multiple windows',
    inputSchema: '{ prices: [number], windows: [number], annualize: boolean }',
  },
  {
    name: 'sector_rotation_analysis',
    description: 'Analyze sector relative strength and rotation signals',
    inputSchema: '{ sectors: { name: { prices: [number] } }, benchmark: [number], lookback: number }',
  },
  {
    name: 'signal_weight_optimizer',
    description: 'Optimize signal weights to maximize prediction accuracy',
    inputSchema: '{ signals: [[number]], outcomes: [0|1], method: "ridge"|"lasso"|"equal" }',
  },
  {
    name: 'sortino_ratio',
    description: 'Compute Sortino ratio (downside-risk-adjusted returns)',
    inputSchema: '{ returns: [number], risk_free_rate: number, target_return: number, period: "daily"|"monthly" }',
  },
  {
    name: 'var_calculation',
    description: 'Compute Value at Risk (historical, parametric, and Monte Carlo)',
    inputSchema: '{ returns: [number], confidence_level: number, horizon_days: number, portfolio_value: number }',
  },
  // Phase 4 templates — Medallion-grade portfolio construction & risk
  {
    name: 'mean_variance_optimization',
    description: 'Markowitz mean-variance optimization: efficient frontier, min-variance, max-Sharpe portfolios',
    inputSchema: '{ returns: [[number]], symbols: [string], risk_free_rate: number, num_portfolios: number }',
  },
  {
    name: 'black_litterman',
    description: 'Black-Litterman model: combine CAPM equilibrium with investor views via Bayesian updating',
    inputSchema: '{ market_weights: [number], covariance: [[number]], views: [{assets, direction, return, confidence}], risk_aversion: number, tau: number, symbols: [string] }',
  },
  {
    name: 'kelly_criterion',
    description: 'Kelly Criterion optimal position sizing: full/half Kelly, growth rate, ruin probability',
    inputSchema: '{ win_probability: number, win_amount: number, loss_amount: number, bankroll: number, fraction_kelly: number }',
  },
  {
    name: 'factor_model',
    description: 'Fama-French-Carhart 4-factor model: factor loadings, alpha, R-squared, contributions',
    inputSchema: '{ asset_returns: [number], factor_returns: { market: [number], size: [number], value: [number], momentum: [number] } }',
  },
  {
    name: 'risk_parity',
    description: 'Risk parity portfolio: equal-risk-contribution weights via Newton-Raphson iteration',
    inputSchema: '{ returns: [[number]], symbols: [string], target_risk: number }',
  },
  {
    name: 'garch_volatility',
    description: 'GARCH(1,1) volatility model: MLE parameter estimation, conditional volatility, forecasts',
    inputSchema: '{ returns: [number], p: number, q: number }',
  },
  {
    name: 'stress_test',
    description: 'Portfolio stress testing: multi-scenario P&L, worst case, diversification benefit, tail risk',
    inputSchema: '{ holdings: [{symbol, weight, beta, duration?, sector?}], portfolio_value: number, scenarios: [{name, market_shock, rate_shock, vol_shock, sector_shocks?}] }',
  },
];

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketComputationService(db: DatabaseAdapter) {

  function listTemplates(): TemplateInfo[] {
    return AVAILABLE_TEMPLATES;
  }

  async function runTemplate(
    templateName: string,
    inputParams: Record<string, unknown>,
    triggeredBy = 'manual',
    options?: { saveAsAtoms?: boolean },
  ): Promise<{ logId: string; success: boolean; output: unknown; error?: string; durationMs: number }> {
    // Validate template exists
    const template = AVAILABLE_TEMPLATES.find(t => t.name === templateName);
    if (!template) {
      throw new Error(`Unknown template: ${templateName}. Available: ${AVAILABLE_TEMPLATES.map(t => t.name).join(', ')}`);
    }

    // Create log entry
    const logId = `mcl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_computation_log (id, template_name, input_params, status, triggered_by)
      VALUES (?, ?, ?, 'running', ?)
    `, logId, templateName, JSON.stringify(inputParams), triggeredBy);

    try {
      // Read the template Python script
      const templatePath = path.join(TEMPLATES_DIR, `${templateName}.py`);
      const scriptContent = await readFile(templatePath, 'utf-8');

      // Build wrapper script that feeds JSON via stdin
      const inputJson = JSON.stringify(inputParams);
      const wrapperScript = `
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO(${JSON.stringify(inputJson)})

${scriptContent}
`;

      // Execute
      const result: ScriptExecutionResult = await executeScript({
        language: 'python',
        scriptContent: wrapperScript,
        outputDir: path.join(__dirname, '..', '..', 'data', 'computation-output'),
        timeoutMs: 60000,
      });

      if (result.success) {
        let output: unknown;
        try {
          output = JSON.parse(result.stdout.trim());
        } catch {
          output = result.stdout.trim();
        }

        await db.run(`
          UPDATE market_computation_log
          SET status = 'success', output_data = ?, execution_time_ms = ?
          WHERE id = ?
        `, JSON.stringify(output), result.durationMs, logId);

        // Auto-convert to atoms if requested
        if (options?.saveAsAtoms) {
          try {
            await computationToAtoms(logId);
          } catch (err) {
            console.error('[market-computation] Auto-atom conversion failed:', err);
          }
        }

        return { logId, success: true, output, durationMs: result.durationMs };
      } else {
        const errorMsg = result.stderr || `Exit code: ${result.exitCode}`;

        await db.run(`
          UPDATE market_computation_log
          SET status = 'error', error_message = ?, execution_time_ms = ?
          WHERE id = ?
        `, errorMsg, result.durationMs, logId);

        return { logId, success: false, output: null, error: errorMsg, durationMs: result.durationMs };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.run(`
        UPDATE market_computation_log
        SET status = 'error', error_message = ?
        WHERE id = ?
      `, message, logId);

      return { logId, success: false, output: null, error: message, durationMs: 0 };
    }
  }

  async function getLog(logId: string) {
    return await db.get<{
      id: string;
      template_name: string;
      input_params: string;
      output_data: string | null;
      status: string;
      error_message: string | null;
      execution_time_ms: number | null;
      triggered_by: string;
      created_at: string;
    }>('SELECT * FROM market_computation_log WHERE id = ?', logId);
  }

  async function getRecentLogs(limit = 20) {
    return await db.all<{
      id: string;
      template_name: string;
      status: string;
      execution_time_ms: number | null;
      triggered_by: string;
      created_at: string;
    }>('SELECT id, template_name, status, execution_time_ms, triggered_by, created_at FROM market_computation_log ORDER BY created_at DESC LIMIT ?', limit);
  }

  /**
   * Convert computation results into market atoms using Claude.
   * This closes the loop: scripts run -> results become knowledge -> feed predictions.
   */
  async function computationToAtoms(logId: string): Promise<string[]> {
    // Get the computation log entry
    const log = await db.get<{ template_name: string; input_params: string; output_data: string; status: string }>(
      'SELECT template_name, input_params, output_data, status FROM market_computation_log WHERE id = ?', logId
    );
    if (!log || log.status !== 'success' || !log.output_data) return [];

    // Use the atom service to extract atoms from the computation output
    const atomService = (await import('./market-atom-service.js'));
    const svc = await atomService.createMarketAtomService(db);

    const content = `Computation template: ${log.template_name}\nInput: ${log.input_params?.slice(0, 500)}\nOutput: ${log.output_data.slice(0, 4000)}`;
    const atomIds = await svc.extractAtomsFromRawData(logId, content, 'computation');

    return atomIds;
  }

  return {
    listTemplates,
    runTemplate,
    getLog,
    getRecentLogs,
    computationToAtoms,
  };
}

export type MarketComputationService = Awaited<ReturnType<typeof createMarketComputationService>>;
