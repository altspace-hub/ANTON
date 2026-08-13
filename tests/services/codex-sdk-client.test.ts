/**
 * codex-sdk-client.test.ts — the ChatGPT-subscription engine's contract.
 * Mirror of claude-sdk-client.test.ts with the Codex event model:
 *
 *   1. AUTH — the subprocess env NEVER carries OPENAI_API_KEY and the Codex
 *      constructor NEVER receives apiKey; the ChatGPT sign-in (auth.json) is
 *      the only auth the runtime can reach.
 *   2. CONTAINMENT — read-only sandbox, approvals never, web search disabled,
 *      network off, tmp cwd, skipGitRepoCheck.
 *   3. SSE CONTRACT — Codex emits CUMULATIVE item text; the engine must emit
 *      suffix deltas, map usage (incl. reasoning tokens), and short-circuit
 *      the measured 401 retry ladder into an actionable sign-in message.
 *   4. ROUTING — codex:* resolves to openai_codex; codex:auto omits the model.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildCodexEnv,
  isCodexModel,
  codexUnderlyingModel,
  streamToResponse,
  completeText,
  setCodexFactoryForTests,
  CODEX_ENGINE_MODELS,
  type CodexEvent,
} from '../../server/services/codex-sdk-client.js';
import { resetCodexEngineStoreForTests } from '../../server/services/codex-engine-store.js';
import { codexReasoningEffort } from '../../server/services/thinking-map.js';
import { getProviderFromModelId } from '../../server/services/model-adapter.js';
import type { StreamSink } from '../../server/services/stream-sink.js';

// ── Helpers ─────────────────────────────────────────────────

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

type Captured = {
  constructorOptions: { env: Record<string, string> } | null;
  threadOptions: Record<string, unknown> | null;
  prompt: string | null;
  aborted: boolean;
};

/** Fake Codex whose event script is provided; captures every handoff. */
function fakeCodex(script: CodexEvent[]): Captured {
  const captured: Captured = { constructorOptions: null, threadOptions: null, prompt: null, aborted: false };
  setCodexFactoryForTests((options) => {
    captured.constructorOptions = options;
    return {
      startThread: (threadOptions?: Record<string, unknown>) => {
        captured.threadOptions = threadOptions ?? {};
        return {
          runStreamed: async (input: string, turnOptions?: { signal?: AbortSignal }) => {
            captured.prompt = input;
            turnOptions?.signal?.addEventListener('abort', () => { captured.aborted = true; }, { once: true });
            return {
              events: (async function* () {
                for (const ev of script) yield ev;
              })(),
            };
          },
        };
      },
    };
  });
  return captured;
}

const turnCompleted: CodexEvent = {
  type: 'turn.completed',
  usage: { input_tokens: 50, cached_input_tokens: 5, cache_write_input_tokens: 8, output_tokens: 12, reasoning_output_tokens: 30 },
};

