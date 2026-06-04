import { describe, it, expect } from 'vitest';
import { computeTaxInputs, calendarYearBounds, rawLedgerCsv } from '../tax-bridge';
import type { PaymentRecord, ReceivedRecord } from '../types';
import type { PaymentType } from '../payment-type';

const A = 'fc_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B = 'fc_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function sent(over: Partial<PaymentRecord> & { paymentType?: PaymentType } = {}): PaymentRecord {
  return {
    id: 'p1', paidAt: 1000, toAddress: A, amountMicroFtc: 1_000_000n, ref: '', txId: 'tx1',
    ...over,
  } as unknown as PaymentRecord;
}
function recv(over: Partial<ReceivedRecord> & { paymentType?: PaymentType } = {}): ReceivedRecord {
  return {
    txId: 't1', receivedAt: 1000, fromAddress: B, amountMicroFtc: 1_000_000n,
    ...over,
  } as unknown as ReceivedRecord;
}

// Wide window unless a test narrows it.
const W = { from: 0, to: 10_000 };

describe('computeTaxInputs', () => {
  it('maps a payment send to a spend disposal with an estimated SEK value', () => {
    const out = computeTaxInputs([sent({ paymentType: 'payment', amountMicroFtc: 2_000_000n })], [], 0.1, W.from, W.to);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'spend', amount: '2000000', decimals: 6,
      fiatCurrency: 'SEK', counterparty: A,
    });
    // 2 FTC at ftcPerSek 0.1 → 2 / 0.1 = 20 SEK.
    expect(out[0]!.fiatValueAtTx).toBe(20);
  });

  it('excludes gift / information / contract sends (exempt per #76)', () => {
    const out = computeTaxInputs(
      [
        sent({ id: 'a', paymentType: 'payment' }),
        sent({ id: 'b', paymentType: 'gift' }),
        sent({ id: 'c', paymentType: 'information' }),
        sent({ id: 'd', paymentType: 'contract' }),
      ], [], 0.1, W.from, W.to,
    );
    expect(out.map((i) => i.id)).toEqual(['a']);
  });

  it('treats a legacy untyped send as a taxable spend', () => {
    const out = computeTaxInputs([sent({ paymentType: undefined })], [], 0.1, W.from, W.to);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('spend');
  });

  it('maps a received payment to an acquisition; excludes received gifts', () => {
    const out = computeTaxInputs([], [
      recv({ txId: 'r1', paymentType: 'payment' }),
      recv({ txId: 'r2', paymentType: 'gift' }),
    ], 0.1, W.from, W.to);
    expect(out.map((i) => i.id)).toEqual(['r1']);
    expect(out[0]!.kind).toBe('receive_as_payment');
  });

  it('windows by [fromTs, toTs]', () => {
    const out = computeTaxInputs(
      [sent({ id: 'early', paidAt: 500 }), sent({ id: 'inside', paidAt: 1500 })],
      [], 0.1, 1000, 2000,
    );
    expect(out.map((i) => i.id)).toEqual(['inside']);
  });

  it('returns inputs sorted chronologically across sends + receives', () => {
    const out = computeTaxInputs(
      [sent({ id: 's3', paidAt: 3000 }), sent({ id: 's2', paidAt: 2000 })],
      [recv({ txId: 'r1', receivedAt: 1000 })],
      0.1, W.from, W.to,
    );
    expect(out.map((i) => i.ts)).toEqual([1000, 2000, 3000]);
  });

  it('degrades to 0 SEK when the rate is 0 (no divide-by-zero)', () => {
    const out = computeTaxInputs([sent({ paymentType: 'payment' })], [], 0, W.from, W.to);
    expect(out[0]!.fiatValueAtTx).toBe(0);
  });

  it('is inclusive at both window bounds (paidAt === fromTs and === toTs)', () => {
    // Guards the documented-inclusive contract against an accidental >=/<= refactor.
    const out = computeTaxInputs(
      [sent({ id: 'lo', paidAt: 1000 }), sent({ id: 'hi', paidAt: 2000 }), sent({ id: 'over', paidAt: 2001 })],
      [], 0.1, 1000, 2000,
    );
    expect(out.map((i) => i.id)).toEqual(['lo', 'hi']);
  });
});

describe('calendarYearBounds', () => {
  it('spans Jan 1 00:00 to Dec 31 23:59:59.999 UTC', () => {
    const { fromTs, toTs } = calendarYearBounds(2026);
    expect(fromTs).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    expect(toTs).toBe(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
  });
});

describe('rawLedgerCsv', () => {
  it('emits a header + one row per input, FTC whole units, with CSV escaping', () => {
    const inputs = computeTaxInputs(
      [sent({ id: 'p1', paidAt: Date.UTC(2026, 0, 15), paymentType: 'payment', amountMicroFtc: 2_500_000n, ref: 'a,b' })],
      [], 0.1, 0, Date.UTC(2027, 0, 1),
    );
    const csv = rawLedgerCsv(inputs);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,date,kind,counterparty,amount_ftc,fiat_value,fiat_currency,ref');
    expect(lines[1]).toContain('2026-01-15');
    expect(lines[1]).toContain('spend');
    expect(lines[1]).toContain('2.5');   // 2_500_000 micro → 2.5 FTC
    expect(lines[1]).toContain('SEK');
    expect(lines[1]).toContain('"a,b"'); // comma-bearing ref is quoted
  });

  it('formats numeric cells to fixed precision (no float tail / scientific notation)', () => {
    const inputs = computeTaxInputs(
      [sent({ id: 'p', paidAt: Date.UTC(2026, 0, 1), paymentType: 'payment', amountMicroFtc: 1_234_567n })],
      [], 0.07, 0, Date.UTC(2027, 0, 1),
    );
    const row = rawLedgerCsv(inputs).split('\n')[1]!;
    expect(row).not.toMatch(/e-/i); // no scientific notation
    const cells = row.split(','); // no comma-bearing cells in this fixture
    expect(cells[4]).toMatch(/^\d+\.\d{6}$/); // amount_ftc — exactly 6 decimals
    expect(cells[5]).toMatch(/^\d+\.\d{2}$/); // fiat_value — exactly 2 decimals
  });
});
