import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../../server/db/database.js';

/**
 * 2026-08-19: the LLM verification path graded "NVDA posts a daily move
 * exceeding 2.5% within three sessions" as CORRECT — reasoning from base
 * rates ("NVDA's realized volatility routinely produces 2.5%+ daily swings")
 * while its own stored outcome admitted "no direct price data was supplied
 * for confirmation". NVDA's largest actual move was -1.94%.
 *
 * A guess recorded as a verified outcome is worse than no grade at all: it is
 * permanent, it feeds Brier scoring and calibration, and nothing downstream
 * can tell it apart from a real measurement. The same reasoning already
 * governs the price path via PRICE_STALENESS_DAYS; this is its counterpart
 * for the model path.
 */

const streamToHandler = vi.fn();
vi.mock('../../../server/services/unified-llm-client.js', () => ({
  streamToHandler: (...args: unknown[]) => streamToHandler(...args),
}));
vi.mock('../../../server/services/markets-model-store.js', () => ({
  getMarketsModel: async () => 'claude-haiku-4-5-20251001',
}));

const { createPredictionVerifier, LLM_VERIFICATION_MIN_CONFIDENCE } =
  await import('../../../server/services/market-prediction-verifier.js');

/** db double: one atom exists, so the LLM path is actually reached. */
const db = {
  all: async (sql: string) => (sql.includes('market_atoms') ? [{ content: 'Some unrelated market chatter.' }] : []),
  get: async () => undefined,
  run: async () => undefined,
} as unknown as DatabaseAdapter;

/** Make the mocked model reply with a given JSON body. */
function replyWith(body: Record<string, unknown>) {
  streamToHandler.mockImplementation((...args: unknown[]) => {
    // Read the callback positionally and check it: the mock also receives a
    // zero-argument call from the module wrapper, and destructuring the third
    // parameter blindly throws there before any assertion runs.
    const onComplete = args[2] as ((c: { text: string }) => void) | undefined;
    if (typeof onComplete === 'function') onComplete({ text: JSON.stringify(body) });
    return Promise.resolve();
  });
}

/** A binary claim with no parseable numeric threshold → LLM path. */
const eventPred = {
  id: 'p1', title: 'Tesla FSD European approval by August 18',
  prediction_type: 'binary', target_symbol: 'TSLA', predicted_direction: null,
  predicted_outcome: 'regulatory approval granted', predicted_value: null,
  confidence: 0.6, created_at: '2026-08-14T00:00:00Z', deadline: '2026-08-18',
  verification_attempts: 0,
};

beforeEach(() => streamToHandler.mockReset());

describe('LLM verification — evidence guard', () => {
  it('exports a confidence floor above zero', () => {
    expect(LLM_VERIFICATION_MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(LLM_VERIFICATION_MIN_CONFIDENCE).toBeLessThanOrEqual(1);
  });

  it('refuses to grade when the model reports insufficient evidence', async () => {
    replyWith({
      insufficientEvidence: true, wasCorrect: true,
      actualOutcome: 'probably happened', explanation: 'base rates suggest it',
      verificationConfidence: 0.9,
    });
    const verifier = await createPredictionVerifier(db);
    const r = await verifier.verifyPrediction(eventPred as never);

    // Must NOT become a graded outcome, even though wasCorrect was true and
    // the model was confident — confidence in a guess is still a guess.
    expect(r.method).toBe('unverifiable');
    expect(r.actualOutcome).toMatch(/does not settle/i);
  });

  it('refuses to grade below the confidence floor', async () => {
    replyWith({
      insufficientEvidence: false, wasCorrect: true,
      actualOutcome: 'maybe', explanation: 'unclear',
      verificationConfidence: LLM_VERIFICATION_MIN_CONFIDENCE - 0.01,
    });
    const verifier = await createPredictionVerifier(db);
    const r = await verifier.verifyPrediction(eventPred as never);

    expect(r.method).toBe('unverifiable');
  });

  it('grades normally on a confident, evidenced answer', async () => {
    replyWith({
      insufficientEvidence: false, wasCorrect: true,
      actualOutcome: 'approval granted 2026-08-16',
      explanation: 'the supplied intelligence reports the approval',
      verificationConfidence: 0.85,
    });
    const verifier = await createPredictionVerifier(db);
    const r = await verifier.verifyPrediction(eventPred as never);

    expect(r.method).toBe('auto_llm');
    expect(r.wasCorrect).toBe(true);
    expect(r.verificationConfidence).toBeCloseTo(0.85, 6);
  });

  it('instructs the model not to infer from base rates', async () => {
    replyWith({ insufficientEvidence: true, verificationConfidence: 0.9 });
    const verifier = await createPredictionVerifier(db);
    await verifier.verifyPrediction(eventPred as never);

    const system = String((streamToHandler.mock.calls[0]?.[0] as { system?: string })?.system ?? '');
    expect(system).toMatch(/base rates/i);
    expect(system).toMatch(/insufficientEvidence/);
  });
});
