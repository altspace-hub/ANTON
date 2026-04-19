import type { VerbBaseline } from './index.js';

/** `book` — reserve time or capacity. Cap Schema §4.8 (medium trust, free or paid). */
export const BOOK_BASELINE: VerbBaseline = {
  verb: 'book',
  trustLevel: 'medium',
  paymentDefault: 'varies',
  inputSchema: {
    type: 'object',
    properties: {
      resource: { type: 'string', description: 'What is being booked' },
      startTime: { type: 'string', format: 'date-time' },
      endTime: { type: 'string', format: 'date-time' },
      attendees: { type: 'integer', minimum: 1 },
      contact: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['resource', 'startTime', 'endTime', 'contact'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      bookingId: { type: 'string' },
      status: { type: 'string', enum: ['confirmed', 'pending', 'waitlist', 'rejected'] },
      price: { type: 'number' },
      currency: { type: 'string' },
    },
  },
};
