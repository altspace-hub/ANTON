/**
 * sie-export.ts — SIE 4 bookkeeping-file export.
 *
 * SIE 4 (Standard Importformat Erfarenheter, file type 4) is the
 * de-facto exchange format between Swedish accounting systems —
 * Bokio, Fortnox, Visma eEkonomi, SpeedLedger, Hogia, BL Bokföring
 * all import it. A merchant who can't hand their bokföringskonsult
 * a SIE 4 file will switch POS.
 *
 * One file per Z-rapport: a single SIE 4 document covering the
 * window between two daily closes. Records:
 *   #FLAGGA 0      — file is fresh (not re-import)
 *   #PROGRAM       — name + version
 *   #FORMAT PC8    — character set declaration
 *   #GEN           — generated-at timestamp
 *   #SIETYP 4      — file type
 *   #ORGNR         — merchant org-nr
 *   #FNAMN         — merchant legal name
 *   #RAR 0 ...     — fiscal year range (current calendar year)
 *   #VER A {n}     — one verification per kvitto + one per kreditnota
 *     #TRANS …    — debit + credit lines per VAT category
 *
 * BAS-konto default mapping (Sw. national chart of accounts 2025):
 *   1910 Kassa (or 1581 Kryptotillgångar — configurable)
 *   3001 Försäljning 25 % moms
 *   3002 Försäljning 12 % moms
 *   3041 Försäljning 6 % moms
 *   2611 Utgående moms 25 %
 *   2621 Utgående moms 12 %
 *   2631 Utgående moms 6 %
 *
 * The merchant's bokföringskonsult can override these via
 * MerchantConfig (out-of-scope here — accept the defaults for now).
 */
import { formatKreditNumber, formatKvittoNumber } from './types';
import { listReceipts } from './receipts';
import { listRefunds } from './refunds';
import { loadConfig } from './merchant';
import type { Receipt, RefundReceipt, ZReport, VatBreakdownEntry } from './types';

/** Sw. BAS-kontoplan account numbers — 2025. Default mapping; the
 *  merchant's accountant can override these in Settings (future). */
const ACCT = {
  cash: '1910',          // Kassa (could switch to 1581 for FTC)
  sales25: '3001',
  sales12: '3002',
  sales06: '3041',
  vat25Out: '2611',
  vat12Out: '2621',
  vat06Out: '2631',
};

/** SIE 4 strings use PC8 encoding which maps Å Ä Ö from Latin-1.
 *  Modern accounting software accepts UTF-8 with a BOM — we go with
 *  the latter for cleaner JS. The PC8 declaration is kept so older
 *  imports still parse the header even if the bytes are UTF-8. */
function sieEscape(s: string): string {
  // SIE strings are quoted when they contain whitespace or special
  // chars. Escape internal " and \ per SIE 4 spec §5.1.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function quote(s: string): string {
  return `"${sieEscape(s)}"`;
}

