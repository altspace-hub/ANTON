/**
 * verbs/index.ts — Registry of all 12 core verbs + custom escape hatch.
 *
 * Each baseline export is the recommended minimum input/output schema per
 * Cap Schema §4.8. Portals MAY extend with additional fields; they SHOULD
 * keep the baseline fields with correct types.
 *
 * Used by:
 *   - validator.ts to optionally validate per-capability inputSchema/outputSchema
 *     against the baseline (warn if baseline fields are missing).
 *   - builder.ts to seed inputSchema/outputSchema from the verb when the
 *     walkthrough doesn't provide custom shapes.
 *   - Pathfinder anton-portal mode to interpret verbs for filtered search.
 */

import type { CapabilityVerb } from '../schema.js';

import { CONTACT_BASELINE } from './contact.js';
import { INQUIRE_BASELINE } from './inquire.js';
import { REQUEST_BASELINE } from './request.js';
import { ORDER_BASELINE } from './order.js';
import { PAY_BASELINE } from './pay.js';
import { BOOK_BASELINE } from './book.js';
import { SUBSCRIBE_BASELINE } from './subscribe.js';
import { JOIN_BASELINE } from './join.js';
import { QUERY_BASELINE } from './query.js';
import { PUBLISH_BASELINE } from './publish.js';
import { DELEGATE_BASELINE } from './delegate.js';
import { AUTHENTICATE_BASELINE } from './authenticate.js';
import { CUSTOM_BASELINE } from './custom.js';

export interface VerbBaseline {
  verb: CapabilityVerb;
  /** Trust level per Cap Schema §4.1. Hint to the visitor's ANTON for prompt-confirm UX. */
  trustLevel: 'low' | 'medium' | 'medium-high' | 'high';
  /** Whether payment is the default for this verb. */
  paymentDefault: 'free' | 'paid' | 'usually-free' | 'usually-paid' | 'varies';
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export const VERB_BASELINES: Record<CapabilityVerb, VerbBaseline> = {
  contact: CONTACT_BASELINE,
  inquire: INQUIRE_BASELINE,
  request: REQUEST_BASELINE,
  order: ORDER_BASELINE,
  pay: PAY_BASELINE,
  book: BOOK_BASELINE,
  subscribe: SUBSCRIBE_BASELINE,
  join: JOIN_BASELINE,
  query: QUERY_BASELINE,
  publish: PUBLISH_BASELINE,
  delegate: DELEGATE_BASELINE,
  authenticate: AUTHENTICATE_BASELINE,
  custom: CUSTOM_BASELINE,
};

export function getVerbBaseline(verb: CapabilityVerb): VerbBaseline {
  return VERB_BASELINES[verb];
}
