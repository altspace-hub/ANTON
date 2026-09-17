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
import { createHash } from 'node:crypto';
import {
  buildSdkEnv,
  flattenMessages,
  sdkThinkingOptions,
  isSdkModel,
  sdkUnderlyingModel,
  streamToResponse,
  completeText,
  setSdkQueryImplForTests,
  activeSdkRunsForTests,
  tryAcquireSdkSlot,
  releaseSdkSlot,
  SDK_ENGINE_MODELS,
  SDK_WEB_MAX_TURNS,
  WEB_SOURCE_RESULT_CAP,
  type SdkCompletionData,
  type WebSourceRecord,
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

  // The one opt-in widening: ANTON's web_search tool grants exactly the two
  // network tools. Everything else in the containment set must be unchanged.
  const WEB_PROMPT = '## WEB SEARCH ENABLED\nUse the web_search tool to find the latest guidance.\n\nTask text.';
  const WEB_TOOL = [{ type: 'web_search_20250305', name: 'web_search' }];

  it('grants exactly WebSearch + WebFetch, with more turns, when the caller passes the web_search tool', async () => {
    const calls = fakeSdk([successResult()]);
    const { sink } = collectingSink();
    await streamToResponse({ ...BASE_CONFIG, system: WEB_PROMPT, tools: WEB_TOOL }, sink);
    const o = calls[0].options;
    expect(o.tools).toEqual(['WebSearch', 'WebFetch']);
    expect(o.allowedTools).toEqual(['WebSearch', 'WebFetch']);
    expect(o.maxTurns).toBe(SDK_WEB_MAX_TURNS);
    expect(o.permissionMode).toBe('dontAsk');        // every other built-in still denied
    expect(o.settingSources).toEqual([]);
    expect(o.env).not.toHaveProperty('ANTHROPIC_API_KEY');
    // the instruction names the tool the request actually carries
    expect(String(o.systemPrompt)).toContain('Use the WebSearch tool');
    expect(String(o.systemPrompt)).not.toContain('web_search tool');
  });

  it('strips the web-search instruction when no web tool is granted — a prompt never names a tool the request lacks', async () => {
    const calls = fakeSdk([successResult()]);
    const { sink } = collectingSink();
    await streamToResponse({ ...BASE_CONFIG, system: WEB_PROMPT }, sink);
    const o = calls[0].options;
    expect(o.tools).toEqual([]);
    expect(o.maxTurns).toBe(1);
    expect(o).not.toHaveProperty('allowedTools');
    expect(String(o.systemPrompt)).not.toContain('WEB SEARCH ENABLED');
    expect(String(o.systemPrompt)).toContain('Task text.');
  });

  it('keeps a streamed answer when a web run exhausts its turns', async () => {
    fakeSdk([textDelta('partial answer'), { type: 'result', subtype: 'error_max_turns', usage: { input_tokens: 5, output_tokens: 2 } }]);
    const data = await completeText({ ...BASE_CONFIG, tools: WEB_TOOL });
    expect(data.text).toBe('partial answer');
    expect(data.outputTokens).toBe(2);
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

// ── Wave 0: the ledger records what the engine served ───────

describe('Wave 0 — onComplete carries what the engine actually served', () => {
  it('reports the served model (largest output share), the SDK cost estimate and the exact prompt sent', async () => {
    const calls = fakeSdk([
      textDelta('Hello'),
      successResult({
        modelUsage: {
          'claude-haiku-4-5-20251001': { outputTokens: 2 },
          'claude-opus-5-20260601': { outputTokens: 20 },
        },
      }),
    ]);
    const { sink, events } = collectingSink();
    let completion: { modelServed?: string; engineCostUsd?: number; systemPromptSent?: string } | null = null;
    await streamToResponse(BASE_CONFIG, sink, (d) => { completion = d; });

    expect(completion).not.toBeNull();
    expect(completion!.modelServed).toBe('claude-opus-5-20260601');
    expect(completion!.engineCostUsd).toBe(0.01);
    // The run artifact must pin the string the subprocess received, not the
    // route's pre-rewording composition.
    expect(completion!.systemPromptSent).toBe(calls[0].options.systemPrompt);
    expect(completion!.systemPromptSent).toBe('static part\n\ndynamic part');

    const usage = events().find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ modelServed: 'claude-opus-5-20260601' });
  });

  it('prefers the canonical model id when the SDK supplies one', async () => {
    fakeSdk([textDelta('x'), successResult({ modelUsage: { 'us.anthropic.claude-opus-5': { outputTokens: 9, canonicalModel: 'claude-opus-5' } } })]);
    const { sink } = collectingSink();
    let completion: { modelServed?: string } | null = null;
    await streamToResponse(BASE_CONFIG, sink, (d) => { completion = d; });
    expect(completion!.modelServed).toBe('claude-opus-5');
  });

  it('leaves modelServed undefined when the SDK reports no per-model usage', async () => {
    fakeSdk([textDelta('x'), successResult()]);
    const { sink, events } = collectingSink();
    let completion: { modelServed?: string } | null = null;
    await streamToResponse(BASE_CONFIG, sink, (d) => { completion = d; });
    expect(completion!.modelServed).toBeUndefined();
    const usage = events().find((e) => e.type === 'usage') as Record<string, unknown>;
    expect('modelServed' in usage).toBe(false);
  });
});

// ── Wave 2: web sources recorded from tool events ───────────
// The SDK carries a WebSearch / WebFetch call as a tool_use block on an
// `assistant` envelope and its outcome as a tool_result block on a `user`
// envelope, with the tool's structured output attached as `tool_use_result`
// (sdk.d.ts SDKAssistantMessage / SDKUserMessage; sdk-tools.d.ts
// WebSearchOutput / WebFetchOutput). Until Wave 2 the loop dropped both, so a
// web-grounded run left no record of what it read.

const WEB_TOOLS = [{ type: 'web_search_20250305', name: 'web_search' }];
const PAGE_TEXT = 'Article 16 — Business-wide risk assessment. Obliged entities shall take appropriate steps to identify and assess the risks of money laundering and terrorist financing to which they are exposed.';
const EUR_LEX = 'https://eur-lex.europa.eu/eli/reg/2024/1624/oj';
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** SDKAssistantMessage with one tool_use block (the SDK's shape, minus fields the engine never reads). */
const assistantToolUse = (id: string, name: string, input: Record<string, unknown>) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
});
/** SDKUserMessage carrying the matching tool_result; `envelope` adds tool_use_result / timestamp. */
const userToolResult = (toolUseId: string, content: string, envelope: Record<string, unknown> = {}, isError = false) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content, ...(isError ? { is_error: true } : {}) }] },
  ...envelope,
});
/** WebSearchOutput: results mix the tool's commentary strings with hit lists. */
const searchOutput = (query: string, hits: Array<{ url: string; title: string }>) => ({
  query, results: ['Commentary the tool wrote', { tool_use_id: 'srvtoolu_1', content: hits }], durationSeconds: 1.2, searchCount: 1,
});
/** WebFetchOutput: `result` is the processed text, not the raw page. */
const fetchOutput = (url: string, result: string, code = 200) => ({
  bytes: 48_000, code, codeText: code === 200 ? 'OK' : 'Not Found', result, durationMs: 800, url,
});
const sourcesIn = (events: Record<string, unknown>[]) =>
  events.filter((e) => e.type === 'source_fetched').map((e) => e.source as WebSourceRecord);

