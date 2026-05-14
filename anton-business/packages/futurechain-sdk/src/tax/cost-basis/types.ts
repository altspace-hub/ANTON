/**
 * cost-basis/types.ts — shared shapes for the cost-basis engines.
 *
 * Each cost-basis method (average, FIFO, share-pooling, etc.) consumes
 * the same `TaxInputTx` stream and produces a `GainLossLedger`. The
 * engine orchestrator (engine.ts) doesn't care which method ran — it
 * just composes rate application + exemptions on top.
 */
import type { TaxInputTx } from '../transaction.js';

/** One realized disposal with its gain/loss number. */
export interface GainLossEntry {
  /** Original transaction id. */
  txId: string;
  /** Unix-ms — used for tax-year bucketing + holding-period checks. */
  ts: number;
  /** Atomic-units disposed of. */
  amountAtomic: string;
  /** Fiat value received (or its FMV equivalent for spends). */
  proceedsFiat: number;
  /** Fiat cost basis for the atomic units disposed of, as the method
   *  computed it (running average / FIFO matched lot / etc.). */
  costBasisFiat: number;
  /** proceedsFiat − costBasisFiat. Positive = gain, negative = loss. */
  gainLossFiat: number;
  /** Acquisition timestamp of the matched lot. For methods that have
   *  one (FIFO/HIFO/SHARE_POOLING). Null for AVERAGE since the basis
   *  is a running aggregate. Drives holding-period checks. */
  acquiredTs: number | null;
  /** ISO-4217 currency for all fiat values above. */
  fiatCurrency: string;
}

export interface GainLossLedger {
  entries: GainLossEntry[];
  /** Atomic-units remaining in the pool at the end of the input stream. */
  remainingAtomic: string;
  /** Fiat cost basis of what remains in the pool. For AVERAGE this is
   *  unit-of-account × remaining; for FIFO it's the sum of the
   *  unmatched lots. Used by the next year's continuation. */
  remainingBasisFiat: number;
}

/** A cost-basis method is a pure function over the input stream. */
export type CostBasisFn = (txs: TaxInputTx[]) => GainLossLedger;
