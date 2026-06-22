/**
 * seller-quoter-review.ts — the production four-eyes reviewer for auto-quotes.
 *
 * Adapts the general reviewWithSecondModel (../four-eyes-review.ts) to the quote
 * context. Kept OUT of seller-quoter.ts so the quoter core stays pure + stub-
 * testable. The handler injects this ONLY when ANTON_AUTOQUOTE_REVIEW_MODEL is
 * set — off by default. Use a model from a DIFFERENT provider than the primary
 * quoter (ANTON_AUTOQUOTE_MODEL) so one model can't rubber-stamp itself.
 */
import type { DatabaseAdapter } from '../../db/database.js';
import { reviewWithSecondModel } from '../four-eyes-review.js';
import type { QuoteReviewer } from './seller-quoter.js';

export function createCallChatQuoteReviewer(
  db: DatabaseAdapter, model: string, extraPolicy?: string,
): QuoteReviewer {
  return {
    async review({ verb, inquiry, quote, catalogText }) {
      // The reviewer sees the buyer-facing economics only — NEVER the floor/cost
      // (that never leaves the seller). The catalog/policy is context for judging
      // "is this price/term anomalous", appended to the operator no-go policy.
      const policy = [extraPolicy, catalogText ? `Seller catalog/policy context (for judging anomalies):\n${catalogText}` : '']
        .filter(Boolean).join('\n\n') || undefined;
      const v = await reviewWithSecondModel({
        model,
        taskDescription: `Auto-quote a price for a buyer's "${verb}" request and return it without a human in the loop.`,
        untrustedInput: inquiry,
        proposedOutput: JSON.stringify({
          priceFtc: quote.priceFtc,
          currency: quote.currency,
          available: quote.available,
          ...(quote.note ? { note: quote.note } : {}),
        }),
        ...(policy ? { extraPolicy: policy } : {}),
        db,
      });
      return {
        raise: v.verdict === 'raise',
        severity: v.severity,
        concerns: v.concerns,
        reviewModel: v.reviewModel,
      };
    },
  };
}
