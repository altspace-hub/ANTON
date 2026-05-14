/**
 * reporting/index.ts — adviser-facing export formatters.
 *
 * Phase 3 ships:
 *   - K4 dataset + CSV (Sweden Skatteverket section D)
 *   - Cross-jurisdiction ledger CSV (raw engine output, used as the
 *     §8.3 export for refused/unsupported jurisdictions)
 *
 * Phase 4+ adds: US Form 8949, UK Self Assessment, ZA ITR12,
 * jurisdiction-specific HTML summaries, CARF/DAC8 dataset.
 */
export { buildK4Dataset } from './k4.js';
export type { K4BuildOptions, K4Dataset, K4Row } from './k4.js';
export { buildK4Csv, buildLedgerCsv } from './csv.js';
