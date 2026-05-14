/**
 * cost-basis/share-pooling.ts — UK Section 104 + same-day + 30-day
 * matching ("bed-and-breakfast" rule). Phase 7 rewrite.
 *
 * HMRC's three-step matching for fungible chargeable assets including
 * crypto (§6.2 GB):
 *
 *   1. SAME-DAY rule: disposal matched against any acquisitions on
 *      the same UTC day first. Multiple same-day acquisitions are
 *      pooled proportionally.
 *   2. 30-DAY ("bed-and-breakfast"): remainder matched against
 *      acquisitions in the NEXT 30 days, oldest-first within the
 *      window. The rule is meant to stop wash sales — if you sell
 *      at a loss then re-buy within 30 days, the matched basis
 *      comes from the new lot, not the long-held pool.
 *   3. SECTION 104 POOL: anything still unmatched draws from the
 *      pool at the running average.
 *
 * Acquisitions inside the 30-day window are CONSUMED by the disposal
 * — they don't enter the Section 104 pool. Acquisitions outside any
 * window go into the pool once their 30-day matching opportunity
 * has passed.
 */
import type { TaxInputTx } from '../transaction.js';
import type { CostBasisFn, GainLossEntry, GainLossLedger } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MATCHING_WINDOW_DAYS = 30; // UK Section 105

interface Acquisition {
  ts: number;
  remainingAtomic: bigint;
  remainingFiat: number;
  originalAtomic: bigint;
  originalFiat: number;
  /** Once an acquisition feeds the Section 104 pool, this flips true
   *  so we don't double-match against it on later passes. */
  consumedIntoPool: boolean;
}

/** Factory: produces a share-pooling CostBasisFn with the given
 *  forward matching window. UK uses 30 days (default); Ireland's
 *  4-week rule uses 28; any jurisdiction with a comparable rule
 *  can dial in its own window via rule.cost_basis_method
 *  .matching_window_days. */
export function makeSharePooling(matchingWindowDays = DEFAULT_MATCHING_WINDOW_DAYS): CostBasisFn {
  const matchingWindowMs = matchingWindowDays * DAY_MS;
  return (txs: TaxInputTx[]): GainLossLedger => sharePoolingImpl(txs, matchingWindowMs);
}

/** Default export — 30-day UK matching, backwards compatible with
 *  callers that didn't configure a window. The engine prefers
 *  makeSharePooling(rule.cost_basis_method.matching_window_days)
 *  for accurate per-jurisdiction behaviour. */
export const sharePooling: CostBasisFn = makeSharePooling(DEFAULT_MATCHING_WINDOW_DAYS);

