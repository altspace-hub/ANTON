/**
 * cost-basis/average.ts — Sweden's `genomsnittsmetoden`, France's
 * `méthode du prix moyen pondéré`, Canada's adjusted cost base (close
 * variant).
 *
 * Pool-based: every acquisition rolls into a running average. Every
 * disposal pulls cost basis from that average at the current
 * unit-of-account, regardless of which "lot" was bought when.
 *
 *   acquire 10 FTC @ 100 SEK → pool: qty=10,    basis=1000
 *   acquire 5  FTC @ 200 SEK → pool: qty=15,    basis=2000, avg=133.33
 *   dispose 6  FTC for 1500  → cost=6×133.33=800, gain=700,
 *                              pool: qty=9, basis=1200, avg=133.33
 *
 * Holding-period checks (DE 365-day rule, etc.) are not meaningful
 * under AVERAGE because the pool is fungible — that's why no
 * jurisdiction with long-term relief mandates AVERAGE.
 *
 * Sweden's K4 form expects exactly this method; no override permitted.
 */
import type { TaxInputTx } from '../transaction.js';
import type { CostBasisFn, GainLossEntry, GainLossLedger } from './types.js';

export const average: CostBasisFn = (txs: TaxInputTx[]): GainLossLedger => {
  // Sort by ts ascending — ordering matters even for AVERAGE because
  // each dispose pulls from the pool *at that moment*.
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);

  // Pool state — atomic units + fiat basis kept as numbers since
  // SEK/EUR/USD precision tolerates float math at typical retail
  // scales. The atomic side is kept as bigint to avoid precision drift
  // on micro-FTC quantities.
  let poolQtyAtomic = 0n;
  let poolBasisFiat = 0;
  let fiatCurrency = '';

  const entries: GainLossEntry[] = [];

  for (const tx of sorted) {
    const qty = BigInt(tx.amount);
    if (!fiatCurrency) fiatCurrency = tx.fiatCurrency;

    if (isAcquisition(tx)) {
      // Add to the pool. The acquisition's fiat value sets the cost.
      poolQtyAtomic += qty;
      poolBasisFiat += tx.fiatValueAtTx;
      continue;
    }

    if (isDisposal(tx)) {
      if (poolQtyAtomic === 0n) {
        // Selling from an empty pool — record a zero-basis disposal so
        // the proceeds still show up as fully-taxable gain. The user's
        // adviser will catch this anomaly during review.
        entries.push({
          txId: tx.id,
          ts: tx.ts,
          amountAtomic: tx.amount,
          proceedsFiat: tx.fiatValueAtTx,
          costBasisFiat: 0,
          gainLossFiat: tx.fiatValueAtTx,
          acquiredTs: null,
          fiatCurrency: tx.fiatCurrency,
        });
        continue;
      }

      // Pull cost basis at the current pool-average. Done in fiat-per-
      // atomic-unit so the math is identical regardless of pool size.
      const fiatPerAtomic = poolBasisFiat / Number(poolQtyAtomic);
      const costBasis = fiatPerAtomic * Number(qty);
      const proceeds = tx.fiatValueAtTx;

      entries.push({
        txId: tx.id,
        ts: tx.ts,
        amountAtomic: tx.amount,
        proceedsFiat: proceeds,
        costBasisFiat: costBasis,
        gainLossFiat: proceeds - costBasis,
        acquiredTs: null,
        fiatCurrency: tx.fiatCurrency,
      });

      poolQtyAtomic -= qty;
      poolBasisFiat -= costBasis;
      // Floating-point guards — pool basis can drift to ±epsilon on
      // exact draw-downs.
      if (poolQtyAtomic <= 0n) {
        poolQtyAtomic = 0n;
        poolBasisFiat = 0;
      }
    }

    // refund_received, refund_sent, fee — handled in the orchestrator
    // (refund tagging per §7.4 is rule-conditional, not method-conditional).
    // stake_reward / airdrop / mining_reward — income, not capital — also
    // orchestrator-level.
  }

  return {
    entries,
    remainingAtomic: poolQtyAtomic.toString(),
    remainingBasisFiat: poolBasisFiat,
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
