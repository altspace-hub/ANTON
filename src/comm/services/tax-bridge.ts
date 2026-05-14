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
import type { tax } from '@futurechain/sdk';
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

/** Calendar-year window helpers. Sweden + most v1 jurisdictions use
 *  calendar; UK and AU use fiscal years which Phase 4 will pivot on
 *  when those rules activate. */
export function calendarYearBounds(year: number): { fromTs: number; toTs: number } {
  return {
    fromTs: Date.UTC(year, 0, 1, 0, 0, 0, 0),
    toTs: Date.UTC(year, 11, 31, 23, 59, 59, 999),
  };
}

export function currentTaxYear(date = new Date()): number {
  return date.getUTCFullYear();
}
