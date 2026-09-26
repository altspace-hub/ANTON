// ── The position a threat path counts at ────────────────────────────────────
//
// One rule, used by the company-wide rollup (computeCompanyAppetite), the
// Stage 7b statement and the BWRA, so they cannot disagree:
//
//   - no appetite statement      → the band of the residual
//                                  (1-2 within, 3 boundary, 4 outside, 5 unacceptable);
//   - declared as strict as the band, or stricter → the declared position;
//   - declared MORE LENIENT than the band → the declared position only once a
//     person has approved the statement (the board accepting a risk above
//     appetite); until then, the band. Owner decision, 2026-09-23.
//   - no residual yet            → the declared position, or nothing.
//
// A statement's approval is withdrawn when its content changes
// (atlas-service upsertAppetite), so a changed lenient declaration falls back
// to the band until it is approved again.
import { appetitePositionFor } from './atlas-residual-calculator.js';
import type { AppetitePosition, Score1to5 } from './types.js';

export const POSITION_RANK: Record<AppetitePosition, number> = { within: 0, boundary: 1, outside: 2, unacceptable: 3 };

/** True when the declared position is more lenient than the band of the residual. */
export function isMoreLenient(declared: AppetitePosition | null | undefined, residual: number | null | undefined): boolean {
  if (!declared || !residual) return false;
  return POSITION_RANK[declared] < POSITION_RANK[appetitePositionFor(residual as Score1to5)];
}

export function countedPosition(
  declared: AppetitePosition | null | undefined,
  approved: boolean,
  residual: number | null | undefined,
): AppetitePosition | null {
  const band = residual ? appetitePositionFor(residual as Score1to5) : null;
  if (!declared) return band;
  if (isMoreLenient(declared, residual) && !approved) return band;
  return declared;
}
