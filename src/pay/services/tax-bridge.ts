/**
 * tax-bridge.ts — adapter between the Pay app's local ledger and the
 * SDK tax engine (#78).
 *
 * Two differences from Comm's tax-bridge:
 *
 *  1. SOURCE — Pay has two stores (PaymentRecord sends + ReceivedRecord
 *     receives), not one unified WalletTx ledger. We read both and fold
 *     them into the engine's `TaxInputTx` shape.
 *
 *  2. FIAT — Pay's records don't carry a stored `fiatValueAtTx` (there's
 *     no price oracle at send time), so we DERIVE an estimated SEK value
 *     from the user's profile rate (PayProfile.ftcPerSek = FTC per 1 SEK).
 *     It's a flat rate, so gains net to ~0; the real deliverables are the
 *     ledger view + the adviser CSV export, with the engine's §3
 *     disclaimer framing the estimate. (Mirrors Comm, which is equally
 *     SEK-centric until the oracle ships.)
 *
 * #76 TAXABLE FLAG — only a 'payment' (goods & services), or a legacy
 * untyped record from before #76, is a taxable disposal. Gift /
 * information / contract are exempt (paymentTypeMeta(pt).taxable === false)
 * and are EXCLUDED from the tax inputs entirely.
 */
import { tax } from '@futurechain/sdk';
import { listPayments, microFtcToFtc } from './payment';
import { listReceived } from './received';
import { loadProfile } from './profile';
import { paymentTypeMeta, type PaymentType } from './payment-type';
import type { PaymentRecord, ReceivedRecord } from './types';

/** Re-export so screens don't need the namespace import dance. */
export type TaxInputTx = tax.TaxInputTx;

/** Tax-year window for a rule (calendar OR fiscal — GB/AU/ZA differ).
 *  Thin pass-throughs so the screens import only from here. */
export function taxYearBoundsForRule(
  rule: tax.JurisdictionRule,
  year: number,
): { fromTs: number; toTs: number; label: string } {
  return tax.taxYearBoundsForRule(rule, year);
}

export function currentTaxYearForRule(rule: tax.JurisdictionRule, date = new Date()): number {
  return tax.currentTaxYearForRule(rule, date);
}

/** #76: only 'payment' (and legacy untyped, treated as a normal payment)
 *  is a taxable disposal. Single source of truth = paymentTypeMeta. */
function isTaxable(pt: PaymentType | undefined): boolean {
  if (pt === undefined) return true; // pre-#76 records were ordinary payments
  return paymentTypeMeta(pt).taxable;
}

/** Estimated local value in SEK. Pay has no price oracle — only the SEK
 *  estimate rate (ftcPerSek = FTC per 1 SEK), so SEK = ftc / ftcPerSek. */
function sekValue(amountMicroFtc: bigint, ftcPerSek: number): number {
  const ftc = microFtcToFtc(amountMicroFtc);
  return ftcPerSek > 0 ? ftc / ftcPerSek : 0;
}

const FIAT_CCY = 'SEK';
const DECIMALS = 6; // micro-FTC

/**
 * Build the engine inputs for the [fromTs, toTs] tax-year window from the
 * local ledger. Sent payments → `spend` disposals; received payments →
 * `receive_as_payment` acquisitions (needed for cost basis). Exempt
 * payment-types are skipped. Returned chronologically (cost-basis lots).
 */
/**
 * Pure core — window the ledger to [fromTs, toTs], drop exempt
 * payment-types, map to the engine shape, sort chronologically. Exported
 * separately from the IO wrapper so it's unit-testable without IndexedDB
 * (mirrors recipients.ts computeRecipientSections / activity.ts).
 */
export function computeTaxInputs(
  sent: PaymentRecord[],
  received: ReceivedRecord[],
  ftcPerSek: number,
  fromTs: number,
  toTs: number,
): tax.TaxInputTx[] {
  const out: tax.TaxInputTx[] = [];

  for (const p of sent) {
    if (p.paidAt < fromTs || p.paidAt > toTs) continue;
    if (!isTaxable(p.paymentType)) continue;
    out.push({
      id: p.id,
      ts: p.paidAt,
      kind: 'spend',
      counterparty: p.toAddress,
      amount: p.amountMicroFtc.toString(),
      decimals: DECIMALS,
      fiatValueAtTx: sekValue(p.amountMicroFtc, ftcPerSek),
      fiatCurrency: FIAT_CCY,
      ref: p.ref || undefined,
      txHash: p.txId,
    });
  }

  for (const r of received) {
    if (r.receivedAt < fromTs || r.receivedAt > toTs) continue;
    if (!isTaxable(r.paymentType)) continue;
    out.push({
      id: r.txId,
      ts: r.receivedAt,
      kind: 'receive_as_payment',
      counterparty: r.fromAddress,
      amount: r.amountMicroFtc.toString(),
      decimals: DECIMALS,
      fiatValueAtTx: sekValue(r.amountMicroFtc, ftcPerSek),
      fiatCurrency: FIAT_CCY,
      txHash: r.txId,
    });
  }

  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** IO wrapper — read both stores + the profile rate, then derive inputs. */
export async function buildTaxInputs(fromTs: number, toTs: number): Promise<tax.TaxInputTx[]> {
  const [sent, received, profile] = await Promise.all([
    listPayments(), listReceived(), loadProfile(),
  ]);
  return computeTaxInputs(sent, received, profile?.ftcPerSek ?? 0.1, fromTs, toTs);
}

/** Calendar-year bounds — used for the raw-ledger export when the
 *  residency jurisdiction isn't bundled (no rule → no fiscal calendar). */
export function calendarYearBounds(year: number): { fromTs: number; toTs: number } {
  return {
    fromTs: Date.UTC(year, 0, 1, 0, 0, 0, 0),
    toTs: Date.UTC(year, 11, 31, 23, 59, 59, 999),
  };
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * A plain CSV of the windowed ledger inputs — the adviser hand-off for
 * jurisdictions the engine doesn't yet support (§8.3). Deterministic
 * column order; values escaped. Built directly from the inputs (no engine
 * result), so it works even when computeTaxPosition would refuse.
 */
export function rawLedgerCsv(inputs: tax.TaxInputTx[]): string {
  const header = ['id', 'date', 'kind', 'counterparty', 'amount_ftc', 'fiat_value', 'fiat_currency', 'ref'];
  const rows = inputs.map((i) => [
    i.id,
    new Date(i.ts).toISOString().slice(0, 10),
    i.kind,
    i.counterparty ?? '',
    // Fixed precision (matches the SDK's buildLedgerCsv/buildK4Csv) so naive
    // CSV importers never see a float tail or scientific notation.
    tax.toWhole(i.amount, i.decimals).toFixed(i.decimals),
    i.fiatValueAtTx.toFixed(2),
    i.fiatCurrency,
    i.ref ?? '',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
