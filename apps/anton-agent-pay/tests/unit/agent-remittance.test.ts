/**
 * agent-remittance.test.ts — building a v=1 AntonRemittance from an agent's
 * input (with kind inference) + the pure modal summariser.
 */
import { describe, it, expect } from 'vitest';
import { buildAntonRemittance, summarizeRemittance } from '../../src/main/agent-remittance.js';

describe('buildAntonRemittance', () => {
  it('always stamps v=1', () => {
    expect(buildAntonRemittance({ message: 'hi' }).v).toBe(1);
  });

  it('infers kind=invoice from items', () => {
    const r = buildAntonRemittance({ items: [{ name: 'Widget', qty: 2, lineTotalSek: 100 }] });
    expect(r.kind).toBe('invoice');
    expect(r.items).toEqual([{ name: 'Widget', qty: 2, lineTotalSek: 100 }]);
  });

  it('infers kind=agreement from decision/terms', () => {
    expect(buildAntonRemittance({ decision: 'ship by Friday' }).kind).toBe('agreement');
    expect(buildAntonRemittance({ terms: 'NET-30' }).kind).toBe('agreement');
  });

  it('infers kind=message when only a message is given', () => {
    expect(buildAntonRemittance({ message: 'thanks!' }).kind).toBe('message');
  });

  it('respects an explicit kind over inference', () => {
    expect(buildAntonRemittance({ kind: 'order', items: [{ name: 'x', qty: 1 }] }).kind).toBe('order');
  });

  it('omits absent optional fields (no undefined keys on the wire)', () => {
    const r = buildAntonRemittance({ message: 'hi' });
    expect(Object.prototype.hasOwnProperty.call(r, 'ref')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r, 'items')).toBe(false);
    expect(r).toEqual({ v: 1, kind: 'message', message: 'hi' });
  });
});

describe('summarizeRemittance', () => {
  it('summarises an invoice with items + total', () => {
    const lines = summarizeRemittance({
      v: 1, kind: 'invoice', ref: 'INV-7',
      items: [{ name: 'Widget', qty: 2, lineTotalSek: 100 }, { name: 'Bolt', qty: 1, unitPriceSek: 5 }],
      amountSek: 105, vatSek: 21,
    });
    expect(lines[0]).toBe('Invoice #INV-7');
    expect(lines.some((l) => /Widget/.test(l) && /100 SEK/.test(l))).toBe(true);
    expect(lines.some((l) => /Stated total: 105 SEK \(VAT 21\)/.test(l))).toBe(true);
  });

  it('summarises an agreement with decision + terms', () => {
    const lines = summarizeRemittance({ v: 1, kind: 'agreement', decision: 'ship Friday', terms: 'NET-30' });
    expect(lines[0]).toBe('Agreement');
    expect(lines.some((l) => l === 'Agreed: ship Friday')).toBe(true);
    expect(lines.some((l) => l === 'Terms: NET-30')).toBe(true);
  });

  it('summarises a free-text message', () => {
    const lines = summarizeRemittance({ v: 1, kind: 'message', message: 'thanks for the work' });
    expect(lines).toEqual(['Note', 'Message: thanks for the work']);
  });

  it('truncates long free text', () => {
    const long = 'x'.repeat(500);
    const lines = summarizeRemittance({ v: 1, kind: 'message', message: long });
    const msg = lines.find((l) => l.startsWith('Message:'))!;
    expect(msg.length).toBeLessThan(220);
    expect(msg.endsWith('…')).toBe(true);
  });

  it('caps the item list with an "…and N more"', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ name: `i${i}`, qty: 1 }));
    const lines = summarizeRemittance({ v: 1, kind: 'invoice', items });
    expect(lines.some((l) => /…and 8 more/.test(l))).toBe(true);
  });
});
