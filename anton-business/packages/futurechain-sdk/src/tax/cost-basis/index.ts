/**
 * cost-basis/index.ts — registry of cost-basis methods.
 *
 * The orchestrator looks up the function by `CostBasisMethod` enum
 * from the jurisdiction rule. New methods (SPECIFIC_ID, SHARE_POOLING,
 * ACB) land here as they're implemented in Phase 4+.
 */
import type { CostBasisMethod, CostBasisRule } from '../schema.js';
import type { CostBasisFn } from './types.js';
import { average } from './average.js';
import { fifo } from './fifo.js';
import { lifo } from './lifo.js';
import { specificId } from './specific-id.js';
import {
  sharePooling,
  makeSharePooling,
  DEFAULT_MATCHING_WINDOW_DAYS,
} from './share-pooling.js';

export type { GainLossEntry, GainLossLedger, CostBasisFn } from './types.js';
export { average } from './average.js';
export { fifo } from './fifo.js';
export { lifo } from './lifo.js';
export { specificId } from './specific-id.js';
export {
  sharePooling,
  makeSharePooling,
  DEFAULT_MATCHING_WINDOW_DAYS,
} from './share-pooling.js';

export const COST_BASIS_REGISTRY: Partial<Record<CostBasisMethod, CostBasisFn>> = {
  AVERAGE: average,
  FIFO: fifo,
  LIFO: lifo,
  SPECIFIC_ID: specificId,
  HIFO: specificId,
  // SHARE_POOLING with the default UK 30-day window — overridden by
  // resolveCostBasisForRule when the rule sets matching_window_days.
  SHARE_POOLING: sharePooling,
  ACB: average,
};

/** Direct method lookup. Use this when you don't have a rule (e.g.
 *  testing a method in isolation). For real engine dispatch, prefer
 *  resolveCostBasisForRule below. */
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

/** Rule-aware resolution. Honours rule.cost_basis_method
 *  .matching_window_days when SHARE_POOLING is selected (used by
 *  Ireland's 4-week rule and any future bed-and-breakfast variants). */
export function resolveCostBasisForRule(
  method: CostBasisMethod,
  rule: CostBasisRule,
): CostBasisFn {
  if (method === 'SHARE_POOLING') {
    return makeSharePooling(rule.matching_window_days ?? DEFAULT_MATCHING_WINDOW_DAYS);
  }
  return resolveCostBasis(method);
}
