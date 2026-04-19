import type { VerbBaseline } from './index.js';

/** `inquire` — structured question, structured response. Cap Schema §4.8 (low trust, free). */
export const INQUIRE_BASELINE: VerbBaseline = {
  verb: 'inquire',
  trustLevel: 'low',
  paymentDefault: 'free',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      context: { type: 'object', description: 'Portal-specific context fields' },
    },
    required: ['question'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      inquiryId: { type: 'string' },
      answer: { type: 'string' },
      structuredAnswer: { type: 'object' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low', 'requires_human'] },
    },
  },
};
