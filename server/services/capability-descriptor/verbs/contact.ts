import type { VerbBaseline } from './index.js';

/** `contact` — free-form message to a human or agent. Cap Schema §4.8 / §4.1 (low trust, free). */
export const CONTACT_BASELINE: VerbBaseline = {
  verb: 'contact',
  trustLevel: 'low',
  paymentDefault: 'free',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 5000 },
      subject: { type: 'string', maxLength: 200 },
      replyTo: { type: 'string', description: 'ANTON address for reply' },
    },
    required: ['message'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      acceptedAt: { type: 'string', format: 'date-time' },
      expectedResponseTimeHours: { type: 'number' },
    },
    required: ['messageId', 'acceptedAt'],
  },
};
