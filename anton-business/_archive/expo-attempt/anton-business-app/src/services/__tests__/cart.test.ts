/**
 * cart.test.ts — coverage for the pure cart-math service.
 */
import { describe, it, expect } from 'vitest';
import {
  addLine,
  computeTotals,
  empty,
  removeLine,
  setQuantity,
  type Cart,
  type CartLine,
} from '../cart';

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    itemId: over.itemId ?? 'a',
    name: over.name ?? 'Coffee',
    unitPriceSek: over.unitPriceSek ?? 35,
    vatRate: over.vatRate ?? 12,
    quantity: over.quantity ?? 1,
  };
}

describe('computeTotals — single line', () => {
  it('extracts 12% VAT from a 35 SEK line', () => {
    const totals = computeTotals({ lines: [line({ unitPriceSek: 35, vatRate: 12 })] });
    expect(totals.subtotalSek).toBe(35);
    expect(totals.totalSek).toBe(35);
    expect(totals.discountSek).toBe(0);
    // 35 * 12 / 112 = 3.75
    expect(totals.totalVatSek).toBe(3.75);
    expect(totals.itemCount).toBe(1);
    expect(totals.vatBreakdown).toEqual([
      { rate: 12, netSek: 31.25, vatSek: 3.75 },
    ]);
  });

  it('extracts 25% VAT from a 79 SEK line', () => {
    const totals = computeTotals({ lines: [line({ unitPriceSek: 79, vatRate: 25 })] });
    // 79 * 25 / 125 = 15.80
    expect(totals.totalVatSek).toBe(15.8);
    expect(totals.vatBreakdown).toEqual([
      { rate: 25, netSek: 63.2, vatSek: 15.8 },
    ]);
  });

  it('handles 0% VAT (services / exempt goods)', () => {
    const totals = computeTotals({ lines: [line({ unitPriceSek: 100, vatRate: 0 })] });
    expect(totals.totalVatSek).toBe(0);
    // 0% lines still appear in the breakdown — Skatteverket
    // distinguishes "0%-rated" from "no VAT" on the kvitto.
    expect(totals.vatBreakdown).toEqual([{ rate: 0, netSek: 100, vatSek: 0 }]);
  });

  it('multiplies by quantity', () => {
    const totals = computeTotals({ lines: [line({ unitPriceSek: 35, quantity: 3 })] });
    expect(totals.subtotalSek).toBe(105);
    expect(totals.itemCount).toBe(3);
  });
});

describe('computeTotals — multi-rate', () => {
  it('builds a per-rate breakdown sorted ascending', () => {
    const totals = computeTotals({
      lines: [
        line({ itemId: 'a', unitPriceSek: 79, vatRate: 25, quantity: 2 }), // 158 @ 25
        line({ itemId: 'b', unitPriceSek: 35, vatRate: 12, quantity: 1 }), //  35 @ 12
        line({ itemId: 'c', unitPriceSek: 50, vatRate: 12, quantity: 1 }), //  50 @ 12
      ],
    });
    expect(totals.subtotalSek).toBe(243);
    expect(totals.itemCount).toBe(4);
    expect(totals.vatBreakdown.map((e) => e.rate)).toEqual([12, 25]);
    // 12%: 85 * 12/112 = 9.107... → 9.11
    expect(totals.vatBreakdown[0]).toEqual({ rate: 12, netSek: 75.89, vatSek: 9.11 });
    // 25%: 158 * 25/125 = 31.6
    expect(totals.vatBreakdown[1]).toEqual({ rate: 25, netSek: 126.4, vatSek: 31.6 });
  });
});

describe('computeTotals — discount', () => {
  it('applies a percent discount proportionally to VAT', () => {
    const totals = computeTotals({
      lines: [line({ unitPriceSek: 100, vatRate: 25 })],
      discount: { kind: 'percent', value: 10 },
    });
    expect(totals.subtotalSek).toBe(100);
    expect(totals.discountSek).toBe(10);
    expect(totals.totalSek).toBe(90);
    // VAT pre-discount: 100 * 25/125 = 20. After 10% discount: 18.
    expect(totals.totalVatSek).toBe(18);
  });

  it('applies a flat-SEK discount', () => {
    const totals = computeTotals({
      lines: [line({ unitPriceSek: 100, vatRate: 12 })],
      discount: { kind: 'flat', value: 15 },
    });
    expect(totals.discountSek).toBe(15);
    expect(totals.totalSek).toBe(85);
  });

  it('clamps a flat discount that exceeds the subtotal', () => {
    const totals = computeTotals({
      lines: [line({ unitPriceSek: 50 })],
      discount: { kind: 'flat', value: 9999 },
    });
    expect(totals.discountSek).toBe(50);
    expect(totals.totalSek).toBe(0);
  });

  it('clamps a percent discount above 100', () => {
    const totals = computeTotals({
      lines: [line({ unitPriceSek: 50 })],
      discount: { kind: 'percent', value: 200 },
    });
    expect(totals.discountSek).toBe(50);
  });
});

describe('cart manipulation', () => {
  it('addLine increments quantity for an existing item', () => {
    let cart: Cart = empty();
    cart = addLine(cart, { itemId: 'a', name: 'X', unitPriceSek: 10, vatRate: 12 });
    cart = addLine(cart, { itemId: 'a', name: 'X', unitPriceSek: 10, vatRate: 12 });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(2);
  });

  it('addLine appends new items', () => {
    let cart: Cart = empty();
    cart = addLine(cart, { itemId: 'a', name: 'X', unitPriceSek: 10, vatRate: 12 });
    cart = addLine(cart, { itemId: 'b', name: 'Y', unitPriceSek: 20, vatRate: 25 });
    expect(cart.lines).toHaveLength(2);
  });

  it('setQuantity to 0 removes the line', () => {
    let cart: Cart = empty();
    cart = addLine(cart, { itemId: 'a', name: 'X', unitPriceSek: 10, vatRate: 12 });
    cart = setQuantity(cart, 'a', 0);
    expect(cart.lines).toHaveLength(0);
  });

  it('removeLine drops by id', () => {
    let cart: Cart = empty();
    cart = addLine(cart, { itemId: 'a', name: 'X', unitPriceSek: 10, vatRate: 12 });
    cart = addLine(cart, { itemId: 'b', name: 'Y', unitPriceSek: 20, vatRate: 25 });
    cart = removeLine(cart, 'a');
    expect(cart.lines.map((l) => l.itemId)).toEqual(['b']);
  });
});

describe('computeTotals — empty cart', () => {
  it('returns zeros without dividing by zero', () => {
    const totals = computeTotals({ lines: [] });
    expect(totals.subtotalSek).toBe(0);
    expect(totals.totalSek).toBe(0);
    expect(totals.totalVatSek).toBe(0);
    expect(totals.itemCount).toBe(0);
    expect(totals.vatBreakdown).toEqual([]);
  });
});