const BASE_CONFIG = {
  model: 'codex:auto',
  thinking: 'think' as const,
  system: 'dynamic part',
  staticSystemPrompt: 'static part',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

beforeEach(() => {
  resetCodexEngineStoreForTests();
  process.env.CODEX_ENGINE_ENABLED = 'true';
});

afterEach(() => {
  setCodexFactoryForTests(null);
  delete process.env.CODEX_ENGINE_ENABLED;
  resetCodexEngineStoreForTests();
});

// ── 1. Auth ─────────────────────────────────────────────────

describe('buildCodexEnv — subscription auth by key absence', () => {
  it('strips OPENAI_API_KEY and keeps inherited vars', () => {
    const env = buildCodexEnv({ OPENAI_API_KEY: 'sk-leaky', PATH: '/usr/bin', HOME: '/home/u' });
    expect('OPENAI_API_KEY' in env).toBe(false);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/u');
  });

  it('the real handoff carries no key and no apiKey option', async () => {
    process.env.OPENAI_API_KEY = 'sk-should-never-leak';
    try {
      const captured = fakeCodex([
        { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'ok' } },
        turnCompleted,
      ]);
      const { sink } = collectingSink();
      await streamToResponse(BASE_CONFIG, sink);
      expect(captured.constructorOptions).not.toBeNull();
      expect('OPENAI_API_KEY' in captured.constructorOptions!.env).toBe(false);
      expect('apiKey' in (captured.constructorOptions as Record<string, unknown>)).toBe(false);
      expect(captured.constructorOptions!.env.PATH ?? captured.constructorOptions!.env.Path).toBeDefined();
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});

// ── 2. Containment ──────────────────────────────────────────

describe('thread options — the read-only containment set', () => {
  it('read-only sandbox, approvals never, web search + network off, tmp cwd', async () => {
    const captured = fakeCodex([turnCompleted]);
    const { sink } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    const o = captured.threadOptions!;
    expect(o.sandboxMode).toBe('read-only');
    expect(o.approvalPolicy).toBe('never');
    expect(o.webSearchMode).toBe('disabled');
    expect(o.networkAccessEnabled).toBe(false);
    expect(o.skipGitRepoCheck).toBe(true);
    expect(typeof o.workingDirectory).toBe('string');
  });

  it('codex:auto omits the model; explicit ids pass through', async () => {
    const captured = fakeCodex([turnCompleted]);
    const { sink } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    expect('model' in captured.threadOptions!).toBe(false);

    const captured2 = fakeCodex([turnCompleted]);
    const { sink: sink2 } = collectingSink();
    await streamToResponse({ ...BASE_CONFIG, model: 'codex:gpt-5.2-codex' }, sink2);
    expect(captured2.threadOptions!.model).toBe('gpt-5.2-codex');
  });

  it('the composed system prompt rides in the instructions block ahead of the message', async () => {
    const captured = fakeCodex([turnCompleted]);
    const { sink } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    expect(captured.prompt).toContain('<system_instructions>\nstatic part\n\ndynamic part\n</system_instructions>');
    expect(captured.prompt!.endsWith('hello')).toBe(true);
  });
});

// ── 3. SSE contract ─────────────────────────────────────────

describe('streamToResponse — StreamEvent wire contract', () => {
  it('cumulative item text becomes suffix deltas; usage maps reasoning tokens', async () => {
    fakeCodex([
      { type: 'item.updated', item: { id: 'r1', type: 'reasoning', text: 'hmm' } },
      { type: 'item.updated', item: { id: 'm1', type: 'agent_message', text: 'Hel' } },
      { type: 'item.updated', item: { id: 'm1', type: 'agent_message', text: 'Hello wor' } },
      { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'Hello world' } },
      turnCompleted,
    ]);
    const { sink, events, done } = collectingSink();
    let completion: { text: string } | null = null;
    await streamToResponse(BASE_CONFIG, sink, (d) => { completion = d; });

    const textDeltas = events().filter((e) => e.type === 'text_delta').map((e) => e.content);
    expect(textDeltas).toEqual(['Hel', 'lo wor', 'ld']);
    expect(events().some((e) => e.type === 'thinking_delta' && e.content === 'hmm')).toBe(true);

    const usage = events().find((e) => e.type === 'usage');
    expect(usage).toMatchObject({
      inputTokens: 50, outputTokens: 12, cacheReadTokens: 5, cacheCreationTokens: 8, thinkingTokens: 30,
    });

    const end = events().find((e) => e.type === 'stream_end') as { contentBlocks: Array<{ type: string; content: string }> };
    expect(end.contentBlocks).toContainEqual({ type: 'text', content: 'Hello world' });
    expect(done()).toBe(true);
    expect(completion!.text).toBe('Hello world');
  });

  it('a 401 error event short-circuits the retry ladder into a sign-in message', async () => {
    const captured = fakeCodex([
      { type: 'error', message: 'Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing bearer...)' },
      // If the engine did NOT break out, this would emit text after the 401:
      { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'should never appear' } },
      turnCompleted,
    ]);
    const { sink, events, done } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    const err = events().find((e) => e.type === 'error') as { message: string };
    expect(err.message).toContain('codex login');
    expect(events().some((e) => e.type === 'text_delta')).toBe(false);
    expect(captured.aborted).toBe(true);
    expect(done()).toBe(true);
  });

  it('turn.failed surfaces its message; non-401 reconnect noise is not forwarded', async () => {
    fakeCodex([
      { type: 'error', message: 'Reconnecting... 1/5 (stream reset)' },
      { type: 'turn.failed', error: { message: 'model overloaded' } },
    ]);
    const { sink, events } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    const errs = events().filter((e) => e.type === 'error');
    expect(errs).toHaveLength(1);
    expect((errs[0] as { message: string }).message).toContain('model overloaded');
  });

  it('refuses with an SSE error when disabled — the factory is never invoked', async () => {
    delete process.env.CODEX_ENGINE_ENABLED;
    resetCodexEngineStoreForTests();
    const captured = fakeCodex([turnCompleted]);
    const { sink, events } = collectingSink();
    await streamToResponse(BASE_CONFIG, sink);
    expect(captured.constructorOptions).toBeNull();
    expect((events().find((e) => e.type === 'error') as { message: string }).message).toContain('disabled');
  });
});

describe('completeText — aggregate for the non-streaming path', () => {
  it('returns the aggregated completion', async () => {
    fakeCodex([
      { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'agg' } },
      turnCompleted,
    ]);
    const data = await completeText(BASE_CONFIG);
    expect(data.text).toBe('agg');
    expect(data.inputTokens).toBe(50);
  });

  it('rejects with the engine error message when the run fails', async () => {
    fakeCodex([{ type: 'turn.failed', error: { message: 'boom' } }]);
    await expect(completeText(BASE_CONFIG)).rejects.toThrow(/boom/);
  });
});

// ── 4. Routing + mapping ────────────────────────────────────

describe('model-id routing', () => {
  it('codex:* resolves to openai_codex, never openai or anthropic', () => {
    expect(getProviderFromModelId('codex:auto')).toBe('openai_codex');
    expect(getProviderFromModelId('codex:gpt-5.2-codex')).toBe('openai_codex');
    expect(getProviderFromModelId('gpt-4o')).toBe('openai');
  });

  it('prefix helpers: auto means CLI default (undefined model)', () => {
    expect(isCodexModel('codex:auto')).toBe(true);
    expect(isCodexModel('gpt-4o')).toBe(false);
    expect(codexUnderlyingModel('codex:auto')).toBeUndefined();
    expect(codexUnderlyingModel('codex:gpt-5.2-codex')).toBe('gpt-5.2-codex');
  });

  it('every advertised picker model is codex:-prefixed and resolvable', () => {
    for (const m of CODEX_ENGINE_MODELS) {
      expect(isCodexModel(m.id)).toBe(true);
      expect(getProviderFromModelId(m.id)).toBe('openai_codex');
    }
  });
});

describe('codexReasoningEffort — single-source thinking mapping', () => {
  it('maps the six levels onto minimal..xhigh', () => {
    expect(codexReasoningEffort('quick')).toBe('minimal');
    expect(codexReasoningEffort('think')).toBe('medium');
    expect(codexReasoningEffort('think_hard')).toBe('high');
    expect(codexReasoningEffort('investigate')).toBe('xhigh');
    expect(codexReasoningEffort('deep_investigate')).toBe('xhigh');
  });
});
