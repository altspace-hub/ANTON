/**
 * backup.test.ts — pure-function coverage for the CSV builder + the
 * overdue heuristic.
 */
import { describe, expect, it } from 'vitest';
import { buildCsv, buildHtmlSummary, isBackupOverdue } from '../backup-format';
import type { Receipt, MerchantConfig } from '../types';

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    kvittoNumber: 1,
    orderId: 'A1B2C3D4E5F6',
    merchantId: '21A58256',
    mode: 'simple',
    purpose: 'RETAIL',
    amountSek: 50,
    amountMicroFtc: 5_000_000n,
    ftcPerSek: 0.1,
    vatSek: 0,
    discountSek: 0,
    itemCount: 1,
    lines: null,
    vatBreakdown: [],
    qrUri: 'futurechain:pay?...',
    ref: 'v1: M:21A58256 O:A1B2C3D4E5F6 P:RETAIL',
    uetr: null,
    status: 'confirmed',
    createdAt: Date.parse('2026-05-14T12:00:00Z'),
    confirmedAt: Date.parse('2026-05-14T12:00:00Z'),
    ...over,
  };
}

function merchant(over: Partial<MerchantConfig> = {}): MerchantConfig {
  return {
    legalName: 'Karl Café AB',
    orgNr: 'SE5560000000',
    city: 'Stockholm',
    street: 'Drottninggatan 1',
    postcode: '11151',
    country: 'SE',
    vatRegistered: true,
    defaultVatRate: 12,
    safelloReceiveAddress: 'fc_safello',
    defaultMode: 'simple',
    nextKvittoNumber: 1,
    nextKreditNumber: 1,
    nextZNumber: 1,
    configuredAt: Date.now(),
    ftcPerSek: 0.1,
    lastBackupAt: 0,
    ...over,
  };
}

describe('buildCsv', () => {
  it('writes a header row + one row per receipt', () => {
    const csv = buildCsv([receipt(), receipt({ kvittoNumber: 2 })]);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('kvitto_number');
  });

  it('splits VAT by rate into the right columns', () => {
    const csv = buildCsv([receipt({
      vatBreakdown: [
        { rate: 12, netSek: 31.25, vatSek: 3.75 },
        { rate: 25, netSek: 63.2, vatSek: 15.8 },
      ],
    })]);
    const row = csv.trim().split('\n')[1]!.split(',');
    // Headers in order: …vat_0,vat_6,vat_12,vat_25,vat_total…
    // Find indices via the header row
    const headers = csv.split('\n')[0]!.split(',');
    expect(row[headers.indexOf('vat_0_sek')]).toBe('0.00');
    expect(row[headers.indexOf('vat_6_sek')]).toBe('0.00');
    expect(row[headers.indexOf('vat_12_sek')]).toBe('3.75');
    expect(row[headers.indexOf('vat_25_sek')]).toBe('15.80');
    expect(row[headers.indexOf('vat_total_sek')]).toBe('19.55');
  });

  it('csv-escapes references that contain commas', () => {
    const csv = buildCsv([receipt({ ref: 'v1: M:X, with comma' })]);
    expect(csv).toContain('"v1: M:X, with comma"');
  });

  it('renders BigInt amountMicroFtc as a decimal string (no scientific notation)', () => {
    const csv = buildCsv([receipt({ amountMicroFtc: 999_999_999_999_999_999n })]);
    expect(csv).toContain('999999999999999999');
    expect(csv).not.toContain('1e+');
  });

  it('emits an empty header-only file for no receipts', () => {
    const csv = buildCsv([]);
    expect(csv.split('\n')).toEqual(['kvitto_number,date_iso,status,mode,purpose,order_id,merchant_id,item_count,subtotal_sek,discount_sek,vat_0_sek,vat_6_sek,vat_12_sek,vat_25_sek,vat_total_sek,total_sek,amount_micro_ftc,ftc_per_sek,reference,uetr', '']);
  });
});

describe('buildHtmlSummary', () => {
  it('totals confirmed receipts and excludes voided ones from revenue', () => {
    const html = buildHtmlSummary([
      receipt({ kvittoNumber: 1, amountSek: 50, vatBreakdown: [{ rate: 12, netSek: 44.64, vatSek: 5.36 }] }),
      receipt({ kvittoNumber: 2, amountSek: 100, status: 'voided', vatBreakdown: [{ rate: 25, netSek: 80, vatSek: 20 }] }),
    ], merchant());
    expect(html).toContain('Total revenue (confirmed)</td><td>50.00 SEK');
    expect(html).toContain('Total VAT (confirmed)</td><td>5.36 SEK');
  });

  it('escapes HTML special chars in the merchant name', () => {
    const html = buildHtmlSummary([], merchant({ legalName: 'A & B <bar>' }));
    expect(html).toContain('A &amp; B &lt;bar&gt;');
    expect(html).not.toContain('A & B <bar>');
  });

  it('handles an empty archive', () => {
    const html = buildHtmlSummary([], merchant());
    expect(html).toContain('No kvittos yet');
  });
});

describe('isBackupOverdue', () => {
  it('is false for a fresh export', () => {
    expect(isBackupOverdue(merchant({ lastBackupAt: Date.now() }))).toBe(false);
  });

  it('is true for a never-exported config', () => {
    expect(isBackupOverdue(merchant({ lastBackupAt: 0 }))).toBe(true);
  });

  it('is true for >30 day-old exports', () => {
    const longAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    expect(isBackupOverdue(merchant({ lastBackupAt: longAgo }))).toBe(true);
  });

  it('is false for null config (pre-onboarding)', () => {
    expect(isBackupOverdue(null)).toBe(false);
  });
});
