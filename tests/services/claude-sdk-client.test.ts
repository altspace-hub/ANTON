/**
 * claude-sdk-client.test.ts — the SDK execution engine's contract.
 *
 * The load-bearing assertions, in order of what they protect:
 *   1. AUTH — the subprocess env NEVER carries ANTHROPIC_API_KEY (its absence
 *      is what makes the SDK authenticate with the machine's Claude Code
 *      login) while inherited vars like PATH survive the spread.
 *   2. CONTAINMENT — options sent to the SDK are the text-engine set:
 *      tools: [], maxTurns: 1, settingSources: [], persistSession: false.
 *   3. SSE CONTRACT — the engine emits exactly the StreamEvent wire format
 *      the frontend parser expects (stream_start → deltas → usage →
 *      stream_end{contentBlocks} → [DONE]) and onComplete carries the
 *      aggregate.
 *   4. ROUTING — sdk:claude-* resolves to 'anthropic_sdk', never to the API
 *      path (the compat: lesson: silent fallthrough ran requests on Claude).
 *
 * The SDK boundary is injected (setSdkQueryImplForTests); no subprocess, no
 * network. The fake captures the options object so the auth/containment
 * assertions bite at the exact seam where production hands off to the SDK.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildSdkEnv,
  flattenMessages,
  sdkThinkingOptions,
  isSdkModel,
  sdkUnderlyingModel,
  streamToResponse,
  completeText,
  setSdkQueryImplForTests,
  SDK_ENGINE_MODELS,
} from '../../server/services/claude-sdk-client.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';
import { getProviderFromModelId } from '../../server/services/model-adapter.js';
import type { StreamSink } from '../../server/services/stream-sink.js';

// ── Helpers ─────────────────────────────────────────────────

/** Sink that records the SSE wire format for assertion. */
function collectingSink() {
  const chunks: string[] = [];
  let headers: Record<string, string> | null = null;
  const sink: StreamSink = {
    headersSent: false,
    writeHead: (_status, h) => { headers = h; },
    write: (chunk: string) => { chunks.push(chunk); },
    end: () => undefined,
  };
  const events = () =>
    chunks
      .flatMap((c) => c.split('\n'))
      .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
      .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  const done = () => chunks.some((c) => c.includes('data: [DONE]'));
  return { sink, events, done, headers: () => headers };
}

type CapturedCall = { prompt: string; options: Record<string, unknown> };

/** Fake SDK whose message sequence is scripted; captures the handoff. */
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

const successResult = (over: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  result: 'final text',
  total_cost_usd: 0.01,
  num_turns: 1,
  usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 3, cache_read_input_tokens: 7 },
  ...over,
});

const textDelta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const thinkingDelta = (thinking: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } } });

