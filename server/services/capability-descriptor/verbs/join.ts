import type { VerbBaseline } from './index.js';

/** `join` — request membership in a group or community. Cap Schema §4.8 (medium trust, free or paid). */
export const JOIN_BASELINE: VerbBaseline = {
  verb: 'join',
  trustLevel: 'medium',
  paymentDefault: 'varies',
  inputSchema: {
    type: 'object',
    properties: {
      applicantContact: { type: 'string' },
      applicantName: { type: 'string' },
      motivation: { type: 'string' },
      supportingInfo: { type: 'object' },
    },
    required: ['applicantContact', 'applicantName'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      applicationId: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'waitlist'] },
      nextStep: { type: 'string' },
    },
  },
};
