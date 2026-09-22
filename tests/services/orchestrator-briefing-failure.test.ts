/**
 * orchestrator-briefing-failure.test.ts — a briefing the model never wrote is
 * not a briefing.
 *
 * generateBriefing used to catch the LLM error and return a placeholder with
 * `proposals: []`. The heartbeat then saved the placeholder, logged "Briefing
 * generated — 0 proposals" and recorded the cycle as 'ok'. That is how the
 * briefing path stayed dead from 2026-05-08 for four months — 78% of all
 * stored briefings are the placeholder string — with every cycle reporting
 * success. The failure must propagate so the heartbeat row says 'error' and
 * names the cause.
 */
import { describe, it, expect, vi } from 'vitest';

const callChatMock = vi.fn(async (_opts: { model: string }) => { throw new Error('SDK engine busy'); });

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: { model: string }) => callChatMock(opts),
  mapModelToProvider: (m: string) => `sdk:${m}`,
}));

import { generateBriefing } from '../../server/services/orchestrator-engine.js';

describe('generateBriefing when the LLM call fails', () => {
  it('propagates the failure, naming the model, instead of returning a placeholder recorded as success', async () => {
    await expect(
      generateBriefing([], null, 'claude-opus-4-8', 'heartbeat'),
    ).rejects.toThrow(/Briefing generation failed on sdk:claude-opus-4-8: SDK engine busy/);
    expect(callChatMock).toHaveBeenCalledTimes(1);
  });
});
