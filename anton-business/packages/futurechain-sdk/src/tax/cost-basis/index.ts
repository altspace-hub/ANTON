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
import { lifo } from './lifo.js';
import { specificId } from './specific-id.js';
import { sharePooling } from './share-pooling.js';

export type { GainLossEntry, GainLossLedger, CostBasisFn } from './types.js';
export { average } from './average.js';
export { fifo } from './fifo.js';
export { lifo } from './lifo.js';
export { specificId } from './specific-id.js';
export { sharePooling } from './share-pooling.js';

export const COST_BASIS_REGISTRY: Partial<Record<CostBasisMethod, CostBasisFn>> = {
  AVERAGE: average,
  FIFO: fifo,
  // LIFO — Italy permits as alternative to weighted average (Phase 7).
  LIFO: lifo,
  // SPECIFIC_ID resolves to HIFO in v1 — that's the optimization
  // the US user opts into.
  SPECIFIC_ID: specificId,
  HIFO: specificId,
  // UK Section 104 pool + same-day + 30-day matching from Phase 7.
  SHARE_POOLING: sharePooling,
  // ACB shares semantics with AVERAGE for v1 — Canada's adjusted cost
  // base differs in edge cases (superficial loss rules) deferred.
  ACB: average,
};

export function resolveCostBasis(method: CostBasisMethod): CostBasisFn {
  const fn = COST_BASIS_REGISTRY[method];
  if (!fn) {
    throw new Error(
      `Cost-basis method ${method} is not implemented yet. ` +
      `Supported: AVERAGE, FIFO, LIFO, SPECIFIC_ID/HIFO, SHARE_POOLING, ACB.`,
    );
  }
  return fn;
}
