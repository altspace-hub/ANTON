/**
 * refund-tagging.ts — § 7.4 refund-as-cancellation pre-processor.
 *
 * If a refund is cryptographically tagged as `refund_of: <original
 * tx id>` within an agreed window (default 14 days per
 * Konsumentköplagen / EU Consumer Rights Directive), Anton's default
 * behaviour is to treat the pair as a cancelled taxable event:
 *   - no realized gain on the original disposal
 *   - no new acquisition on the refund
 *
 * The treatment is NOT legally settled in any jurisdiction yet. The
 * engine emits a `review_flag` on the result whenever this filter
 * activates so the UI's review-required banner surfaces.
 *
 * Both directions are handled:
 *   refund_sent     → cancels a prior `receive_as_payment`
 *   refund_received → cancels a prior `spend` or `sell_to_fiat`
 *
 * The filter is conservative — only paired txs with `refundOf` set
 * AND falling within the window get cancelled. Untagged refunds
 * flow through unmodified (host's adviser will spot them).
 */
import type { TaxInputTx } from './transaction.js';

/** Default refund window per §7.4 (Konsumentköplagen / EU CRD). */
export const DEFAULT_REFUND_WINDOW_DAYS = 14;

export interface RefundTagResult {
  /** Transactions that pass through to cost-basis. Cancelled pairs
   *  are removed entirely. */
  filtered: TaxInputTx[];
  /** Number of original-refund pairs that were cancelled — drives
   *  the review_flag surfacing in the engine. */
  cancelledPairCount: number;
}

export function applyRefundTagging(
  transactions: TaxInputTx[],
  windowDays: number = DEFAULT_REFUND_WINDOW_DAYS,
): RefundTagResult {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // Index originals by id so refunds can look them up.
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const cancelledIds = new Set<string>();

  for (const tx of transactions) {
    if (tx.kind !== 'refund_sent' && tx.kind !== 'refund_received') continue;
    if (!tx.refundOf) continue;
    const original = byId.get(tx.refundOf);
    if (!original) continue;

    // Window check.
    if (Math.abs(tx.ts - original.ts) > windowMs) continue;

    // Direction check — the refund's kind must invert the original's.
    // refund_received cancels a prior outbound disposal (spend / sell).
    // refund_sent cancels a prior inbound acquisition (receive_as_payment).
    if (tx.kind === 'refund_received' && !isOutboundDisposal(original.kind)) continue;
    if (tx.kind === 'refund_sent' && original.kind !== 'receive_as_payment') continue;

    cancelledIds.add(tx.id);
    cancelledIds.add(original.id);
  }

  const filtered = transactions.filter((t) => !cancelledIds.has(t.id));
  return { filtered, cancelledPairCount: cancelledIds.size / 2 };
}

function isOutboundDisposal(kind: TaxInputTx['kind']): boolean {
  return kind === 'spend' || kind === 'sell_to_fiat' || kind === 'swap';
}
