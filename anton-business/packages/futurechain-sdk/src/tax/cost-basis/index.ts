/**
 * cost-basis/index.ts — registry of cost-basis methods.
 *
 * The orchestrator looks up the function by `CostBasisMethod` enum
 * from the jurisdiction rule. New methods (SPECIFIC_ID, SHARE_POOLING,
 * ACB) land here as they're implemented in Phase 4+.
 */
import type { CostBasisMethod } from '../schema.js';
import type { CostBasisFn } from './types.js';
import { average } from './average.js';
import { fifo } from './fifo.js';
import { specificId } from './specific-id.js';
import { sharePooling } from './share-pooling.js';

export type { GainLossEntry, GainLossLedger, CostBasisFn } from './types.js';
export { average } from './average.js';
export { fifo } from './fifo.js';
export { specificId } from './specific-id.js';
export { sharePooling } from './share-pooling.js';

export const COST_BASIS_REGISTRY: Partial<Record<CostBasisMethod, CostBasisFn>> = {
  AVERAGE: average,
  FIFO: fifo,
  // SPECIFIC_ID resolves to HIFO in v1 — that's the optimization
  // the US user opts into. LIFO via Specific ID is theoretically
  // permitted but not surfaced in the picker.
  SPECIFIC_ID: specificId,
  HIFO: specificId,
  // UK Section 104 pool — same arithmetic as AVERAGE in v1; same-day
  // + 30-day matching deferred to Phase 5 (review_flag surfaces this).
  SHARE_POOLING: sharePooling,
  // ACB shares semantics with AVERAGE for v1 — Canada's adjusted cost
  // base differs in edge cases (superficial loss rules) that Phase 5
  // will fork.
  ACB: average,
  // LIFO not yet — used by Italy as alternative to weighted average.
};

export function resolveCostBasis(method: CostBasisMethod): CostBasisFn {
  const fn = COST_BASIS_REGISTRY[method];
  if (!fn) {
    throw new Error(
      `Cost-basis method ${method} is not implemented yet. ` +
      `Supported in v1: AVERAGE, FIFO, SPECIFIC_ID/HIFO, SHARE_POOLING, ACB.`,
    );
  }
  return fn;
}