describe('Wave 2 — web sources recorded from tool events', () => {
  it('a WebFetch call and its result become a source_fetched event with sha256 + length — never the page', async () => {
    fakeSdk([
      textDelta('Reading the regulation. '),
      assistantToolUse('toolu_fetch', 'WebFetch', { url: EUR_LEX, prompt: 'Extract Article 16' }),
      userToolResult('toolu_fetch', PAGE_TEXT, { tool_use_result: fetchOutput(EUR_LEX, PAGE_TEXT), timestamp: '2026-09-16T10:00:00.000Z' }),
      textDelta('Article 16 requires a business-wide risk assessment.'),
      successResult(),
    ]);
    const { sink, events, done } = collectingSink();
    let completion: SdkCompletionData | null = null;
    await streamToResponse({ ...BASE_CONFIG, tools: WEB_TOOLS }, sink, (d) => { completion = d; });

    // The existing contract is untouched: stream_start first, stream_end last,
    // and the record lands between the deltas in the order the tool ran.
    const types = events().map((e) => e.type);
    expect(types[0]).toBe('stream_start');
    expect(types[types.length - 1]).toBe('stream_end');
    expect(done()).toBe(true);
    expect(types.indexOf('source_fetched')).toBeGreaterThan(types.indexOf('text_delta'));
    expect(types.indexOf('source_fetched')).toBeLessThan(types.lastIndexOf('text_delta'));

    const sources = sourcesIn(events());
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({
      kind: 'web_fetch',
      url: EUR_LEX,
      sha256: sha256(PAGE_TEXT),
      charCount: PAGE_TEXT.length,
      retrievedAt: '2026-09-16T10:00:00.000Z',
    });
    expect(JSON.stringify(sources[0])).not.toContain('Obliged entities');

    expect(completion).not.toBeNull();
    expect(completion!.webSources).toEqual(sources);
    expect(completion!.text).toBe('Reading the regulation. Article 16 requires a business-wide risk assessment.');
  });

  it('a WebSearch records the query and the hits the tool returned (capped), and a later fetch of a hit carries its title', async () => {
    const hits = Array.from({ length: WEB_SOURCE_RESULT_CAP + 5 }, (_, i) => ({ url: `https://example.org/hit-${i}`, title: `Hit ${i}` }));
    const query = 'AMLR Article 16 business-wide risk assessment';
    fakeSdk([
      assistantToolUse('toolu_search', 'WebSearch', { query }),
      userToolResult('toolu_search', 'Web search results for query: …', { tool_use_result: searchOutput(query, hits) }),
      assistantToolUse('toolu_fetch', 'WebFetch', { url: 'https://example.org/hit-3', prompt: 'Read it' }),
      userToolResult('toolu_fetch', 'The text of hit 3.', { tool_use_result: fetchOutput('https://example.org/hit-3', 'The text of hit 3.') }),
      textDelta('Answer.'),
      successResult(),
    ]);
    const { sink, events } = collectingSink();
    let completion: SdkCompletionData | null = null;
    await streamToResponse({ ...BASE_CONFIG, tools: WEB_TOOLS }, sink, (d) => { completion = d; });

    const sources = sourcesIn(events());
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ kind: 'web_search', query });
    expect(sources[0].resultUrls).toHaveLength(WEB_SOURCE_RESULT_CAP);
    expect(sources[0].resultUrls![0]).toBe('https://example.org/hit-0');
    expect(sources[0].results![3]).toEqual({ url: 'https://example.org/hit-3', title: 'Hit 3' });
    expect(sources[0]).not.toHaveProperty('sha256');
    expect(typeof sources[0].retrievedAt).toBe('string');
    expect(sources[1]).toMatchObject({
      kind: 'web_fetch', url: 'https://example.org/hit-3', title: 'Hit 3',
      sha256: sha256('The text of hit 3.'), charCount: 'The text of hit 3.'.length,
    });
    expect(completion!.webSources).toEqual(sources);
  });

  it('a failed fetch is recorded as an error with no hash; a search without structured output falls back to the URLs the model read', async () => {
    fakeSdk([
      assistantToolUse('toolu_bad', 'WebFetch', { url: 'https://example.org/gone', prompt: 'x' }),
      userToolResult('toolu_bad', 'Error: 404 Not Found', { tool_use_result: fetchOutput('https://example.org/gone', '', 404) }, true),
      assistantToolUse('toolu_s', 'WebSearch', { query: 'dora article 5' }),
      userToolResult('toolu_s', 'Links: [{"title":"DORA","url":"https://eur-lex.europa.eu/eli/reg/2022/2554/oj"}]\n\nSummary text.'),
      textDelta('Answer.'),
      successResult(),
    ]);
    const { sink, events } = collectingSink();
    await streamToResponse({ ...BASE_CONFIG, tools: WEB_TOOLS }, sink);
    const sources = sourcesIn(events());
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual({ kind: 'web_fetch', url: 'https://example.org/gone', retrievedAt: expect.any(String), isError: true });
    expect(sources[1]).toMatchObject({
      kind: 'web_search', query: 'dora article 5',
      resultUrls: ['https://eur-lex.europa.eu/eli/reg/2022/2554/oj'],
      results: [{ url: 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj', title: '' }],
    });
  });

  it('ignores non-web tool calls, text-only envelopes and results with no matching call — a run without web work reports no sources', async () => {
    fakeSdk([
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'thinking aloud' }] } },
      assistantToolUse('toolu_mcp', 'mcp__anton__search_knowledge', { query: 'x' }),
      userToolResult('toolu_mcp', 'pack text'),
      userToolResult('toolu_unknown', 'a result with no call'),
      textDelta('Answer.'),
      successResult(),
    ]);
    const { sink, events } = collectingSink();
    let completion: SdkCompletionData | null = null;
    await streamToResponse(BASE_CONFIG, sink, (d) => { completion = d; });
    expect(events().some((e) => e.type === 'source_fetched')).toBe(false);
    expect(completion!.webSources).toEqual([]);
  });
});

