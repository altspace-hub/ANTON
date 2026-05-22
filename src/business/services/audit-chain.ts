/**
 * audit-chain.ts — verifies the tamper-evident chains.
 *
 * Wave 5 stamps every kvitto with `prevHash` (the SHA-256 of the
 * previous kvitto's immutable creation record) and every Z-report
 * with `prevHash` (the previous Z's `selfHash`) + an Ed25519
 * `signature`. Until now those fields were *written but never read* —
 * a "tamper-evident" chain that nothing ever walked is tamper-evident
 * in name only.
 *
 * This module is the missing verifier. It walks both chains and
 * re-derives every link, so an auditor (or the merchant) can actually
 * prove the books were not altered:
 *
 *   • checkReceiptChain()  — every kvitto's prevHash === hash(prev).
 *   • checkZReportChain()  — every Z's prevHash === prev.selfHash,
 *                            and (optionally) each Z's own self-hash
 *                            + Ed25519 signature.
 *   • checkReconciliation()— each Z's recorded sales total still
 *                            equals the live sum of the kvittos in
 *                            its range. A mismatch is a softer signal
 *                            than a chain break: it can be a
 *                            legitimate post-close void OR tampering
 *                            — it says "investigate", not "forged".
 *
 * The `check*` functions are pure — arrays in, result out, no IO — so
 * they unit-test without IndexedDB. The `verify*` / `verifyBooks`
 * wrappers load from the store and delegate.
 */
import { listReceipts, receiptChainHash } from './receipts';
import { listZReports, verifyZReport } from './z-reports';
import type { Receipt, ZReport } from './types';

/** A single detected problem. `kind` distinguishes a hard tamper
 *  signal (`receipt`/`zreport` chain break, `signature` failure) from
 *  the softer `reconciliation` mismatch. */
export interface ChainFinding {
  kind: 'receipt' | 'zreport' | 'signature' | 'reconciliation';
  /** kvittoNumber or zNumber the finding sits on. */
  at: number;
  detail: string;
  /** true = a hard integrity break; false = investigate-worthy. */
  hard: boolean;
}

export interface ChainVerifyResult {
  ok: boolean;
  /** How many links/records were checked. */
  checked: number;
  findings: ChainFinding[];
}

// ───────────────────────────────────────────────────────────────────────
// Pure core — receipt chain
// ───────────────────────────────────────────────────────────────────────

/**
 * Walk the kvitto chain in ascending kvittoNumber order. For each
 * adjacent pair assert `current.prevHash === receiptChainHash(prev)`.
 * The first kvitto must carry no prevHash; a missing prevHash on a
 * later kvitto (pre-Wave-5 data) is reported but not a hard break.
 *
 * Pure — pass the full receipt set; order does not matter, it sorts.
 */
export function checkReceiptChain(receipts: readonly Receipt[]): ChainVerifyResult {
  const all = receipts.slice().sort((a, b) => a.kvittoNumber - b.kvittoNumber);
  const findings: ChainFinding[] = [];
  let checked = 0;

  for (let i = 0; i < all.length; i++) {
    const cur = all[i]!;
    const prev = i > 0 ? all[i - 1]! : null;

    if (!prev) {
      if (cur.prevHash) {
        findings.push({
          kind: 'receipt', at: cur.kvittoNumber, hard: true,
          detail: `first kvitto carries a prevHash (${cur.prevHash.slice(0, 12)}…) but has no predecessor`,
        });
      }
      continue;
    }

    // A gap in the gap-free Bokföringslagen sequence is itself a break.
    if (cur.kvittoNumber !== prev.kvittoNumber + 1) {
      findings.push({
        kind: 'receipt', at: cur.kvittoNumber, hard: true,
        detail: `sequence gap — K-${prev.kvittoNumber} is followed by K-${cur.kvittoNumber}`,
      });
    }

    if (cur.prevHash === undefined) {
      findings.push({
        kind: 'receipt', at: cur.kvittoNumber, hard: false,
        detail: 'no prevHash — kvitto predates the Wave-5 chain',
      });
      continue;
    }

    checked++;
    if (cur.prevHash !== receiptChainHash(prev)) {
      findings.push({
        kind: 'receipt', at: cur.kvittoNumber, hard: true,
        detail: `prevHash mismatch — K-${cur.kvittoNumber}.prevHash does not match K-${prev.kvittoNumber}; ` +
                `K-${prev.kvittoNumber} has been altered since it was issued`,
      });
    }
  }

  return { ok: findings.every((f) => !f.hard), checked, findings };
}

// ───────────────────────────────────────────────────────────────────────
// Pure core — Z-report chain
// ───────────────────────────────────────────────────────────────────────

/**
 * Walk the Z-report chain in ascending zNumber order. Asserts each
 * Z's `prevHash === previousZ.selfHash`. When `publicKeyHex` is
 * given, also runs `verifyZReport` on every Z — re-deriving its
 * `selfHash` from the canonical JSON and checking the Ed25519
 * signature against the merchant key.
 *
 * Pure — pass the full Z-report set; order does not matter.
 */
