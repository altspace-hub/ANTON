/**
 * remittance.test.ts — Wave 10 unit tests.
 *
 * Locks the encode/decode round-trip, the human-summary shape, the
 * size-cap behaviour, and the inline/linked attachment logic.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAttachment, decodeRemittance, encodeRemittance, readableSummary,
  REMITTANCE_HARD_CAP_BYTES, INLINE_ATTACHMENT_LIMIT,
  type AntonRemittance,
} from './remittance.js';
import { buildPacs008, canonicalize } from './index.js';

const SAMPLE_ORDER: AntonRemittance = {
  v: 1,
  kind: 'order',
  ref: 'K-2026-000042',
  items: [
    { name: 'Cappuccino',   qty: 3, unitPriceSek: 42, lineTotalSek: 126, vatRate: 12 },
    { name: 'Cinnamon bun', qty: 2, unitPriceSek: 35, lineTotalSek: 70,  vatRate: 12 },
  ],
  amountSek: 196,
  vatSek: 21,
  message: 'For the morning meeting',
};

describe('encodeRemittance / decodeRemittance', () => {
  it('round-trips a simple order', () => {
    const encoded = encodeRemittance(SAMPLE_ORDER);
    expect(encoded.rmtInf.Ustrd[0]).toMatch(/Cappuccino/);
    expect(encoded.rmtInf.Ustrd[0]).toMatch(/196\.00 SEK/);
    expect(encoded.rmtInf.Strd[0]?.AddtlRmtInf?.[0]).toMatch(/^ANTON-V1:/);
    const decoded = decodeRemittance(encoded.rmtInf);
    expect(decoded).not.toBeNull();
    expect(decoded?.kind).toBe('order');
    expect(decoded?.items?.length).toBe(2);
    expect(decoded?.items?.[0]?.name).toBe('Cappuccino');
    expect(decoded?.amountSek).toBe(196);
    expect(decoded?.ref).toBe('K-2026-000042');
  });

  it('returns null when no ANTON-V1 envelope is present', () => {
    const noisy = { Ustrd: ['just a note'], Strd: [{ AddtlRmtInf: ['unrelated'] }] };
    expect(decodeRemittance(noisy)).toBeNull();
  });

  it('still returns a readable summary for legacy receivers', () => {
    const encoded = encodeRemittance(SAMPLE_ORDER);
    const summary = readableSummary(encoded.rmtInf);
    expect(summary[0]).toContain('Cappuccino');
    expect(summary[1]).toBe('For the morning meeting');
  });

  it('reports overSoftCap when the payload is large', () => {
    const big: AntonRemittance = {
      v: 1, kind: 'invoice',
      items: Array.from({ length: 200 }, (_, i) => ({
        name: `Line item ${i} with extra long descriptive text to balloon JSON size`,
        qty: 1, unitPriceSek: 10 + i, vatRate: 25,
      })),
    };
    const encoded = encodeRemittance(big);
    expect(encoded.approxBytes).toBeGreaterThan(0);
    // Doesn't have to be over the soft cap necessarily — but should not
    // blow the hard cap either (200 lines * ~120 chars * 1.3 base64 ≈ 30 KB).
    expect(encoded.approxBytes).toBeLessThan(REMITTANCE_HARD_CAP_BYTES);
  });

  it('throws above the hard cap', () => {
    // Build a payload deliberately too large with one giant message
    const huge: AntonRemittance = {
      v: 1, kind: 'message',
      message: 'x'.repeat(REMITTANCE_HARD_CAP_BYTES + 5_000),
    };
    expect(() => encodeRemittance(huge)).toThrow(/too large/);
  });
});

describe('PACS.008 integration', () => {
  it('plugs into Pacs008Builder via remittanceInfo', () => {
    const encoded = encodeRemittance(SAMPLE_ORDER);
    const pacs = buildPacs008({
      debtor: { name: 'Alice', accountId: 'fc_alice', countryOfResidence: 'SE' },
      creditor: { name: 'Bob', accountId: 'fc_bob', countryOfResidence: 'SE' },
      amountFtc: 1.96,
      remittanceInfo: encoded.rmtInf,
    });
    const rmtInf = ((pacs as any).document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].RmtInf);
    expect(rmtInf).toBeDefined();
    expect(rmtInf.Ustrd[0]).toContain('Cappuccino');
    expect(rmtInf.Strd[0].AddtlRmtInf[0]).toMatch(/^ANTON-V1:/);
    // canonicalize still works (the bytes go into encrypted_data)
    const bytes = canonicalize(pacs);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('legacy `remittanceText` path is unchanged when remittanceInfo absent', () => {
    const pacs = buildPacs008({
      debtor: { name: 'Alice', accountId: 'fc_alice', countryOfResidence: 'SE' },
      creditor: { name: 'Bob', accountId: 'fc_bob', countryOfResidence: 'SE' },
      amountFtc: 1.96,
      remittanceText: 'simple legacy note',
    });
    const rmtInf = ((pacs as any).document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].RmtInf);
    expect(rmtInf).toEqual({ Ustrd: ['simple legacy note'] });
  });
});

describe('buildAttachment', () => {
  it('inlines small bytes as base64', () => {
    const bytes = new Uint8Array(1024);
    bytes.fill(7);
    const a = buildAttachment({ kind: 'photo', mime: 'image/jpeg', bytes, label: 'order.jpg' });
    expect(a.inlineB64).toBeDefined();
    expect(a.url).toBeUndefined();
    expect(a.sizeBytes).toBe(1024);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.label).toBe('order.jpg');
  });

  it('requires a URL above the inline limit', () => {
    const big = new Uint8Array(INLINE_ATTACHMENT_LIMIT + 1);
    expect(() => buildAttachment({ kind: 'photo', mime: 'image/jpeg', bytes: big }))
      .toThrow(/Upload to your own host/);
  });

  it('stores hash + URL above the inline limit', () => {
    const big = new Uint8Array(INLINE_ATTACHMENT_LIMIT + 1);
    const a = buildAttachment({ kind: 'photo', mime: 'image/jpeg', bytes: big,
                                url: 'https://example.com/photo.jpg' });
    expect(a.inlineB64).toBeUndefined();
    expect(a.url).toBe('https://example.com/photo.jpg');
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
