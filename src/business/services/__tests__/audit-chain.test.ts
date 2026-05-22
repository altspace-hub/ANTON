/**
 * audit-chain.test.ts — the tamper-evident chain verifier.
 *
 * Exercises the pure `check*` core: a clean chain passes, a single
 * altered field is caught, sequence gaps are caught, and the
 * lifecycle fields (status / confirmedAt / txHash) do NOT break the
 * chain — that last one is the whole point of the Wave-2 hardening:
 * confirming or voiding a kvitto must not invalidate the books.
 */
import { describe, it, expect } from 'vitest';
import {
  checkReceiptChain, checkZReportChain, checkReconciliation,
} from '../audit-chain';
import { receiptChainHash, RECEIPT_CHAIN_VERSION } from '../receipts';
import type { Receipt, ZReport } from '../types';

// ── builders ────────────────────────────────────────────────────────────

function mkReceipt(n: number, over: Partial<Receipt> = {}): Receipt {
  return {
    kvittoNumber: n,
    orderId: `ORD-${n}`,
    merchantId: 'M1',
    mode: 'simple',
    purpose: 'RETAIL',
    amountSek: 100,
    amountMicroFtc: 0n,
    ftcPerSek: 0.1,
    vatSek: 20,
    discountSek: 0,
    itemCount: 1,
    lines: null,
    vatBreakdown: [],
    qrUri: '',
    ref: `REF-${n}`,
    uetr: null,
    status: 'pending',
    createdAt: 1_700_000_000_000 + n * 1000,
    confirmedAt: null,
    chainVersion: RECEIPT_CHAIN_VERSION,
    ...over,
  };
}

/** Build a correctly-chained run of receipts K-1..K-count. */
function chainedReceipts(count: number): Receipt[] {
  const out: Receipt[] = [];
  for (let n = 1; n <= count; n++) {
    const r = mkReceipt(n);
    if (n > 1) r.prevHash = receiptChainHash(out[n - 2]!);
    out.push(r);
  }
  return out;
}

function mkZ(n: number, prev: ZReport | null, over: Partial<ZReport> = {}): ZReport {
  return {
    zNumber: n,
    openedAt: 0,
    closedAt: n * 1000,
    fromKvittoNumber: 0,
    toKvittoNumber: -1, // empty window unless overridden
    fromKreditNumber: 0,
    toKreditNumber: -1,
    salesGrossSek: 0,
    salesNetSek: 0,
    vatSek6: 0, vatSek12: 0, vatSek25: 0,
    voidsCount: 0, voidsGrossSek: 0,
    refundsCount: 0, refundsGrossSek: 0,
    tipsSek: 0,
    ftcReceivedMicro: 0n,
    prevHash: prev ? prev.selfHash : null,
    selfHash: `hash-of-Z${n}`,
    signature: `sig-${n}`,
    ...over,
  } as ZReport;
}

// ── receipt chain ───────────────────────────────────────────────────────

