import type { VerbBaseline } from './index.js';

/** `publish` — declare that the portal publishes discoverable content. Cap Schema §4.8 (low trust, free). */
export const PUBLISH_BASELINE: VerbBaseline = {
  verb: 'publish',
  trustLevel: 'low',
  paymentDefault: 'free',
  inputSchema: {
    type: 'object',
    properties: {
      feed: { type: 'string' },
      since: { type: 'string', format: 'date-time' },
      limit: { type: 'integer', maximum: 100 },
    },
    required: ['feed'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      feed: { type: 'string' },
      items: { type: 'array' },
      hasMore: { type: 'boolean' },
    },
  },
};
