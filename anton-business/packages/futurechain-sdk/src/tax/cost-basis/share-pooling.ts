/**
 * cost-basis/share-pooling.ts — UK Section 104 share pool.
 *
 * HMRC's rule for fungible chargeable assets including crypto. Per
 * the spec §6.2 GB block: "Section 104 share pooling + same-day rule
 * + 30-day 'bed-and-breakfast' rule".
 *
 * v1 implementation: **Section 104 pool only**. Disposals draw at
 * the running pool average — same arithmetic shape as AVERAGE.
 *
 * The same-day + 30-day matching rules are NOT yet implemented.
 * Their absence is surfaced as a `review_flag` on the GB rule block
 * so the engine's `reviewRequired` triggers and the UI shows the
 * "consult an adviser" callout.
 *
 * Why deferred: same-day + 30-day matching require lookahead from
 * each disposal, which crosses the streaming-cost-basis abstraction
 * the other methods use. A clean rewrite lands in Phase 5 alongside
 * SA's 45-day bed-and-breakfast rule (which has the same shape).
 */
import { average } from './average.js';
import type { CostBasisFn } from './types.js';

/** v1 — share pooling = Section 104 pool only (no same-day / 30-day
 *  matching). The engine's review_flag mechanism surfaces this gap
 *  in the GB rule block. */
export const sharePooling: CostBasisFn = average;
