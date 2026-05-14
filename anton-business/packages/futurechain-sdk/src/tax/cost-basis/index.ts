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

export type { GainLossEntry, GainLossLedger, CostBasisFn } from './types.js';
export { average } from './average.js';
export { fifo } from './fifo.js';

export const COST_BASIS_REGISTRY: Partial<Record<CostBasisMethod, CostBasisFn>> = {
  AVERAGE: average,
  FIFO: fifo,
  // ACB shares semantics with AVERAGE for v1 — Canada's adjusted cost
  // base differs in edge cases (superficial loss rules) that Phase 5
  // will fork.
  ACB: average,
  // SPECIFIC_ID, HIFO, LIFO, SHARE_POOLING land in later phases.
};

export function resolveCostBasis(method: CostBasisMethod): CostBasisFn {
  const fn = COST_BASIS_REGISTRY[method];
  if (!fn) {
    throw new Error(
      `Cost-basis method ${method} is not implemented yet. ` +
      `Supported in v1: AVERAGE, FIFO, ACB.`,
    );
  }
  return fn;
}
