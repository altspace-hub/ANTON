import type { VerbBaseline } from './index.js';

/**
 * `authenticate` — verify an identity or membership claim. Cap Schema §4.8.
 * Narrow scope: confirms claims. Does NOT handle password auth, session
 * management, or credential issuance.
 */
export const AUTHENTICATE_BASELINE: VerbBaseline = {
  verb: 'authenticate',
  trustLevel: 'high',
  paymentDefault: 'usually-free',
  inputSchema: {
    type: 'object',
    properties: {
      claimType: { type: 'string', enum: ['membership', 'employment', 'certification', 'other'] },
      claimSubject: { type: 'string', description: 'ANTON address of the subject' },
      claimDetails: { type: 'object' },
    },
    required: ['claimType', 'claimSubject'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      verified: { type: 'boolean' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      attestation: { type: 'object', description: 'Optional signed attestation' },
      validUntil: { type: 'string', format: 'date-time' },
    },
  },
};
