/**
 * rates.ts — flat-rate + progressive-bracket rate application.
 *
 * Sweden: flat 30%. UK: 18% / 24% bracket-dependent on the user's
 * total taxable income. US: ordinary-income brackets for short-term,
 * 0/15/20% for long-term. Spain: 19/21/23/27/28% progressive on the
 * savings base.
 *
 * The engine calls applyRate(gain, rateStructure) and gets back the
 * tax on that slice. Aggregation across multiple disposals into an
 * annual total is the orchestrator's job — this module is purely
 * arithmetic.
 */
import type { ProgressiveBracket, RateStructure } from './schema.js';

/** Compute tax on a single (positive) gain amount. Negative gains
 *  are zero-taxed here; loss offset is handled separately.
 *
 *  For progressive brackets, the gain is treated as the *full* base
 *  being taxed — i.e. each slice of the gain is taxed at the rate
 *  for its bracket. That matches Sweden/UK/US convention where the
 *  bracket lookup is on the annual taxable amount, not the single
 *  disposal. Callers should aggregate first when needed.
 */
export function applyRate(amount: number, structure: RateStructure): number {
  if (amount <= 0) return 0;

  if (structure.type === 'flat') {
    return amount * structure.rate;
  }
  // progressive / bracket_dependent share the bracket schema
  return applyProgressive(amount, structure.brackets);
}

function applyProgressive(amount: number, brackets: ProgressiveBracket[]): number {
  let remaining = amount;
  let prevUpTo = 0;
  let tax = 0;
  // Sort by upTo ascending — null (open-ended) goes last.
  const sorted = [...brackets].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });

  for (const bracket of sorted) {
    if (remaining <= 0) break;
    const span = bracket.upTo === null
      ? Number.POSITIVE_INFINITY
      : bracket.upTo - prevUpTo;
    const slice = Math.min(remaining, span);
    tax += slice * bracket.rate;
    remaining -= slice;
    if (bracket.upTo !== null) prevUpTo = bracket.upTo;
  }
  return tax;
}
