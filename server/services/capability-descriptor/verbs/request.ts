import type { VerbBaseline } from './index.js';

/** `request` — structured service request without commercial commitment. Cap Schema §4.1 (medium trust, usually free). */
export const REQUEST_BASELINE: VerbBaseline = {
  verb: 'request',
  trustLevel: 'medium',
  paymentDefault: 'usually-free',
  inputSchema: {
    type: 'object',
    properties: {
      requestType: { type: 'string' },
      details: { type: 'object' },
      requesterContact: { type: 'string' },
      preferredResponseFormat: { type: 'string', enum: ['email', 'aap', 'phone'] },
    },
    required: ['requestType', 'requesterContact'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      requestId: { type: 'string' },
      status: { type: 'string', enum: ['received', 'in_review', 'accepted', 'declined'] },
      expectedResponseTimeHours: { type: 'number' },
    },
    required: ['requestId', 'status'],
  },
};