function sharePoolingImpl(txs: TaxInputTx[], matchingWindowMs: number): GainLossLedger {
  const events = [...txs].sort((a, b) => a.ts - b.ts);
  const acquisitions: Acquisition[] = [];
  const eventOrder: Array<
    | { kind: 'acq'; tx: TaxInputTx }
    | { kind: 'disp'; tx: TaxInputTx }
  > = [];

  for (const tx of events) {
    if (isAcquisition(tx)) {
      acquisitions.push({
        ts: tx.ts,
        remainingAtomic: BigInt(tx.amount),
        remainingFiat: tx.fiatValueAtTx,
        originalAtomic: BigInt(tx.amount),
        originalFiat: tx.fiatValueAtTx,
        consumedIntoPool: false,
      });
      eventOrder.push({ kind: 'acq', tx });
    } else if (isDisposal(tx)) {
      eventOrder.push({ kind: 'disp', tx });
    }
  }

  const entries: GainLossEntry[] = [];
  let poolQtyAtomic = 0n;
  let poolBasisFiat = 0;

  /** Move all acquisitions whose UTC day is STRICTLY before the
   *  current event's UTC day into the Section 104 pool, provided
   *  they still have unmatched quantity.
   *
   *  Reasoning: an unmatched acquisition A is pool-bound when no
   *  more rules can claim it. The same-day rule needs a disposal on
   *  A's UTC day (past disposals already had their chance; future
   *  events past A's day cannot satisfy same-day). The forward-30
   *  rule needs a PAST disposal D with A ∈ (D, D+30] (past disposals
   *  already had their chance). So once we observe an event on a
   *  later UTC day, A is settled. */
  function flushIntoPoolBefore(nowTs: number): void {
    for (const acq of acquisitions) {
      if (acq.consumedIntoPool) continue;
      if (acq.remainingAtomic <= 0n) continue;
      if (utcDayIndex(acq.ts) < utcDayIndex(nowTs)) {
        poolQtyAtomic += acq.remainingAtomic;
        poolBasisFiat += acq.remainingFiat;
        acq.remainingAtomic = 0n;
        acq.remainingFiat = 0;
        acq.consumedIntoPool = true;
      }
    }
  }

  for (const ev of eventOrder) {
    if (ev.kind === 'acq') continue;
    const tx = ev.tx;
    let remaining = BigInt(tx.amount);
    let totalBasis = 0;
    let acquiredTs: number | null = null;

    flushIntoPoolBefore(tx.ts);

    // (1) Same-day matching, pooled proportionally.
    const sameDayLots = acquisitions.filter(
      (a) => !a.consumedIntoPool && a.remainingAtomic > 0n && sameUtcDay(a.ts, tx.ts),
    );
    if (sameDayLots.length > 0 && remaining > 0n) {
      const totalSameDayAtomic = sameDayLots.reduce((a, l) => a + l.remainingAtomic, 0n);
      const totalSameDayFiat = sameDayLots.reduce((a, l) => a + l.remainingFiat, 0);
      const take = remaining < totalSameDayAtomic ? remaining : totalSameDayAtomic;
      const fraction = Number(take) / Number(totalSameDayAtomic);
      totalBasis += totalSameDayFiat * fraction;
      for (const lot of sameDayLots) {
        const lotFraction = Number(lot.remainingAtomic) / Number(totalSameDayAtomic);
        const lotTakeAtomic = BigInt(Math.floor(Number(take) * lotFraction));
        const lotTakeFiat = lot.remainingFiat * fraction;
        lot.remainingAtomic -= lotTakeAtomic;
        lot.remainingFiat -= lotTakeFiat;
      }
      remaining -= take;
      if (acquiredTs === null) acquiredTs = tx.ts;
    }

    // (2) 30-day forward match — oldest first within window.
    if (remaining > 0n) {
      const windowLots = acquisitions
        .filter((a) => !a.consumedIntoPool && a.remainingAtomic > 0n
                && a.ts > tx.ts && (a.ts - tx.ts) <= matchingWindowMs)
        .sort((a, b) => a.ts - b.ts);
      for (const lot of windowLots) {
        if (remaining === 0n) break;
        if (lot.remainingAtomic <= remaining) {
          totalBasis += lot.remainingFiat;
          remaining -= lot.remainingAtomic;
          if (acquiredTs === null) acquiredTs = lot.ts;
          lot.remainingAtomic = 0n;
          lot.remainingFiat = 0;
        } else {
          const fraction = Number(remaining) / Number(lot.originalAtomic);
          const basisSlice = lot.originalFiat * fraction;
          totalBasis += basisSlice;
          lot.remainingAtomic -= remaining;
          lot.remainingFiat -= basisSlice;
          if (acquiredTs === null) acquiredTs = lot.ts;
          remaining = 0n;
        }
      }
    }

    // (3) Section 104 pool — running average.
    if (remaining > 0n && poolQtyAtomic > 0n) {
      const take = remaining < poolQtyAtomic ? remaining : poolQtyAtomic;
      const fiatPerAtomic = poolBasisFiat / Number(poolQtyAtomic);
      const basis = fiatPerAtomic * Number(take);
      totalBasis += basis;
      poolQtyAtomic -= take;
      poolBasisFiat -= basis;
      if (poolQtyAtomic <= 0n) {
        poolQtyAtomic = 0n;
        poolBasisFiat = 0;
      }
      remaining -= take;
    }

    // Anything still unmatched is a zero-basis disposal (sold more
    // than the pool held — the user's adviser will catch this).

    entries.push({
      txId: tx.id,
      ts: tx.ts,
      amountAtomic: tx.amount,
      proceedsFiat: tx.fiatValueAtTx,
      costBasisFiat: totalBasis,
      gainLossFiat: tx.fiatValueAtTx - totalBasis,
      acquiredTs,
      fiatCurrency: tx.fiatCurrency,
    });
  }

  // Sweep any remaining acquisitions whose 30-day window has now
  // also passed into the pool — these are tail-end purchases past
  // the last disposal.
  flushIntoPoolBefore(Number.POSITIVE_INFINITY);

  return {
    entries,
    remainingAtomic: poolQtyAtomic.toString(),
    remainingBasisFiat: poolBasisFiat,
  };
}

function isAcquisition(tx: TaxInputTx): boolean {
  return tx.kind === 'buy_with_fiat' || tx.kind === 'receive_as_payment' || tx.kind === 'gift_received';
}
function isDisposal(tx: TaxInputTx): boolean {
  return tx.kind === 'sell_to_fiat' || tx.kind === 'spend' || tx.kind === 'swap' || tx.kind === 'gift_sent';
}

/** True if a and b fall on the same UTC calendar day. */
function sameUtcDay(a: number, b: number): boolean {
  return utcDayIndex(a) === utcDayIndex(b);
}

/** Integer day-since-epoch in UTC — comparison-friendly. */
function utcDayIndex(ts: number): number {
  if (!Number.isFinite(ts)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(ts / DAY_MS);
}
