/**
 * four-eyes-review.test.ts — the independent second-model review helper, driven
 * by a mocked callChat (no network). Proves it parses verdicts and — the point of
 * the control — FAILS CLOSED (raises) on malformed output or an LLM error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
}));

import { reviewWithSecondModel } from '../../server/services/four-eyes-review.js';
import { callChat } from '../../server/services/provider-router.js';
const callChatMock = vi.mocked(callChat);

const ARGS = {
  model: 'mistral-large-latest',
  taskDescription: 'Auto-quote a price.',
  untrustedInput: 'What is the price?',
  proposedOutput: '{"priceFtc":8}',
};

describe('four-eyes-review', () => {
  beforeEach(() => callChatMock.mockReset());

  it('passes a clean "ok" verdict through (with the review model stamped)', async () => {
    callChatMock.mockResolvedValue({ text: '{"verdict":"ok","severity":"low","concerns":[]}' });
    const v = await reviewWithSecondModel(ARGS);
    expect(v.verdict).toBe('ok');
    expect(v.concerns).toEqual([]);
    expect(v.reviewModel).toBe('mistral-large-latest');
  });

  it('raises on a flagged verdict (tolerating prose around the JSON)', async () => {
    callChatMock.mockResolvedValue({ text: 'Here you go: {"verdict":"raise","severity":"high","concerns":["disallowed weapon"]} done' });
    const v = await reviewWithSecondModel(ARGS);
    expect(v.verdict).toBe('raise');
    expect(v.concerns).toContain('disallowed weapon');
  });

  it('FAILS CLOSED on malformed (non-JSON) output → raise', async () => {
    callChatMock.mockResolvedValue({ text: 'I think it is fine, no JSON here.' });
    expect((await reviewWithSecondModel(ARGS)).verdict).toBe('raise');
  });

  it('FAILS CLOSED when the reviewer call errors → raise with the reason', async () => {
    // Resolve, but throw while the reply is read — exercises the same outer catch
    // as a rejected LLM call, without creating a rejected promise (which Vitest's
    // unhandled-rejection detector would flag even though the code handles it).
    callChatMock.mockResolvedValue({ get text(): string { throw new Error('credit balance too low'); } } as never);
    const v = await reviewWithSecondModel(ARGS);
    expect(v.verdict).toBe('raise');
    expect(v.concerns[0]).toContain('reviewer unavailable');
  });

  it('a "raise" with no stated concern still raises (placeholder, never silently ok)', async () => {
    callChatMock.mockResolvedValue({ text: '{"verdict":"raise","severity":"medium","concerns":[]}' });
    const v = await reviewWithSecondModel(ARGS);
    expect(v.verdict).toBe('raise');
    expect(v.concerns.length).toBeGreaterThan(0);
  });

  it('an unknown verdict value is treated as malformed → raise', async () => {
    callChatMock.mockResolvedValue({ text: '{"verdict":"maybe","severity":"low","concerns":[]}' });
    expect((await reviewWithSecondModel(ARGS)).verdict).toBe('raise');
  });
});
