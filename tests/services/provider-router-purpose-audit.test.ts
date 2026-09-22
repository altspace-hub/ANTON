/**
 * provider-router-purpose-audit.test.ts — Wave 6 track E: utility calls reach
 * the ledger.
 *
 * Quality scores, atom extraction, session conclusions and structured
 * extraction all ran through callChat with no audit_log row, so the ledger
 * showed module runs and nothing of the background work they set off. A
 * callChat with `purpose` + `db` now enqueues one row: module_id
 * `utility:<purpose>`, the resolved provider and model, tokens including the
 * prompt cache, cost on the chat route's basis, and status.
 *
 * Fakes at the production seams, no database:
 *   - audit-queue's enqueueAudit (captured, not flushed);
 *   - @anthropic-ai/sdk — messages.stream() returning usage with cache fields,
 *     both as finalMessage() (callChat) and as an event stream (streamChat);
 *   - the Agent SDK boundary (setSdkQueryImplForTests) for the sdk: engine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { AuditEntry } from '../../server/services/auditLogger.js';

const h = vi.hoisted(() => ({
  audits: [] as AuditEntry[],
  apiFails: false,
  /** The dated id the API reports back; undefined simulates a response without one. */
  servedModel: 'claude-opus-4-8-20260801' as string | undefined,
  usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 4000, cache_creation_input_tokens: 800 },
}));

vi.mock('../../server/services/audit-queue.js', () => ({
  enqueueAudit: (entry: AuditEntry) => { h.audits.push(entry); },
  initAuditQueue: () => undefined,
  flushAuditQueue: () => undefined,
}));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: () => {
        if (h.apiFails) throw new Error('overloaded_error');
        const events = [
          { type: 'message_start', message: { model: h.servedModel, usage: { ...h.usage, output_tokens: 1 } } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"ok":true}' } },
          { type: 'message_delta', usage: { output_tokens: h.usage.output_tokens } },
        ];
        return {
          finalMessage: async () => ({ model: h.servedModel, content: [{ type: 'text', text: '{"ok":true}' }], usage: { ...h.usage } }),
          [Symbol.asyncIterator]: async function* () { for (const e of events) yield e; },
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

import { callChat, streamChat, buildUtilityAuditEntry } from '../../server/services/provider-router.js';
import { setSdkQueryImplForTests } from '../../server/services/claude-sdk-client.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';
import { MODEL_CAPABILITIES } from '../../server/config/model-capabilities.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'SDK_ENGINE_ENABLED'] as const;
let saved: Record<string, string | undefined>;

const db = { get: async () => undefined, all: async () => [], run: async () => ({ changes: 0, lastInsertRowid: 0 }) } as unknown as DatabaseAdapter;
const base = { system: 'Respond with JSON.', messages: [{ role: 'user', content: 'score this' }], background: true };

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ANTHROPIC_API_KEY = 'test-key';
  h.audits.length = 0;
  h.apiFails = false;
  h.servedModel = 'claude-opus-4-8-20260801';
  resetSdkEngineStoreForTests();
});

afterEach(() => {
  setSdkQueryImplForTests(null);
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetSdkEngineStoreForTests();
});

describe('callChat with a purpose — API branch', () => {
  it('enqueues one audit row shaped like the chat route\'s, with cache tokens and a list cost', async () => {
    const result = await callChat({ ...base, model: 'claude-opus-4-8', purpose: 'quality-score', db });

    // ChatResult carries the cache counters and the served model now (additive).
    expect(result).toMatchObject({ inputTokens: 1200, outputTokens: 300, cacheReadTokens: 4000, cacheCreationTokens: 800, modelServed: 'claude-opus-4-8-20260801' });

    expect(h.audits).toHaveLength(1);
    const p = MODEL_CAPABILITIES['claude-opus-4-8'].pricing;
    const expectedCost = (1200 * p.inputPerMillion + 4000 * p.cachedInputPerMillion + 800 * p.inputPerMillion * 1.25 + 300 * p.outputPerMillion) / 1_000_000;
    expect(h.audits[0]).toEqual({
      moduleId: 'utility:quality-score',
      model: 'claude-opus-4-8',
      provider: 'anthropic',
      thinkingLevel: undefined,
      writingTone: 'professional',
      emojiEnabled: false,
      structuredReasoning: false,
      transparencyLevel: 0,
      inputTokenCount: 1200,
      outputTokenCount: 300,
      cachedTokens: 4000,
      cacheCreationTokens: 800,
      estimatedCostUsd: expect.closeTo(expectedCost, 10),
      responseStatus: 'success',
      seed: undefined,
    });
    expect(h.audits[0].estimatedCostUsd).toBeGreaterThan(0);
  });

  it('writes no audit row without a purpose, or without a db', async () => {
    const plain = await callChat({ ...base, model: 'claude-opus-4-8', db });
    expect(plain.cacheReadTokens).toBe(4000);
    await callChat({ ...base, model: 'claude-opus-4-8', purpose: 'quality-score' });
    expect(h.audits).toHaveLength(0);
  });

  it('audits a failed call as status error and still throws', async () => {
    h.apiFails = true;
    await expect(callChat({ ...base, model: 'claude-opus-4-8', purpose: 'session-conclusion', db })).rejects.toThrow(/overloaded_error/);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      moduleId: 'utility:session-conclusion', provider: 'anthropic', responseStatus: 'error',
      inputTokenCount: 0, outputTokenCount: 0, cachedTokens: 0, cacheCreationTokens: 0,
    });
  });
});

