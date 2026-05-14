/**
 * cost-basis/specific-id.ts — US Specific Identification.
 *
 * Per IRS Notice 2014-21 + Rev. Proc. 2024-28: a taxpayer may use
 * Specific Identification if they document which lots are being
 * disposed of at the time of the sale. The most common motivated
 * variant is HIFO (Highest-In-First-Out) — pick the highest-cost
 * lot first, minimising the realized gain.
 *
 * v1 implementation: matches disposals against the *highest-basis*
 * remaining lot first, breaking ties by oldest acquisition. That
 * gives the HIFO outcome the spec calls out as "real optimization"
 * in §6.3.
 *
 * Lot-level acquisition timestamp is preserved on each result entry
 * so the engine can apply long-term (>1 year) preferential rates.
 */
import type { TaxInputTx } from '../transaction.js';
import type { CostBasisFn, GainLossEntry, GainLossLedger } from './types.js';

interface Lot {
  ts: number;
  remainingAtomic: bigint;
  remainingFiat: number;
  originalAtomic: bigint;
  originalFiat: number;
  /** Cached per-atomic cost — drives the "highest basis first" pick. */
  unitCost: number;
}

export const specificId: CostBasisFn = (txs: TaxInputTx[]): GainLossLedger => {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const lots: Lot[] = [];
  const entries: GainLossEntry[] = [];

  for (const tx of sorted) {
    const qty = BigInt(tx.amount);

    if (isAcquisition(tx)) {
      const unitCost = Number(qty) > 0 ? tx.fiatValueAtTx / Number(qty) : 0;
      lots.push({
        ts: tx.ts,
        remainingAtomic: qty,
        remainingFiat: tx.fiatValueAtTx,
        originalAtomic: qty,
        originalFiat: tx.fiatValueAtTx,
        unitCost,
      });
      continue;
    }
    if (!isDisposal(tx)) continue;

    let remainingToDispose = qty;
    let totalBasis = 0;
    let firstAcquiredTs: number | null = null;

    while (remainingToDispose > 0n && lots.length > 0) {
      // HIFO: pick the lot with the highest unitCost; tie-break by
      // oldest ts so deterministic.
      let bestIdx = 0;
      for (let i = 1; i < lots.length; i++) {
        const a = lots[i]!;
        const b = lots[bestIdx]!;
        if (a.unitCost > b.unitCost || (a.unitCost === b.unitCost && a.ts < b.ts)) {
          bestIdx = i;
        }
      }
      const lot = lots[bestIdx]!;
      if (firstAcquiredTs === null) firstAcquiredTs = lot.ts;

      if (lot.remainingAtomic <= remainingToDispose) {
        totalBasis += lot.remainingFiat;
        remainingToDispose -= lot.remainingAtomic;
        lots.splice(bestIdx, 1);
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
