import type { VerbBaseline } from './index.js';

/**
 * `custom` — escape hatch for capabilities outside the core 12. Cap Schema §4.9.
 * Custom capabilities are indexed by title/description/tags only — Pathfinder
 * cannot semantically match them by verb, so they are less discoverable.
 *
 * Baseline schemas are deliberately empty objects: the portal MUST supply its
 * own inputSchema/outputSchema in the capability declaration.
 */
export const CUSTOM_BASELINE: VerbBaseline = {
  verb: 'custom',
  trustLevel: 'medium',
  paymentDefault: 'varies',
  inputSchema: {
    type: 'object',
  },
  outputSchema: {
    type: 'object',
  },
};
