import type { VerbBaseline } from './index.js';

/** `delegate` — accept delegated tasks from another ANTON. Cap Schema §4.8 (HIGH trust, requires delegator signature). */
export const DELEGATE_BASELINE: VerbBaseline = {
  verb: 'delegate',
  trustLevel: 'high',
  paymentDefault: 'varies',
  inputSchema: {
    type: 'object',
    properties: {
      taskDescription: { type: 'string' },
      constraints: { type: 'object' },
      deadline: { type: 'string', format: 'date-time' },
      delegatorSignature: { type: 'string', description: 'Ed25519 signature by delegator' },
    },
    required: ['taskDescription', 'delegatorSignature'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      delegationId: { type: 'string' },
      accepted: { type: 'boolean' },
      expectedCompletionTime: { type: 'string', format: 'date-time' },
    },
  },
};
