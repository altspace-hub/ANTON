/**
 * model-adapter-request-shape.test.ts — what the second router's adapters send.
 *
 * unified-llm-client.ts (Civic, Grow, Procure, the companion app, the intent
 * router, smart actions) dispatches through model-adapter.ts. Two request
 * shapes there failed on current models (2026-09-23):
 *   - Anthropic: temperature 0.5 ('balanced') went out beside thinking, which
 *     the API rejects on every thinking request (and on Opus 4.7+ / Claude 5
 *     at any non-default value); the non-streaming call also asked the SDK
 *     for a 128k non-streaming request, which it refuses.
 *   - OpenAI: temperature + max_tokens went to every model, including the
 *     always-reasoning GPT-5.6 and GPT-6, which reject both.
 * provider-router's non-streaming OpenAI fetch had the second fault too.
 *
 * Each case fakes the SDK at the seam and inspects the params that arrived.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  anthropic: [] as Array<Record<string, unknown>>,
  openai: [] as Array<Record<string, unknown>>,
}));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (params: Record<string, unknown>) => {
        calls.anthropic.push(params);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            stop_reason: 'end_turn',
          }),
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } };
          },
        };
      },
      create: () => { throw new Error('non-streaming create must not be used'); },
    };
  }
  return { default: FakeAnthropic };
});

vi.mock('openai', () => {
  class FakeOpenAI {
    chat = {
      completions: {
        create: async (params: Record<string, unknown>) => {
          calls.openai.push(params);
          if (params.stream) {
            return (async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })();
          }
          return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
        },
      },
    };
  }
  return { default: FakeOpenAI, OpenAI: FakeOpenAI };
});

import { createModelAdapter, type UnifiedLLMRequest } from '../../server/services/model-adapter.js';
import { callChat } from '../../server/services/provider-router.js';

const req = (model: string, thinking: UnifiedLLMRequest['thinking']): UnifiedLLMRequest => ({
  model, thinking, creativity: 'balanced', systemPrompt: 'sys', messages: [{ role: 'user', content: 'hi' }],
});

async function drain(gen: AsyncGenerator<string, void, unknown>): Promise<void> {
  for await (const _ of gen) { /* consume */ }
}

beforeEach(() => { calls.anthropic.length = 0; calls.openai.length = 0; });

describe('Anthropic adapter (unified-llm-client path)', () => {
  const adapter = createModelAdapter('anthropic', 'test-key');

  it('an adaptive model gets thinking + effort and no temperature, streamed, at its own output ceiling', async () => {
    await adapter.sendRequest(req('claude-opus-5-5', 'think'));
    const p = calls.anthropic[0];
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p).not.toHaveProperty('temperature');
    expect(p.max_tokens).toBe(128_000);
  });

  it('a budget model with thinking on sends no temperature either', async () => {
    await drain(adapter.sendStreamRequest(req('claude-haiku-4-5-20251001', 'think')));
    const p = calls.anthropic[0];
    expect(p.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
    expect(p).not.toHaveProperty('temperature');
  });

  it('negative control — with thinking off, the creativity temperature is still sent', async () => {
    await adapter.sendRequest(req('claude-haiku-4-5-20251001', 'quick'));
    const p = calls.anthropic[0];
    expect(p).not.toHaveProperty('thinking');
    expect(p.temperature).toBe(0.5);
    expect(p.max_tokens).toBe(8_192);
  });
});

describe('OpenAI adapter (unified-llm-client path)', () => {
  const adapter = createModelAdapter('openai', 'test-key');

  it('GPT-6 goes out as a reasoning request: effort from the level, max_completion_tokens, no temperature', async () => {
    await adapter.sendRequest(req('gpt-6-sol', 'investigate'));
    const p = calls.openai[0];
    expect(p.reasoning_effort).toBe('xhigh');
    expect(p.max_completion_tokens).toBe(16_384);
    expect(p).not.toHaveProperty('temperature');
    expect(p).not.toHaveProperty('max_tokens');
  });

  it('streams the same shape', async () => {
    await drain(adapter.sendStreamRequest(req('gpt-6-luna', 'quick')));
    const p = calls.openai[0];
    expect(p.stream).toBe(true);
    expect(p.reasoning_effort).toBe('low');
    expect(p).not.toHaveProperty('temperature');
  });

  it('negative control — a chat model keeps temperature + max_tokens', async () => {
    await adapter.sendRequest(req('gpt-4o', 'think'));
    const p = calls.openai[0];
    expect(p.temperature).toBe(1);
    expect(p.max_tokens).toBe(16_384);
    expect(p).not.toHaveProperty('reasoning_effort');
  });
});

describe('provider-router callChat, OpenAI branch', () => {
  const KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
  let saved: Record<string, string | undefined>;
  let bodies: Array<Record<string, unknown>>;
  let status: number;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.OPENAI_API_KEY = 'test-key';
    bodies = [];
    status = 200;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(
        status === 200 ? JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) : 'bad request',
        { status },
      );
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('GPT-6 gets reasoning_effort for the level and no temperature', async () => {
    const r = await callChat({ model: 'gpt-6-astra', system: 's', messages: [{ role: 'user', content: 'hi' }], thinkingLevel: 'deep_investigate', currentDate: false });
    expect(r.text).toBe('ok');
    expect(bodies[0].reasoning_effort).toBe('max');
    expect(bodies[0]).toHaveProperty('max_completion_tokens');
    expect(bodies[0]).not.toHaveProperty('temperature');
  });

  it('negative control — gpt-4o keeps temperature', async () => {
    await callChat({ model: 'gpt-4o', system: 's', messages: [{ role: 'user', content: 'hi' }], currentDate: false });
    expect(bodies[0].temperature).toBe(0.5);
    expect(bodies[0]).not.toHaveProperty('reasoning_effort');
  });

  it('a rejected request throws instead of returning an empty answer', async () => {
    status = 400;
    await expect(callChat({ model: 'gpt-6-sol', system: 's', messages: [{ role: 'user', content: 'hi' }], currentDate: false }))
      .rejects.toThrow(/OpenAI API error: 400/);
  });
});