describe('checkReceiptChain', () => {
  it('passes a clean chain', () => {
    const r = checkReceiptChain(chainedReceipts(5));
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(4); // 4 links across 5 receipts
    expect(r.findings).toHaveLength(0);
  });

  it('is order-independent (sorts by kvittoNumber)', () => {
    const shuffled = chainedReceipts(5).reverse();
    expect(checkReceiptChain(shuffled).ok).toBe(true);
  });

  it('catches an altered amount on a chained kvitto', () => {
    const rs = chainedReceipts(5);
    rs[1]!.amountSek = 999; // tamper K-2 after K-3 chained it
    const r = checkReceiptChain(rs);
    expect(r.ok).toBe(false);
    const hard = r.findings.filter((f) => f.hard);
    expect(hard).toHaveLength(1);
    expect(hard[0]!.at).toBe(3); // K-3's prevHash no longer matches K-2
    expect(hard[0]!.detail).toMatch(/altered/);
  });

  it('does NOT break when a kvitto is confirmed or voided', () => {
    // The chain hashes only immutable creation fields. Mutating the
    // settlement lifecycle must leave every link valid.
    const rs = chainedReceipts(5);
    rs[1]!.status = 'confirmed';
    rs[1]!.confirmedAt = 1_700_000_999_999;
    rs[1]!.txHash = '0xdeadbeef';
    rs[2]!.status = 'voided';
    const r = checkReceiptChain(rs);
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('catches a sequence gap', () => {
    const rs = chainedReceipts(3);
    rs.splice(1, 1); // drop K-2 → K-1 then K-3
    const r = checkReceiptChain(rs);
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.hard && /sequence gap/.test(f.detail))).toBe(true);
  });

  it('flags a pre-Wave-5 kvitto (no prevHash) without a hard break', () => {
    const rs = chainedReceipts(3);
    delete rs[1]!.prevHash; // K-2 predates the chain
    const r = checkReceiptChain(rs);
    expect(r.ok).toBe(true); // soft only
    expect(r.findings.some((f) => !f.hard && /predates/.test(f.detail))).toBe(true);
  });

  it('downgrades a pre-v2 kvitto (old hash formula) to a soft finding', () => {
    // A kvitto written before the hardening pass carries a prevHash
    // from the old whole-row formula. It must NOT read as "altered".
    const rs = chainedReceipts(3);
    delete rs[1]!.chainVersion;          // K-2 predates v2
    rs[1]!.prevHash = 'old-formula-hash'; // its link can't be re-derived
    const r = checkReceiptChain(rs);
    expect(r.ok).toBe(true); // soft only — no false tamper alarm
    expect(r.findings.some((f) => !f.hard && /predates the v2 chain formula/.test(f.detail))).toBe(true);
    expect(r.findings.some((f) => f.hard)).toBe(false);
  });

  it('flags a prevHash on the first kvitto as a hard break', () => {
    const rs = chainedReceipts(2);
    rs[0]!.prevHash = 'abc123';
    expect(checkReceiptChain(rs).ok).toBe(false);
  });

  it('treats an empty store as ok', () => {
    expect(checkReceiptChain([]).ok).toBe(true);
  });
});

// ── Z-report chain ──────────────────────────────────────────────────────

describe('checkZReportChain', () => {
  it('passes a clean Z chain', () => {
    const z1 = mkZ(1, null);
    const z2 = mkZ(2, z1);
    const z3 = mkZ(3, z2);
    const r = checkZReportChain([z1, z2, z3]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
  });

  it('catches a broken prevHash link', () => {
    const z1 = mkZ(1, null);
    const z2 = mkZ(2, z1);
    z2.prevHash = 'tampered';
    const r = checkZReportChain([z1, z2]);
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.hard && f.at === 2)).toBe(true);
  });

  it('catches a Z sequence gap', () => {
    const z1 = mkZ(1, null);
    const z3 = mkZ(3, z1);
    expect(checkZReportChain([z1, z3]).ok).toBe(false);
  });
});

// ── reconciliation ──────────────────────────────────────────────────────

describe('checkReconciliation', () => {
  it('passes when the Z total matches the live kvittos', () => {
    const receipts = [
      mkReceipt(1, { amountSek: 100 }),
      mkReceipt(2, { amountSek: 250 }),
    ];
    const z = mkZ(1, null, { fromKvittoNumber: 1, toKvittoNumber: 2, salesGrossSek: 350 });
    const r = checkReconciliation(receipts, [z]);
    expect(r.findings).toHaveLength(0);
  });

  it('flags a soft mismatch when a kvitto was voided after close', () => {
    const receipts = [
      mkReceipt(1, { amountSek: 100 }),
      mkReceipt(2, { amountSek: 250, status: 'voided' }), // voided post-close
    ];
    const z = mkZ(1, null, { fromKvittoNumber: 1, toKvittoNumber: 2, salesGrossSek: 350 });
    const r = checkReconciliation(receipts, [z]);
    expect(r.ok).toBe(true); // soft — never !ok
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.hard).toBe(false);
    expect(r.findings[0]!.detail).toMatch(/void after close/);
  });
});
