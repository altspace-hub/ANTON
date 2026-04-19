import type { VerbBaseline } from './index.js';

/** `query` — structured question whose answer the portal publishes. Cap Schema §4.8 (low trust, free). */
export const QUERY_BASELINE: VerbBaseline = {
  verb: 'query',
  trustLevel: 'low',
  paymentDefault: 'free',
  inputSchema: {
    type: 'object',
    properties: {
      queryType: { type: 'string' },
      parameters: { type: 'object' },
    },
    required: ['queryType'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      queryType: { type: 'string' },
      results: { type: 'array' },
      asOf: { type: 'string', format: 'date-time' },
    },
  },
};
