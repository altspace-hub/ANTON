/**
 * transaction.ts — the engine's input shape.
 *
 * The Comm App's IDB ledger (src/comm/services/transactions.ts)
 * maps to this via a thin adapter — the engine doesn't see
 * IndexedDB types. Kept minimal so any host (Comm App, Heimdall
 * Module 19, batch importer) can feed it.
 */

/** Mirrors the spec's taxable-event taxonomy in §4 + §7.4 refund
 *  flow. Spend / receive / swap line up with `taxable_events`
 *  fields in the jurisdiction rule. */
export type TxKind =
  | 'buy_with_fiat'      // cost-basis acquisition only (almost never taxable on its own)
  | 'sell_to_fiat'       // disposal
  | 'spend'              // disposal — most common in payment flows
  | 'receive_as_payment' // income-side acquisition
  | 'swap'               // crypto-to-crypto (FR not taxable; most others taxable)
  | 'refund_sent'        // tagged refund — §7.4
  | 'refund_received'    // tagged refund — §7.4
  | 'stake_reward'
  | 'airdrop'
  | 'mining_reward'
  | 'gift_sent'
  | 'gift_received'
  | 'fee';               // informational

export interface TaxInputTx {
  /** Stable per-tx id from the host's ledger. */
  id: string;
  /** Unix-ms of the disposal/acquisition event. Used for cost-basis
   *  ordering + holding-period checks + tax-year bucketing. */
  ts: number;
  kind: TxKind;
  /** Counterparty (address, merchant id, or label). Used for refund
   *  linking + audit trail; not used in the gain/loss math. */
  counterparty?: string;
  /** Asset quantity in atomic units (e.g. micro-FTC). Stored as
   *  string so bigint round-trips cleanly through structured-clone
   *  and JSON. */
  amount: string;
  /** Atomic units per whole asset (e.g. 1_000_000 for micro-FTC). */
  decimals: number;
  /** Fair-market value in local currency at the moment of the event.
   *  For disposals this drives the gain/loss calc; for acquisitions
   *  it sets the cost basis. */
  fiatValueAtTx: number;
  /** ISO-4217 currency for `fiatValueAtTx`. */
  fiatCurrency: string;
  /** Optional: the v1 FTC reference (ADR-004) if this was a merchant
   *  payment — used to link refunds back per §7.4. */
  ref?: string;
  /** Optional: tx hash, kept for the audit ledger. */
  txHash?: string;
  /** Optional: link back to the original tx for refund pairs. */
  refundOf?: string;
}

/** Helper to convert atomic-units string + decimals into a number of
 *  whole tokens (e.g. micro-FTC string → FTC). Mid-precision; the
 *  engine still does its actual math in atomic units to avoid float
 *  drift on multi-tx pools. */
export function toWhole(amountAtomic: string, decimals: number): number {
  const scale = 10 ** decimals;
  return Number(BigInt(amountAtomic)) / scale;
}
