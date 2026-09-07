/**
 * provider-router-sdk-engine.test.ts — the streaming seam to the subscription
 * engine, and the end-to-end claim behind it: a specialty route that hardcodes
 * a Claude-4 id reaches the SDK engine under an sdk: default and never opens a
 * metered API request.
 *
 * Two fakes, both at the exact production seams:
 *   - the Agent SDK boundary (setSdkQueryImplForTests) — scripted messages,
 *     captured options;
 *   - @anthropic-ai/sdk — a class whose messages.stream() records the params
 *     it was given. Any call to it in the sdk-default cases is the bug.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';

const anthropicCalls = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (params: Record<string, unknown>) => {
        anthropicCalls.params.push(params);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: 'api text' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

import { streamChat, callChat, mapModelToProvider } from '../../server/services/provider-router.js';
import { setSdkQueryImplForTests } from '../../server/services/claude-sdk-client.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'SDK_ENGINE_ENABLED'] as const;
let saved: Record<string, string | undefined>;

function setEnv(keys: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(keys)) process.env[k] = v;
}

type CapturedCall = { prompt: string; options: Record<string, unknown> };

function fakeSdk(messages: object[]) {
  const calls: CapturedCall[] = [];
  setSdkQueryImplForTests((params) => {
    calls.push(params as CapturedCall);
    return (async function* () {
      for (const m of messages) yield m as { type: string };
    })();
  });
  return calls;
}

const textDelta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const thinkingDelta = (thinking: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } } });
const success = { type: 'result', subtype: 'success', result: 'ab', usage: { input_tokens: 40, output_tokens: 7 } };

/** The response a streamChat caller owns: headers already sent, terminator its own. */
function callerResponse() {
  const writes: string[] = [];
  let ended = false;
  const res = {
    headersSent: true,
    write: (chunk: string) => { writes.push(chunk); return true; },
    end: () => { ended = true; },
    writeHead: () => undefined,
    setHeader: () => undefined,
  } as unknown as Response;
  const events = () => writes
    .flatMap((c) => c.split('\n'))
    .filter((l) => l.startsWith('data: '))
    .map((l) => (l === 'data: [DONE]' ? { type: '[DONE]' } : (JSON.parse(l.slice(6)) as Record<string, unknown>)));
  return { res, events, ended: () => ended };
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  anthropicCalls.params.length = 0;
  resetSdkEngineStoreForTests();
  process.env.SDK_ENGINE_ENABLED = 'true';
});

afterEach(() => {
  setSdkQueryImplForTests(null);
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetSdkEngineStoreForTests();
});

describe('streamChat → SDK engine', () => {
  const config = { system: 'sys', messages: [{ role: 'user', content: 'hi' }] };

  it('forwards only text/thinking deltas, returns the aggregate, and leaves the response open', async () => {
    fakeSdk([thinkingDelta('t'), textDelta('a'), textDelta('b'), success]);
    const { res, events, ended } = callerResponse();

    const result = await streamChat({ ...config, model: 'sdk:claude-opus-5' }, res);

    expect(result).toEqual({ text: 'ab', thinking: 't', inputTokens: 40, outputTokens: 7 });
    const types = events().map((e) => e.type);
    expect(types).toEqual(['thinking_delta', 'text_delta', 'text_delta']);
    // the caller writes its own `done` and ends the response — the engine must not
    expect(types).not.toContain('stream_start');
    expect(types).not.toContain('stream_end');
    expect(types).not.toContain('[DONE]');
    expect(ended()).toBe(false);
  });

  it('throws when the engine reports a failure, instead of returning an empty result', async () => {
    fakeSdk([{ type: 'result', subtype: 'error_during_execution', errors: ['boom'] }]);
    const { res, ended } = callerResponse();
    await expect(streamChat({ ...config, model: 'sdk:claude-opus-5' }, res)).rejects.toThrow(/boom/);
    expect(ended()).toBe(false);
  });

  it('throws when the engine is disabled — an explicit failure, never a silent fallback to the key', async () => {
    delete process.env.SDK_ENGINE_ENABLED;
    resetSdkEngineStoreForTests();
    fakeSdk([success]);
    const { res } = callerResponse();
    await expect(streamChat({ ...config, model: 'sdk:claude-opus-5' }, res)).rejects.toThrow(/disabled/);
    expect(anthropicCalls.params).toHaveLength(0);
  });

  it('passes the caller\'s web tool through so the engine grants its web tools', async () => {
    const calls = fakeSdk([textDelta('x'), success]);
    const { res } = callerResponse();
    await streamChat({
      ...config,
      model: 'sdk:claude-opus-5',
      system: '## WEB SEARCH ENABLED\nUse the web_search tool to find sources.\n\nsys',
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      thinkingLevel: 'think_hard',
    }, res);
    expect(calls[0].options.tools).toEqual(['WebSearch', 'WebFetch']);
    expect(String(calls[0].options.systemPrompt)).toContain('WebSearch tool');
  });

  it('routes a hardcoded Claude-4 id from a specialty route to the engine under an sdk: default — no metered call', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'unfunded-key', DEFAULT_MODEL: 'sdk:claude-opus-5', SDK_ENGINE_ENABLED: 'true' });
    resetSdkEngineStoreForTests();
    const calls = fakeSdk([textDelta('engine'), success]);
    const { res } = callerResponse();

    // exactly what task-agent.ts / legal-research.ts / travel.ts do
    const result = await streamChat({ ...config, model: mapModelToProvider('claude-opus-4-8') }, res);

    expect(result.text).toBe('engine');
    expect(calls).toHaveLength(1);
    expect(calls[0].options.model).toBe('claude-opus-5');
    expect(anthropicCalls.params).toHaveLength(0);
  });
});

describe('callChat on the API path — tools and thinking together', () => {
  it('forwards tools when a thinking level is set (the old exclusivity guard dropped them)', async () => {
    setEnv({ ANTHROPIC_API_KEY: 'k' });
    const result = await callChat({
      model: 'claude-opus-4-8',
      system: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      thinkingLevel: 'think_hard',
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    });
    expect(result.text).toBe('api text');
    expect(anthropicCalls.params).toHaveLength(1);
    const params = anthropicCalls.params[0];
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }]);
  });
});