const BASE_CONFIG = {
  model: 'sdk:claude-opus-5',
  thinking: 'think' as const,
  system: 'dynamic part',
  staticSystemPrompt: 'static part',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

beforeEach(() => {
  resetSdkEngineStoreForTests();
  process.env.SDK_ENGINE_ENABLED = 'true';
});

afterEach(() => {
  setSdkQueryImplForTests(null);
  delete process.env.SDK_ENGINE_ENABLED;
  resetSdkEngineStoreForTests();
});

// ── 1. Auth: the key must not reach the subprocess ──────────

describe('buildSdkEnv — subscription auth by key absence', () => {
  it('strips ANTHROPIC_API_KEY and keeps inherited vars', () => {
    const env = buildSdkEnv({ ANTHROPIC_API_KEY: 'sk-ant-secret', PATH: '/usr/bin', HOME: '/home/u' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect('ANTHROPIC_API_KEY' in env).toBe(false);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/u');
  });

  it('the env handed to the REAL SDK seam carries no key (whatever process.env holds)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-leaky';
    try {
      const calls = fakeSdk([successResult()]);
      const { sink } = collectingSink();
      await streamToResponse(BASE_CONFIG, sink);
      expect(calls).toHaveLength(1);
      const env = calls[0].options.env as Record<string, string | undefined>;
      expect(env).toBeDefined();
      expect('ANTHROPIC_API_KEY' in env).toBe(false);
      // The spread must have happened — a bare object would strip PATH and
      // the subprocess would never start on Windows.
      expect(env.PATH ?? env.Path).toBeDefined();
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

// ── 2. Containment: text engine, nothing granted ────────────

describe('SDK options — the text-engine containment set', () => {
  it('sends tools:[], maxTurns:1, settingSources:[], persistSession:false, dontAsk', async () => {
    const calls = fakeSdk([successResult()]);
    const { sink } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    const o = calls[0].options;
    expect(o.tools).toEqual([]);
    expect(o.maxTurns).toBe(1);
    expect(o.settingSources).toEqual([]);
    expect(o.persistSession).toBe(false);
    expect(o.permissionMode).toBe('dontAsk');
    expect(o.includePartialMessages).toBe(true);
  });

  it('strips the sdk: prefix for the model and concatenates static+dynamic prompts', async () => {
    const calls = fakeSdk([successResult()]);
    const { sink } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    expect(calls[0].options.model).toBe('claude-opus-5');
    expect(calls[0].options.systemPrompt).toBe('static part\n\ndynamic part');
  });
});

// ── 3. The SSE contract ─────────────────────────────────────

describe('streamToResponse — StreamEvent wire contract', () => {
  it('emits stream_start → deltas → usage → stream_end{contentBlocks} → [DONE]', async () => {
    fakeSdk([thinkingDelta('hmm '), textDelta('Hello'), textDelta(' world'), successResult()]);
    const { sink, events, done, headers } = collectingSink();
    let completion: { text: string; thinking: string; inputTokens: number; outputTokens: number } | null = null;
    await streamToResponse(BASE_CONFIG, sink, (d) => { completion = d; });

    expect(headers()?.['Content-Type']).toBe('text/event-stream');
    const types = events().map((e) => e.type);
    expect(types[0]).toBe('stream_start');
    expect(types).toContain('thinking_delta');
    expect(types).toContain('usage');
    expect(types[types.length - 1]).toBe('stream_end');
    expect(done()).toBe(true);

    const end = events().find((e) => e.type === 'stream_end') as { contentBlocks: Array<{ type: string; content: string }> };
    expect(end.contentBlocks).toEqual([
      { type: 'thinking', content: 'hmm ' },
      { type: 'text', content: 'Hello world' },
    ]);
    const usage = events().find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 7, cacheCreationTokens: 3 });

    expect(completion).not.toBeNull();
    expect(completion!.text).toBe('Hello world');
    expect(completion!.thinking).toBe('hmm ');
  });

  it('falls back to the result text when the runtime emits no partials', async () => {
    fakeSdk([successResult({ result: 'whole answer' })]);
    const { sink, events } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    const texts = events().filter((e) => e.type === 'text_delta');
    expect(texts).toHaveLength(1);
    expect(texts[0].content).toBe('whole answer');
  });

  it('an error result becomes an SSE error event naming the subtype — never a throw', async () => {
    fakeSdk([{ type: 'result', subtype: 'error_during_execution', errors: ['authentication failed'] }]);
    const { sink, events, done } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    const err = events().find((e) => e.type === 'error') as { message: string };
    expect(err.message).toContain('error_during_execution');
    expect(err.message).toContain('authentication failed');
    expect(done()).toBe(true);
  });

  it('a throwing SDK surfaces as an SSE error event, not an exception', async () => {
    setSdkQueryImplForTests(() => {
      // eslint-disable-next-line require-yield
      return (async function* (): AsyncGenerator<{ type: string }> {
        throw new Error('spawn ENOENT');
      })();
    });
    const { sink, events, done } = collectingSink();
    await expect(streamToResponse(BASE_CONFIG, sink)).resolves.toBeUndefined();
    const err = events().find((e) => e.type === 'error') as { message: string };
    expect(err.message).toContain('spawn ENOENT');
    expect(done()).toBe(true);
  });

  it('refuses with an SSE error when the engine is disabled — the SDK is never invoked', async () => {
    delete process.env.SDK_ENGINE_ENABLED;
    resetSdkEngineStoreForTests();
    const calls = fakeSdk([successResult()]);
    const { sink, events } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    expect(calls).toHaveLength(0);
    const err = events().find((e) => e.type === 'error') as { message: string };
    expect(err.message).toContain('disabled');
  });
});

describe('completeText — aggregate for the non-streaming path', () => {
  it('returns the aggregated completion', async () => {
    fakeSdk([textDelta('agg'), successResult()]);
    const data = await completeText(BASE_CONFIG);
    expect(data.text).toBe('agg');
    expect(data.inputTokens).toBe(100);
  });

  it('rejects with the engine error message when the run fails', async () => {
    fakeSdk([{ type: 'result', subtype: 'error_max_turns' }]);
    await expect(completeText(BASE_CONFIG)).rejects.toThrow(/error_max_turns/);
  });
});

// ── 4. Routing + mapping ────────────────────────────────────

describe('model-id routing', () => {
  it('sdk:claude-* resolves to anthropic_sdk, never the API provider', () => {
    expect(getProviderFromModelId('sdk:claude-opus-5')).toBe('anthropic_sdk');
    expect(getProviderFromModelId('sdk:claude-sonnet-5')).toBe('anthropic_sdk');
    // and the unprefixed id still routes to the API path
    expect(getProviderFromModelId('claude-opus-5')).toBe('anthropic');
  });

  it('prefix helpers round-trip', () => {
    expect(isSdkModel('sdk:claude-opus-5')).toBe(true);
    expect(isSdkModel('claude-opus-5')).toBe(false);
    expect(sdkUnderlyingModel('sdk:claude-opus-5')).toBe('claude-opus-5');
  });

  it('every advertised picker model is sdk:-prefixed and resolvable', () => {
    for (const m of SDK_ENGINE_MODELS) {
      expect(isSdkModel(m.id)).toBe(true);
      expect(getProviderFromModelId(m.id)).toBe('anthropic_sdk');
    }
  });
});

describe('sdkThinkingOptions — single-source thinking mapping', () => {
  it('adaptive models get adaptive thinking + effort', () => {
    expect(sdkThinkingOptions('think_hard', 'claude-opus-5')).toEqual({
      thinking: { type: 'adaptive' },
      effort: 'high',
    });
    expect(sdkThinkingOptions('investigate', 'claude-fable-5').effort).toBe('max');
  });

  it('budget models get an explicit budget; quick disables thinking', () => {
    expect(sdkThinkingOptions('think', 'claude-haiku-4-5-20251001')).toEqual({
      thinking: { type: 'enabled', budgetTokens: 4096 },
    });
    expect(sdkThinkingOptions('quick', 'claude-haiku-4-5-20251001')).toEqual({
      thinking: { type: 'disabled' },
    });
  });
});

describe('flattenMessages', () => {
  it('single message passes through untouched', () => {
    expect(flattenMessages([{ role: 'user', content: 'just this' }])).toBe('just this');
  });

  it('multi-turn history becomes a labelled transcript with the last message outside it', () => {
    const flat = flattenMessages([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    expect(flat).toContain('<conversation_so_far>');
    expect(flat).toContain('User: q1');
    expect(flat).toContain('Assistant: a1');
    expect(flat.endsWith('q2')).toBe(true);
    // the FINAL user message must sit outside the history wrapper
    expect(flat.split('</conversation_so_far>')[1]).toContain('q2');
  });
});
