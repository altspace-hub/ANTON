/**
 * @futurechain/sdk/tax — jurisdiction-aware crypto-asset tax engine.
 *
 * Implements the rules + calculation engine in
 * `FUTURECHAIN_TAX_RULES.md` (canonical at the repo root). Designed
 * to be consumed by:
 *   - the Comm App's wallet → user-facing position + annual report
 *   - Heimdall Module 19 → server-side batch reporting
 *   - the Business app → near-zero merchant-swap confirmation
 *
 * Phase 1 status (2026-05-14):
 *   - Schema, transaction shape, §3 disclaimer: ✅
 *   - Cost-basis AVERAGE + FIFO: 🚧 in progress
 *   - Engine orchestrator: 🚧
 *   - SE rule block: 🚧
 *
 * The output of every public function carries the §3 disclaimer or
 * throws MissingDisclaimerError — that is non-negotiable per the
 * spec's §2 hard rules.
 */

export type {
  AssetType,
  CapitalGainsRates,
  Classification,
  Confidence,
  CostBasisMethod,
  CostBasisRule,
  ExemptionsAndReliefs,
  EmtSpecialTreatment,
  FtcClassification,
  FtcSpecificNotes,
  IncomeApplicability,
  IncomeRates,
  JurisdictionCode,
  JurisdictionRule,
  LegalStatus,
  LongTermHoldingRelief,
  LongTermHoldingTreatment,
  LossOffsetScope,
  LossTreatment,
  Metadata,
  ProgressiveBracket,
  RateStructure,
  Rates,
  ReportingFramework,
  StakingTreatment,
  TaxYear,
  TaxableEvents,
  ComputeOptions,
} from './schema.js';

export type { TaxInputTx, TxKind } from './transaction.js';
export { toWhole } from './transaction.js';

export type { DisclaimerInput, DisclaimerLocale } from './disclaimer.js';
export {
  SUPPORTED_LOCALES,
  buildDisclaimer,
  MissingDisclaimerError,
} from './disclaimer.js';

export type {
  GainLossEntry,
  GainLossLedger,
  CostBasisFn,
} from './cost-basis/index.js';
export {
  average,
  fifo,
  lifo,
  specificId,
  sharePooling,
  resolveCostBasis,
} from './cost-basis/index.js';

export { applyRate } from './rates.js';
export { applyLossOffset } from './loss-offset.js';
export type { LossOffsetInput, LossOffsetResult } from './loss-offset.js';
export { applyHoldingPeriod } from './holding-period.js';
export type { HeldEntry } from './holding-period.js';
export {
  taxYearBoundsForRule,
  taxYearBoundsForTaxYear,
  currentTaxYearForRule,
  currentTaxYear,
} from './tax-year.js';
export type { TaxYearBounds } from './tax-year.js';
export {
  applyRefundTagging,
  DEFAULT_REFUND_WINDOW_DAYS,
} from './refund-tagging.js';
export type { RefundTagResult } from './refund-tagging.js';

export {
  computeTaxPosition,
  isRefused,
} from './engine.js';

export {
  computeWealthTaxPosition,
  isWealthTaxResult,
} from './wealth-tax.js';
export type {
  WealthTaxInput,
  WealthTaxResult,
} from './wealth-tax.js';

export {
  getBundledRule,
  bundledJurisdictionCodes,
  activeJurisdictionCodes,
  SE,
  DE, FR, IT, GB, US, ES, PT, NL, ZA, NG, JP, SG, AE, AU, CH,
  CY, MT, BE, IE, PL, CA, KR, IL, BR, KE,
} from './rules/index.js';

export {
  buildK4Dataset,
  buildK4Csv,
  buildLedgerCsv,
} from './reporting/index.js';
export type {
  K4BuildOptions,
  K4Dataset,
  K4Row,
} from './reporting/index.js';
export type {
  AnnualSummary,
  PerTxResult,
  RefusalResult,
  TaxComputationInput,
  TaxComputationResult,
} from './engine.js';