// ── Wave 4: the slot is the subprocess's, not the request's ──
// Live finding 2026-09-16: onComplete ran INSIDE the slot. The learning
// pipeline it starts asks for a background slot (capped at 1 of 2) while the
// interactive slot that spawned it was still counted — refused "SDK engine
// busy" on every run, so nothing was ever learned. The slot must be back
// before onComplete is invoked, released exactly once, and released on every
// failure path too.

describe('Wave 4 — the slot is released before onComplete runs', () => {
  it('activeSdkRuns is already back to its previous value when onComplete is invoked', async () => {
    fakeSdk([textDelta('Hello'), successResult()]);
    const { sink } = collectingSink();
    const before = activeSdkRunsForTests();
    let seenInsideOnComplete: number | null = null;
    await streamToResponse(BASE_CONFIG, sink, () => { seenInsideOnComplete = activeSdkRunsForTests(); });
    expect(seenInsideOnComplete).toBe(before);
    expect(activeSdkRunsForTests()).toBe(before);
  });

  it('a background slot can be taken from inside onComplete — the exact request the learning pipeline makes', async () => {
    fakeSdk([textDelta('Hello'), successResult()]);
    const { sink } = collectingSink();
    const before = activeSdkRunsForTests();
    let refusal: string | null | undefined;
    await streamToResponse(BASE_CONFIG, sink, () => {
      refusal = tryAcquireSdkSlot(true);   // background: capped at MAX_BACKGROUND_SDK_RUNS = 1
      if (refusal === null) releaseSdkSlot();
    });
    expect(refusal).toBeNull();
    expect(activeSdkRunsForTests()).toBe(before);
  });

  it('negative control: with the interactive slot still held, the same background acquire is refused', () => {
    const before = activeSdkRunsForTests();
    expect(tryAcquireSdkSlot(false)).toBeNull();          // an interactive run holding its slot
    try {
      expect(tryAcquireSdkSlot(true)).toMatch(/SDK engine busy/);
    } finally {
      releaseSdkSlot();
    }
    expect(activeSdkRunsForTests()).toBe(before);
  });

  it('an error thrown inside onComplete still leaves the count correct (no double release)', async () => {
    fakeSdk([textDelta('Hello'), successResult()]);
    const { sink, done } = collectingSink();
    const before = activeSdkRunsForTests();
    await expect(streamToResponse(BASE_CONFIG, sink, () => { throw new Error('ledger write failed'); })).resolves.toBeUndefined();
    expect(activeSdkRunsForTests()).toBe(before);
    expect(done()).toBe(true);
  });

  it('a throwing SDK releases the slot exactly once', async () => {
    setSdkQueryImplForTests(() => {
      // eslint-disable-next-line require-yield
      return (async function* (): AsyncGenerator<{ type: string }> {
        throw new Error('spawn ENOENT');
      })();
    });
    const { sink } = collectingSink();
    const before = activeSdkRunsForTests();
    await streamToResponse(BASE_CONFIG, sink, () => { throw new Error('must not be called'); });
    expect(activeSdkRunsForTests()).toBe(before);
  });

  it('a refused run (engine busy) never touches the count', async () => {
    const before = activeSdkRunsForTests();
    expect(tryAcquireSdkSlot(false)).toBeNull();
    expect(tryAcquireSdkSlot(false)).toBeNull();          // both interactive slots taken
    try {
      const calls = fakeSdk([successResult()]);
      const { sink, events } = collectingSink();
      await streamToResponse(BASE_CONFIG, sink, () => { throw new Error('must not be called'); });
      expect(calls).toHaveLength(0);
      expect((events().find((e) => e.type === 'error') as { message: string }).message).toMatch(/SDK engine busy/);
      expect(activeSdkRunsForTests()).toBe(before + 2);
    } finally {
      releaseSdkSlot();
      releaseSdkSlot();
    }
    expect(activeSdkRunsForTests()).toBe(before);
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
    // investigate reaches the xhigh rung on models that have it; the SDK
    // documents a fallback to high elsewhere, but ANTON clamps first.
    expect(sdkThinkingOptions('investigate', 'claude-fable-5').effort).toBe('xhigh');
    expect(sdkThinkingOptions('investigate', 'claude-fable-5-1').effort).toBe('xhigh');
    expect(sdkThinkingOptions('investigate', 'claude-sonnet-4-6').effort).toBe('max');
    expect(sdkThinkingOptions('deep_investigate', 'claude-opus-5').effort).toBe('max');
    expect(sdkThinkingOptions('think', 'claude-fable-5-1')).toEqual({ thinking: { type: 'adaptive' }, effort: 'medium' });
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

// ── Wave 3: a schema-constrained turn ───────────────────────

describe('completeText — outputFormat (schema-constrained turn)', () => {
  const SCHEMA = { type: 'object', properties: { answer: { type: 'number' } }, required: ['answer'] };

  it('forwards outputFormat untouched, keeps containment, and returns structuredOutput even with no text', async () => {
    const calls = fakeSdk([successResult({ result: '', structured_output: { answer: 42 } })]);
    const data = await completeText({ ...BASE_CONFIG, outputFormat: { type: 'json_schema', schema: SCHEMA } });
    expect(calls[0].options.outputFormat).toEqual({ type: 'json_schema', schema: SCHEMA });
    expect(calls[0].options.tools).toEqual([]);
    expect(calls[0].options.maxTurns).toBe(1);
    expect(calls[0].options.permissionMode).toBe('dontAsk');
    expect(data.structuredOutput).toEqual({ answer: 42 });
    expect(data.text).toBe('');
    expect(data.inputTokens).toBe(100);
  });

  it('a text run carries no outputFormat and structuredOutput stays absent', async () => {
    const calls = fakeSdk([textDelta('hi'), successResult()]);
    const data = await completeText(BASE_CONFIG);
    expect('outputFormat' in calls[0].options).toBe(false);
    expect(data.structuredOutput).toBeUndefined();
    expect(data.text).toBe('hi');
  });
});