describe('callChat with a purpose — subscription engine', () => {
  it('records provider anthropic_sdk, the engine\'s cache tokens, and no dollar figure (plan usage)', async () => {
    process.env.SDK_ENGINE_ENABLED = 'true';
    setSdkQueryImplForTests(() => (async function* () {
      yield {
        type: 'result', subtype: 'success', result: '[]',
        usage: { input_tokens: 90, output_tokens: 12, cache_read_input_tokens: 5000, cache_creation_input_tokens: 64 },
        modelUsage: { 'claude-opus-5-20260701': { outputTokens: 12 }, 'claude-haiku-4-5-20251001': { outputTokens: 2 } },
      } as { type: string };
    })());

    const result = await callChat({ ...base, model: 'sdk:claude-opus-5', purpose: 'atom-extraction', db });
    expect(result).toMatchObject({ text: '[]', inputTokens: 90, outputTokens: 12, cacheReadTokens: 5000, cacheCreationTokens: 64 });
    // The engine's answer, not the sdk: alias that was sent.
    expect(result.modelServed).toBe('claude-opus-5-20260701');

    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      moduleId: 'utility:atom-extraction', model: 'sdk:claude-opus-5', provider: 'anthropic_sdk',
      inputTokenCount: 90, outputTokenCount: 12, cachedTokens: 5000, cacheCreationTokens: 64, responseStatus: 'success',
    });
    expect(h.audits[0].estimatedCostUsd).toBeUndefined();
  });
});

describe('streamChat — API branch reports the prompt cache too', () => {
  it('returns cacheReadTokens / cacheCreationTokens from message_start usage (and writes no audit)', async () => {
    const res = { headersSent: true, write: () => true, end: () => undefined, writeHead: () => undefined, setHeader: () => undefined } as unknown as Response;
    const result = await streamChat({ ...base, model: 'claude-opus-4-8' }, res);
    expect(result).toEqual({
      text: '{"ok":true}', thinking: '', inputTokens: 1200, outputTokens: 300,
      cacheReadTokens: 4000, cacheCreationTokens: 800, modelServed: 'claude-opus-4-8-20260801',
    });
    expect(h.audits).toHaveLength(0);
  });

  it('leaves modelServed undefined when the provider reports none — never the id that was sent', async () => {
    h.servedModel = undefined;
    const res = { headersSent: true, write: () => true, end: () => undefined, writeHead: () => undefined, setHeader: () => undefined } as unknown as Response;
    expect((await streamChat({ ...base, model: 'claude-opus-4-8' }, res)).modelServed).toBeUndefined();
    expect((await callChat({ ...base, model: 'claude-opus-4-8' })).modelServed).toBeUndefined();
  });
});

describe('buildUtilityAuditEntry — cost basis', () => {
  const entry = (provider: string, modelId: string) => buildUtilityAuditEntry({
    purpose: 'structured-extraction', provider, modelId, inputTokens: 100, outputTokens: 50, status: 'success',
  });

  it('ollama is free (0); an unpriced compat/azure model is unknown (undefined, NULL in the ledger)', () => {
    expect(entry('ollama', 'ollama:qwen2.5').estimatedCostUsd).toBe(0);
    expect(entry('openai_compatible', 'compat:openrouter:qwen/qwen-2.5-72b').estimatedCostUsd).toBeUndefined();
    expect(entry('azure_openai', 'azure:gpt4o-prod').estimatedCostUsd).toBeUndefined();
    expect(entry('openai_codex', 'codex:gpt-5.4').estimatedCostUsd).toBeUndefined();
  });

  it('defaults the cache counters to 0 when a provider reports none', () => {
    expect(entry('mistral', 'mistral-large-latest')).toMatchObject({ cachedTokens: 0, cacheCreationTokens: 0, moduleId: 'utility:structured-extraction' });
  });
});
