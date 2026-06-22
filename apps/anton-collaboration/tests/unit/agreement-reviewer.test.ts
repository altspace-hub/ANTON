/**
 * agreement-reviewer.test.ts — the independent four-eyes agreement reviewer,
 * driven by a stub LLM seam (no network). Proves it parses verdicts and — the
 * point of the control — FAILS CLOSED (raises) on a malformed reply or an error.
 */
import { describe, it, expect } from 'vitest';
import {
  createAgreementReviewer, type ReviewLLM, type AgreementReviewInput,
} from '../../src/main/agreement-reviewer.js';

const INPUT: AgreementReviewInput = {
  action: 'accept', decision: 'Buy 1 widget', terms: 'ship to SE, pay on chain',
  amountFtc: 0.1, counterparty: 'fc_seller',
};
const llm = (text: string): ReviewLLM => ({ complete: async () => text });
const llmThrows = (): ReviewLLM => ({ complete: async () => { throw new Error('credit balance too low'); } });

describe('agreement four-eyes reviewer', () => {
  it('passes a clean "ok" verdict (model stamped)', async () => {
    const r = createAgreementReviewer({ model: 'mistral-large-latest', llm: llm('{"verdict":"ok","severity":"low","concerns":[]}') });
    const v = await r.review(INPUT);
    expect(v.raise).toBe(false);
    expect(v.reviewModel).toBe('mistral-large-latest');
  });

  it('raises on a flagged verdict (tolerates prose around the JSON)', async () => {
    const r = createAgreementReviewer({ model: 'm', llm: llm('Sure: {"verdict":"raise","severity":"high","concerns":["disallowed item"]} ok') });
    const v = await r.review(INPUT);
    expect(v.raise).toBe(true);
    expect(v.concerns).toContain('disallowed item');
  });

  it('FAILS CLOSED on malformed output → raise', async () => {
    const r = createAgreementReviewer({ model: 'm', llm: llm('looks fine to me') });
    expect((await r.review(INPUT)).raise).toBe(true);
  });

  it('FAILS CLOSED on an LLM error → raise with the reason', async () => {
    const r = createAgreementReviewer({ model: 'm', llm: llmThrows() });
    const v = await r.review(INPUT);
    expect(v.raise).toBe(true);
    expect(v.concerns[0]).toContain('reviewer unavailable');
  });

  it('a "raise" with no stated concern still raises (placeholder)', async () => {
    const r = createAgreementReviewer({ model: 'm', llm: llm('{"verdict":"raise","severity":"medium","concerns":[]}') });
    const v = await r.review(INPUT);
    expect(v.raise).toBe(true);
    expect(v.concerns.length).toBeGreaterThan(0);
  });

  it('an unknown verdict value is treated as malformed → raise', async () => {
    const r = createAgreementReviewer({ model: 'm', llm: llm('{"verdict":"maybe","severity":"low"}') });
    expect((await r.review(INPUT)).raise).toBe(true);
  });
});
