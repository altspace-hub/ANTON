import type { VerbBaseline } from './index.js';

/** `order` — place a commercial order. Cap Schema §4.8 / §4.1 (medium-high trust, paid). */
export const ORDER_BASELINE: VerbBaseline = {
  verb: 'order',
  trustLevel: 'medium-high',
  paymentDefault: 'paid',
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'object' } },
      deliveryMethod: { type: 'string' },
      deliveryAddress: { type: 'object' },
      deliveryDate: { type: 'string', format: 'date' },
      contact: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['items', 'contact'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      status: { type: 'string', enum: ['quoted', 'confirmed', 'pending_payment', 'rejected'] },
      totalPrice: { type: 'number' },
      currency: { type: 'string' },
      paymentInstructions: { type: 'object' },
      expectedDelivery: { type: 'string', format: 'date' },
    },
  },
};
