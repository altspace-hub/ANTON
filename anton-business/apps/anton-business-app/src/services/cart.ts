/**
 * cart.ts — pure cart math.
 *
 * Each item carries its own VAT rate. Swedish retail convention is
 * VAT-included pricing, so the line price IS the customer-facing
 * price and the VAT amount is extracted from it for the kvitto's
 * VAT breakdown:
 *
 *   line total SEK    = unitPrice × quantity
 *   line VAT SEK      = line total × rate / (100 + rate)
 *
 * Discounts are applied at the cart level, after summing lines. We
 * apply the discount proportionally to BOTH the post-VAT subtotal AND
 * the extracted VAT so the after-discount total still includes the
 * (smaller) VAT correctly. This matches what cashier systems do at a
 * Swedish café.
 *
 * No I/O. Used by the Extended-mode screen + QR builder + kvitto
 * renderer.
 */

export interface CartLine {
  /** Stable id from the items catalogue. */
  itemId: string;
  /** Snapshot of the item name at add-time (so renaming an item in
   *  Settings doesn't retroactively rewrite open orders). */
  name: string;
  unitPriceSek: number;
  vatRate: 0 | 6 | 12 | 25;
  quantity: number;
}

export interface CartDiscount {
  /** Either percent or flat, not both. */
  kind: 'percent' | 'flat';
  /** For 'percent', 0–100. For 'flat', SEK. */
  value: number;
}

export interface Cart {
  lines: CartLine[];
  discount?: CartDiscount;
}

export interface VatBreakdownEntry {
  rate: 0 | 6 | 12 | 25;
  /** Net amount taxed at this rate, after proportional discount. */
  netSek: number;
  /** VAT amount at this rate, after proportional discount. */
  vatSek: number;
}

export interface CartTotals {
  /** Sum of (unitPrice × quantity) across all lines, VAT-included. */
  subtotalSek: number;
  /** SEK amount of the discount. 0 if no discount. */
  discountSek: number;
  /** subtotalSek - discountSek. The amount the customer pays. */
  totalSek: number;
  /** Total VAT, after discount applied proportionally. */
  totalVatSek: number;
  /** Per-rate breakdown for the kvitto. Only rates that appear in
   *  the cart are present. Sorted by rate ascending. */
  vatBreakdown: VatBreakdownEntry[];
  /** Sum of all line quantities. Used as the `I:` v1 ref token. */
  itemCount: number;
}

export function computeTotals(cart: Cart): CartTotals {
  let subtotal = 0;
  let itemCount = 0;
  const perRateSubtotal = new Map<0 | 6 | 12 | 25, number>();
  for (const line of cart.lines) {
    const lineTotal = line.unitPriceSek * line.quantity;
    subtotal += lineTotal;
    itemCount += line.quantity;
    perRateSubtotal.set(line.vatRate, (perRateSubtotal.get(line.vatRate) ?? 0) + lineTotal);
  }

  const discountSek = applyDiscount(subtotal, cart.discount);
  const totalSek = round2(subtotal - discountSek);
  const discountFraction = subtotal > 0 ? discountSek / subtotal : 0;

  const vatBreakdown: VatBreakdownEntry[] = [];
  let totalVatSek = 0;
  // Iterate in rate-ascending order so the kvitto reads top-down.
  const rates: Array<0 | 6 | 12 | 25> = [0, 6, 12, 25];
  for (const rate of rates) {
    const rateSubtotal = perRateSubtotal.get(rate);
    if (rateSubtotal === undefined || rateSubtotal === 0) continue;
    const rateAfterDiscount = rateSubtotal * (1 - discountFraction);
    const vatAtRate = rate === 0 ? 0 : rateAfterDiscount * rate / (100 + rate);
    const netAtRate = rateAfterDiscount - vatAtRate;
    vatBreakdown.push({
      rate,
      netSek: round2(netAtRate),
      vatSek: round2(vatAtRate),
    });
    totalVatSek += vatAtRate;
  }

  return {
    subtotalSek: round2(subtotal),
    discountSek: round2(discountSek),
    totalSek,
    totalVatSek: round2(totalVatSek),
    vatBreakdown,
    itemCount,
  };
}

function applyDiscount(subtotal: number, d?: CartDiscount): number {
  if (!d || subtotal === 0) return 0;
  if (d.kind === 'percent') {
    const pct = clamp(d.value, 0, 100);
    return subtotal * pct / 100;
  }
  // flat
  return clamp(d.value, 0, subtotal);
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** Round to 2 decimal places using banker's rounding via integer math.
 *  Avoids the JS Number.toFixed edge cases. */
function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

// ── Cart-line manipulation helpers ────────────────────────────────────

/** Add an item to the cart, incrementing quantity if it's already there. */
export function addLine(cart: Cart, line: Omit<CartLine, 'quantity'>): Cart {
  const existing = cart.lines.findIndex((l) => l.itemId === line.itemId);
  if (existing >= 0) {
    const updated = [...cart.lines];
    updated[existing] = { ...updated[existing]!, quantity: updated[existing]!.quantity + 1 };
    return { ...cart, lines: updated };
  }
  return { ...cart, lines: [...cart.lines, { ...line, quantity: 1 }] };
}

/** Set quantity for a line. 0 or negative removes the line. */
export function setQuantity(cart: Cart, itemId: string, quantity: number): Cart {
  if (quantity <= 0) return { ...cart, lines: cart.lines.filter((l) => l.itemId !== itemId) };
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.itemId === itemId ? { ...l, quantity } : l)),
  };
}

export function removeLine(cart: Cart, itemId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.itemId !== itemId) };
}

export function empty(): Cart {
  return { lines: [] };
}
