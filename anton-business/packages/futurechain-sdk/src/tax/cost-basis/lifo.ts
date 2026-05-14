/**
 * cost-basis/lifo.ts — Last-In-First-Out lot matching.
 *
 * Permitted by Italy (§6.1 IT) as the explicit alternative to
 * weighted average. Same partial-consumption + acquiredTs handling
 * as FIFO, just newest-lot-first.
 *
 * Note: LIFO is generally LESS user-favourable than HIFO when prices
 * are rising (newest lot = highest cost = highest basis = lowest
 * gain, similar to HIFO in a monotonically-increasing market) but
 * DIFFERS in a mixed market. The Italian rule allows the user to
 * pick the method per-asset per-year as part of the optional
 * optimization (see IT.cost_basis_method.optimization_allowed).
 */
import type { TaxInputTx } from '../transaction.js';
import type { CostBasisFn, GainLossEntry, GainLossLedger } from './types.js';

interface Lot {
  ts: number;
  remainingAtomic: bigint;
  remainingFiat: number;
  originalAtomic: bigint;
  originalFiat: number;
}

export const lifo: CostBasisFn = (txs: TaxInputTx[]): GainLossLedger => {
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
    // LIFO picks the *newest* lot first — drives the
    // acquiredTs reported on the result (engine uses it for the
    // holding-period check). For multi-lot draws we report the
    // first (= newest) lot's ts.
    let firstAcquiredTs: number | null = null;

    while (remainingToDispose > 0n && lots.length > 0) {
      const lot = lots[lots.length - 1]!; // newest = last pushed
      if (firstAcquiredTs === null) firstAcquiredTs = lot.ts;

      if (lot.remainingAtomic <= remainingToDispose) {
        totalBasis += lot.remainingFiat;
        remainingToDispose -= lot.remainingAtomic;
        lots.pop();
      } else {
        const fraction = Number(remainingToDispose) / Number(lot.originalAtomic);
        const basisSlice = lot.originalFiat * fraction;
        totalBasis += basisSlice;
        lot.remainingAtomic -= remainingToDispose;
        lot.remainingFiat -= basisSlice;
        remainingToDispose = 0n;
      }
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
  return tx.kind === 'buy_with_fiat' || tx.kind === 'receive_as_payment' || tx.kind === 'gift_received';
}
function isDisposal(tx: TaxInputTx): boolean {
  return tx.kind === 'sell_to_fiat' || tx.kind === 'spend' || tx.kind === 'swap' || tx.kind === 'gift_sent';
}
