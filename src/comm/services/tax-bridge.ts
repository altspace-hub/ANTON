/**
 * tax-bridge.ts — adapter between the Comm App's IDB wallet ledger
 * and the SDK's tax-engine input shape.
 *
 * `WalletTx` (this app) and `TaxInputTx` (@futurechain/sdk/tax) carry
 * the same information by design — the schemas were drawn up together
 * in Phase 1 — but the field names + kind taxonomy don't match
 * exactly. This module is the single translation point.
 *
 * Two responsibilities:
 *   1. Map WalletTxKind → TxKind (engine taxonomy).
 *   2. Filter / window transactions by tax year per the
 *      jurisdiction's calendar (calendar vs fiscal). Sweden = calendar
 *      so this is trivial for v1.
 */
import { tax } from '@futurechain/sdk';
import type { WalletTx, WalletTxKind } from './transactions';

/** Inline reference so dependent files don't need the namespace
 *  import dance. */
type TaxInputTx = ReturnType<typeof toTaxInputTxs>[number];
export type { TaxInputTx };

/** The Comm App ledger labels disposals from the *wallet's*
 *  perspective (send/receive). The engine's taxonomy is event-typed
 *  (sell_to_fiat/spend/receive_as_payment/etc.). Bridge them. */
const KIND_MAP: Record<WalletTxKind, tax.TxKind> = {
  send:             'spend',              // outbound payment for goods/services
  receive:          'receive_as_payment', // inbound payment from a customer / peer
  swap:             'swap',
  refund_sent:      'refund_sent',
  refund_received:  'refund_received',
  stake_reward:     'stake_reward',
  airdrop:          'airdrop',
  fee:              'fee',
};

export function toTaxInputTxs(walletTxs: WalletTx[]): tax.TaxInputTx[] {
  return walletTxs.map((w) => ({
    id: w.id,
    ts: w.ts,
    kind: KIND_MAP[w.kind],
    counterparty: w.counterparty,
    amount: w.amountMicroFtc,
    // FTC is micro-denominated; six decimals matches the Business app's
    // QR encoding and the @futurechain/sdk reference module.
    decimals: 6,
    fiatValueAtTx: w.fiatValueAtTx,
    fiatCurrency: w.fiatCurrency,
    ref: w.ref ?? undefined,
    txHash: w.txHash ?? undefined,
    refundOf: w.refundOf,
  }));
}

/** Tax-year window for a given rule (calendar OR fiscal). Returns
 *  the [fromTs, toTs] range to feed into listTxsByRange. Phase 7
 *  replaced the old calendarYearBounds: GB/AU/ZA now use their real
 *  fiscal year (Apr 6 – Apr 5 / Jul 1 – Jun 30 / Mar 1 – end Feb).
 */
export function taxYearBoundsForRule(
  rule: tax.JurisdictionRule,
  year: number,
): { fromTs: number; toTs: number; label: string } {
  return tax.taxYearBoundsForRule(rule, year);
}

/** Current tax-year label for a given rule + reference date. Used by
 *  the position / report screens to default to "this year". */
export function currentTaxYearForRule(rule: tax.JurisdictionRule, date = new Date()): number {
  return tax.currentTaxYearForRule(rule, date);
}

/** Legacy calendar-only helpers — kept for any caller that still
 *  expects calendar bounds. New callers should prefer
 *  taxYearBoundsForRule so fiscal-year jurisdictions work correctly. */
export function calendarYearBounds(year: number): { fromTs: number; toTs: number } {
  return {
    fromTs: Date.UTC(year, 0, 1, 0, 0, 0, 0),
    toTs: Date.UTC(year, 11, 31, 23, 59, 59, 999),
  };
}

export function currentTaxYear(date = new Date()): number {
  return date.getUTCFullYear();
}
