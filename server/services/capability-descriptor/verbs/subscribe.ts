import type { VerbBaseline } from './index.js';

/** `subscribe` — opt into receiving updates. Cap Schema §4.8 (low trust, free). */
export const SUBSCRIBE_BASELINE: VerbBaseline = {
  verb: 'subscribe',
  trustLevel: 'low',
  paymentDefault: 'free',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      deliveryChannel: { type: 'string', enum: ['aap', 'webhook'] },
      deliveryAddress: { type: 'string' },
      frequency: { type: 'string', enum: ['realtime', 'daily_digest', 'weekly_digest'] },
    },
    required: ['topic', 'deliveryChannel', 'deliveryAddress'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      subscriptionId: { type: 'string' },
      unsubscribeToken: { type: 'string' },
    },
  },
};
