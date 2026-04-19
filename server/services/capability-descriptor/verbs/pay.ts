import type { VerbBaseline } from './index.js';

/** `pay` — send money without ordering (donation, invoice, transfer). Cap Schema §4.8 (medium trust, paid). */
export const PAY_BASELINE: VerbBaseline = {
  verb: 'pay',
  trustLevel: 'medium',
  paymentDefault: 'paid',
  inputSchema: {
    type: 'object',
    properties: {
      purpose: { type: 'string', enum: ['invoice', 'donation', 'transfer', 'deposit', 'settlement', 'other'] },
      reference: { type: 'string' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      currency: { type: 'string' },
      method: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['purpose', 'amount', 'currency', 'method'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      paymentId: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'confirmed', 'settled', 'rejected'] },
      receipt: { type: 'object' },
      settlementTime: { type: 'string', format: 'date-time' },
    },
  },
};