export function checkZReportChain(
  zReports: readonly ZReport[],
  publicKeyHex?: string,
): ChainVerifyResult {
  const all = zReports.slice().sort((a, b) => a.zNumber - b.zNumber);
  const findings: ChainFinding[] = [];
  let checked = 0;

  for (let i = 0; i < all.length; i++) {
    const cur = all[i]!;
    const prev = i > 0 ? all[i - 1]! : null;

    if (publicKeyHex && !verifyZReport(cur, publicKeyHex)) {
      findings.push({
        kind: 'signature', at: cur.zNumber, hard: true,
        detail: `Z-${cur.zNumber} fails self-hash or Ed25519 signature verification`,
      });
    }

    if (!prev) {
      if (cur.prevHash) {
        findings.push({
          kind: 'zreport', at: cur.zNumber, hard: true,
          detail: 'first Z-report carries a prevHash but has no predecessor',
        });
      }
      continue;
    }

    if (cur.zNumber !== prev.zNumber + 1) {
      findings.push({
        kind: 'zreport', at: cur.zNumber, hard: true,
        detail: `sequence gap — Z-${prev.zNumber} is followed by Z-${cur.zNumber}`,
      });
    }

    checked++;
    if (cur.prevHash !== prev.selfHash) {
      findings.push({
        kind: 'zreport', at: cur.zNumber, hard: true,
        detail: `prevHash mismatch — Z-${cur.zNumber}.prevHash does not match Z-${prev.zNumber}.selfHash; ` +
                `Z-${prev.zNumber} has been altered since it was closed`,
      });
    }
  }

  return { ok: findings.every((f) => !f.hard), checked, findings };
}

// ───────────────────────────────────────────────────────────────────────
// Pure core — Z ↔ kvitto reconciliation
// ───────────────────────────────────────────────────────────────────────

/**
 * For each Z-report, re-sum the kvittos in its [from..to] range and
 * compare to the gross total the Z recorded at close. A mismatch is
 * NOT a hard break — a legitimate void processed after the day closed
 * also produces one. It is surfaced so an auditor knows to ask why
 * the day's frozen total no longer matches the live receipts.
 *
 * Pure — pass all receipts + all Z-reports.
 */
export function checkReconciliation(
  receipts: readonly Receipt[],
  zReports: readonly ZReport[],
): ChainVerifyResult {
  const byNumber = new Map<number, Receipt>();
  for (const r of receipts) byNumber.set(r.kvittoNumber, r);

  const findings: ChainFinding[] = [];
  let checked = 0;

  for (const z of zReports) {
    if (z.toKvittoNumber < z.fromKvittoNumber) continue; // empty window
    let liveGross = 0;
    for (let n = z.fromKvittoNumber; n <= z.toKvittoNumber; n++) {
      const r = byNumber.get(n);
      if (r && r.status !== 'voided') liveGross += r.amountSek;
    }
    checked++;
    // Tolerance for float rounding across the SEK sums.
    if (Math.abs(liveGross - z.salesGrossSek) > 0.01) {
      findings.push({
        kind: 'reconciliation', at: z.zNumber, hard: false,
        detail: `Z-${z.zNumber} recorded ${z.salesGrossSek.toFixed(2)} SEK gross but the kvittos ` +
                `K-${z.fromKvittoNumber}…K-${z.toKvittoNumber} now sum to ${liveGross.toFixed(2)} SEK — ` +
                'a void after close, or an altered receipt',
      });
    }
  }

  return { ok: true, checked, findings }; // soft signals only — never !ok
}

// ───────────────────────────────────────────────────────────────────────
// IO wrappers
// ───────────────────────────────────────────────────────────────────────

export async function verifyReceiptChain(): Promise<ChainVerifyResult> {
  return checkReceiptChain(await listReceipts(1_000_000));
}

export async function verifyZReportChain(publicKeyHex?: string): Promise<ChainVerifyResult> {
  return checkZReportChain(await listZReports(1_000_000), publicKeyHex);
}

export interface BooksVerifyReport {
  /** true only when there is no HARD finding anywhere. */
  ok: boolean;
  receipts: ChainVerifyResult;
  zReports: ChainVerifyResult;
  reconciliation: ChainVerifyResult;
  /** Flat list of every finding, hard ones first. */
  allFindings: ChainFinding[];
}

/**
 * Run all three checks and fold them into one report. `publicKeyHex`
 * is the merchant wallet's public key — pass it to also verify the
 * Z-report Ed25519 signatures; omit it to check chain linkage only.
 */
export async function verifyBooks(publicKeyHex?: string): Promise<BooksVerifyReport> {
  const [receipts, zReports] = await Promise.all([
    listReceipts(1_000_000),
    listZReports(1_000_000),
  ]);
  const receiptResult = checkReceiptChain(receipts);
  const zResult = checkZReportChain(zReports, publicKeyHex);
  const reconResult = checkReconciliation(receipts, zReports);
  const allFindings = [...receiptResult.findings, ...zResult.findings, ...reconResult.findings]
    .sort((a, b) => Number(b.hard) - Number(a.hard));
  return {
    // reconciliation is soft-only (never !ok) — `ok` tracks the hard
    // chains: the receipt chain and the Z-report chain + signatures.
    ok: receiptResult.ok && zResult.ok,
    receipts: receiptResult,
    zReports: zResult,
    reconciliation: reconResult,
    allFindings,
  };
}
