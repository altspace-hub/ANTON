/**
 * look-alike.ts — pin-time impersonation defences for Trusted Stores.
 *
 * Before a user pins a "trusted store", we warn (never block) if the new
 * portal address is visually confusable with one they already trust — the
 * address-poisoning class of attack ("mybakery" vs the Cyrillic "myбakery", or
 * a one-character typo "mybakerry"). Three complementary, advisory checks:
 *
 *   1. mixed-script   — the existing homoglyph guard (Latin + Cyrillic/Greek/…).
 *   2. skeleton       — UTS #39 confusable-skeleton collision with an existing
 *                       pin (catches homoglyph swaps that aren't mixed-script).
 *   3. edit-distance  — a small Levenshtein near-miss to an existing pin
 *                       (catches plain typos with no homoglyph at all).
 *
 * Pure + dependency-free (reuses the server homoglyph module). The result is
 * shown to the human in the pin wizard — it informs, it does not decide.
 */
import { computeSkeleton, hasRiskyMixedScript } from '../registry-protocol/homoglyph.js';

export interface LookAlikeWarning {
  kind: 'mixed-script' | 'skeleton-collision' | 'edit-distance';
  /** The existing pinned address this candidate is confusable with, if any. */
  against?: string;
  editDistance?: number;
  reason: string;
}

export interface ExistingPin {
  portalAddress: string;
  nameSkeleton: string;
}

/** Classic iterative Levenshtein (two-row DP). Pure. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** The near-miss edit-distance band: too close to an existing pin to ignore,
 *  but not identical (identical = the same store, handled by UNIQUE upstream). */
const EDIT_DISTANCE_MAX = 3;

/**
 * Warn if `candidateAddress` is visually confusable with the user's existing
 * pins. Advisory only — the caller surfaces the warnings to the human and still
 * lets them pin if they confirm.
 */
export function checkPinLookAlike(
  candidateAddress: string,
  existing: ReadonlyArray<ExistingPin>,
): LookAlikeWarning[] {
  const warnings: LookAlikeWarning[] = [];

  const mixed = hasRiskyMixedScript(candidateAddress);
  if (mixed.risky) {
    warnings.push({ kind: 'mixed-script', reason: mixed.reason ?? 'Name mixes visually-confusable scripts.' });
  }

  const candidateSkeleton = computeSkeleton(candidateAddress);
  for (const pin of existing) {
    if (pin.portalAddress === candidateAddress) continue; // identical = same store, not a look-alike
    if (pin.nameSkeleton === candidateSkeleton) {
      warnings.push({
        kind: 'skeleton-collision',
        against: pin.portalAddress,
        reason: `Visually identical to a store you already trust ("${pin.portalAddress}") — possible impersonation.`,
      });
      continue; // a skeleton match is the stronger signal; don't also edit-distance it
    }
    const d = levenshtein(candidateAddress, pin.portalAddress);
    if (d >= 1 && d <= EDIT_DISTANCE_MAX) {
      warnings.push({
        kind: 'edit-distance',
        against: pin.portalAddress,
        editDistance: d,
        reason: `Only ${d} character${d === 1 ? '' : 's'} different from a store you already trust ("${pin.portalAddress}") — check for a typo-squat.`,
      });
    }
  }

  return warnings;
}
