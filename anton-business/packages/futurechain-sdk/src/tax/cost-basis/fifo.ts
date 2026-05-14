/**
 * cost-basis/fifo.ts — First-In-First-Out lot matching.
 *
 * Default for DE / ES / FI / AT / IE / AU and the fallback for US
 * (when Specific ID isn't elected). Lots are matched oldest-first;
 * each disposal eats from the oldest unmatched lot, partially or
 * fully, then moves to the next.
 *
 *   acquire 10 @ 100 (t=1)         lots: [10@100]
 *   acquire 5  @ 200 (t=2)         lots: [10@100, 5@200]
 *   dispose 6  for 1500 (t=3)      → match 6 from t=1 lot at
 *                                    basis=600, proceeds=1500,
 *                                    gain=900, acquiredTs=1
 *                                  lots: [4@100, 5@200]
 *
 * Holding-period (Germany's 365-day rule, AU 50% discount, etc.) is
 * computed in the orchestrator against `acquiredTs` on each matched
 * entry — that's why FIFO surfaces it on the GainLossEntry.
 */
import type { TaxInputTx } from '../transaction.js';
import type { CostBasisFn, GainLossEntry, GainLossLedger } from './types.js';

interface Lot {
  ts: number;
  remainingAtomic: bigint;
  /** Total fiat basis of the *original* lot. We track remainingFiat
   *  proportionally as the lot is drawn down. */
  remainingFiat: number;
  /** Original atomic-units of the lot — kept so the proportional
   *  basis withdrawal stays precise even after several partial draws. */
  originalAtomic: bigint;
  originalFiat: number;
}

export const fifo: CostBasisFn = (txs: TaxInputTx[]): GainLossLedger => {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const lots: Lot[] = [];
  const entries: GainLossEntry[] = [];

  for (const tx of sorted) {
    const qty = BigInt(tx.amount);

    if (isAcquisition(tx)) {
      lots.push({
        ts: tx.ts,
        remainingAtomic: qty,
        remainingFiat: tx.fiatValueAtTx,
        originalAtomic: qty,
        originalFiat: tx.fiatValueAtTx,
      });
      continue;
    }

    if (!isDisposal(tx)) continue;

    let remainingToDispose = qty;
    let totalBasis = 0;
    // Pick the acquiredTs from the *first* lot consumed — that's what
    // FIFO is. Multi-lot disposals get the oldest lot's date for
    // holding-period purposes (some jurisdictions split this; the
    // orchestrator can override per-rule).
    let firstAcquiredTs: number | null = null;

    while (remainingToDispose > 0n && lots.length > 0) {
      const lot = lots[0]!;
      if (firstAcquiredTs === null) firstAcquiredTs = lot.ts;

      if (lot.remainingAtomic <= remainingToDispose) {
        // Lot fully consumed.
        totalBasis += lot.remainingFiat;
        remainingToDispose -= lot.remainingAtomic;
        lots.shift();
      } else {
        // Partial consumption — pull a proportional slice of basis.
        // Compute the fraction in fiat against the *original* lot so
        // we don't compound drift over multiple partial draws.
        const fraction = Number(remainingToDispose) / Number(lot.originalAtomic);
        const basisSlice = lot.originalFiat * fraction;
        totalBasis += basisSlice;
        lot.remainingAtomic -= remainingToDispose;
        lot.remainingFiat -= basisSlice;
        remainingToDispose = 0n;
      }
    }

    if (remainingToDispose > 0n) {
      // Disposed more than the pool held — zero-basis remainder.
      // Same handling as the AVERAGE engine.
      entries.push({
        txId: tx.id,
        ts: tx.ts,
        amountAtomic: tx.amount,
        proceedsFiat: tx.fiatValueAtTx,
        costBasisFiat: totalBasis,
        gainLossFiat: tx.fiatValueAtTx - totalBasis,
        acquiredTs: firstAcquiredTs,
        fiatCurrency: tx.fiatCurrency,
      });
      continue;
    }

    entries.push({
      txId: tx.id,
      ts: tx.ts,
      amountAtomic: tx.amount,
      proceedsFiat: tx.fiatValueAtTx,
      costBasisFiat: totalBasis,
      gainLossFiat: tx.fiatValueAtTx - totalBasis,
      acquiredTs: firstAcquiredTs,
      fiatCurrency: tx.fiatCurrency,
    });
  }

  const remainingAtomic = lots.reduce((a, l) => a + l.remainingAtomic, 0n);
  const remainingBasisFiat = lots.reduce((a, l) => a + l.remainingFiat, 0);
  return {
    entries,
    remainingAtomic: remainingAtomic.toString(),
    remainingBasisFiat,
  };
};

function isAcquisition(tx: TaxInputTx): boolean {
  return (
    tx.kind === 'buy_with_fiat' ||
    tx.kind === 'receive_as_payment' ||
    tx.kind === 'gift_received'
  );
}

function isDisposal(tx: TaxInputTx): boolean {
  return (
    tx.kind === 'sell_to_fiat' ||
    tx.kind === 'spend' ||
    tx.kind === 'swap' ||
    tx.kind === 'gift_sent'
  );
}