function fmtAmount(sek: number): string {
  // SIE 4 uses "." as decimal separator, no thousand separator.
  return sek.toFixed(2);
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function vatBreakdownToTrans(
  vatBreakdown: VatBreakdownEntry[],
  cashAccount: string,
  signMultiplier = 1,
): string[] {
  const lines: string[] = [];
  let cashTotal = 0;
  for (const v of vatBreakdown) {
    const net = v.netSek * signMultiplier;
    const vat = v.vatSek * signMultiplier;
    const gross = v.grossSek * signMultiplier;
    let salesAcct: string;
    let vatAcct: string;
    switch (v.ratePct) {
      case 25: salesAcct = ACCT.sales25; vatAcct = ACCT.vat25Out; break;
      case 12: salesAcct = ACCT.sales12; vatAcct = ACCT.vat12Out; break;
      case 6:  salesAcct = ACCT.sales06; vatAcct = ACCT.vat06Out; break;
      default: salesAcct = ACCT.sales25; vatAcct = ACCT.vat25Out; break;
    }
    // Sales is a credit (negative in SIE convention for debit-positive
    // accounts). Use the SIE sign convention: positive = debit,
    // negative = credit on the supplied account.
    lines.push(`   #TRANS ${salesAcct} {} ${fmtAmount(-net)}`);
    lines.push(`   #TRANS ${vatAcct} {} ${fmtAmount(-vat)}`);
    cashTotal += gross;
  }
  lines.push(`   #TRANS ${cashAccount} {} ${fmtAmount(cashTotal)}`);
  return lines;
}

function receiptToVer(r: Receipt): string {
  const verDate = fmtDate(r.createdAt);
  const text = formatKvittoNumber(r.kvittoNumber);
  const out: string[] = [];
  out.push(`#VER A ${r.kvittoNumber} ${verDate} ${quote(text)}`);
  out.push('{');
  for (const line of vatBreakdownToTrans(r.vatBreakdown, ACCT.cash, 1)) {
    out.push(line);
  }
  out.push('}');
  return out.join('\n');
}

function refundToVer(r: RefundReceipt): string {
  const verDate = fmtDate(r.createdAt);
  const text = `${formatKreditNumber(r.kreditNumber)} (ref ${formatKvittoNumber(r.originalKvittoNumber)})`;
  const out: string[] = [];
  // Number space: separate prefix range so refund verifications don't
  // collide with kvitto verifications. We pick 900000+ for kreditnotor.
  const verNum = 900000 + r.kreditNumber;
  out.push(`#VER A ${verNum} ${verDate} ${quote(text)}`);
  out.push('{');
  // Reversed VAT breakdown is already negative; pass signMultiplier=1.
  for (const line of vatBreakdownToTrans(r.vatBreakdownReversed, ACCT.cash, 1)) {
    out.push(line);
  }
  out.push('}');
  return out.join('\n');
}

/**
 * Build a SIE 4 file string for the window of a Z-rapport. The
 * returned string is ready to write to {`Z-0001.sie`} and email/share.
 *
 * Encoding: UTF-8 with no BOM (modern Swedish accounting software
 * accepts this). The header still declares `#FORMAT PC8` for legacy
 * compatibility; the BAS account numbers are pure ASCII so the only
 * non-ASCII bytes are in customer/merchant name strings.
 */
export async function buildSieForZ(z: ZReport): Promise<string> {
  const config = await loadConfig();
  if (!config) throw new Error('buildSieForZ: merchant not configured');

  const [allReceipts, allRefunds] = await Promise.all([
    listReceipts(2000),
    listRefunds(2000),
  ]);
  const receipts = allReceipts
    .filter(r => r.createdAt > z.openedAt && r.createdAt <= z.closedAt)
    .filter(r => r.status !== 'voided')
    .sort((a, b) => a.kvittoNumber - b.kvittoNumber);
  const refunds = allRefunds
    .filter(r => r.createdAt > z.openedAt && r.createdAt <= z.closedAt)
    .filter(r => r.status !== 'voided')
    .sort((a, b) => a.kreditNumber - b.kreditNumber);

  const now = fmtDate(z.closedAt);
  const year = new Date(z.closedAt).getUTCFullYear();
  const yearStart = `${year}0101`;
  const yearEnd = `${year}1231`;

  const header: string[] = [
    '#FLAGGA 0',
    '#PROGRAM "ANTON Business" "0.0.1"',
    '#FORMAT PC8',
    `#GEN ${now}`,
    '#SIETYP 4',
    `#ORGNR ${quote(config.orgNr)}`,
    `#FNAMN ${quote(config.legalName)}`,
    `#RAR 0 ${yearStart} ${yearEnd}`,
    // Accounts used in this file. Naming is conventional Swedish; an
    // accountant importing into Fortnox / Bokio will recognise them.
    `#KONTO ${ACCT.cash} ${quote('Kassa (FTC-mottagningar)')}`,
    `#KONTO ${ACCT.sales25} ${quote('Försäljning 25 % moms')}`,
    `#KONTO ${ACCT.sales12} ${quote('Försäljning 12 % moms')}`,
    `#KONTO ${ACCT.sales06} ${quote('Försäljning 6 % moms')}`,
    `#KONTO ${ACCT.vat25Out} ${quote('Utgående moms 25 %')}`,
    `#KONTO ${ACCT.vat12Out} ${quote('Utgående moms 12 %')}`,
    `#KONTO ${ACCT.vat06Out} ${quote('Utgående moms 6 %')}`,
  ];

  const vers: string[] = [];
  for (const r of receipts) vers.push(receiptToVer(r));
  for (const r of refunds) vers.push(refundToVer(r));

  // Z-report metadata as a trailing comment block so the auditor
  // can cross-reference the file to the signed Z.
  const footer: string[] = [
    `#KOMMENTAR ${quote(`Z-rapport ${z.zNumber} · ${quote.length}`)}`,
    `#KOMMENTAR ${quote(`Z self-hash: ${z.selfHash}`)}`,
    `#KOMMENTAR ${quote(`Z signature: ${z.signature.slice(0, 32)}…`)}`,
  ];

  return [...header, '', ...vers, '', ...footer, ''].join('\n');
}
