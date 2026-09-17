/**
 * structured-extractor-metering.test.ts — the extraction pipeline is metered
 * and, on the subscription engine, schema-constrained (Wave 3, 2026-09-16).
 *
 * What these protect, in order:
 *   1. SDK PATH — an `sdk:` utility model runs ONE schema-constrained turn:
 *      the SDK receives `outputFormat: { type: 'json_schema' }`, the
 *      containment set is untouched (tools [], maxTurns 1), and the
 *      structured_output object is consumed without any regex.
 *   2. ABORT — a timeout aborts the engine call (the AbortController handed
 *      to the SDK fires) and the background slot is released. Before, the
 *      Promise.race gave up while the subprocess kept the slot.
 *   3. METERING — every failure branch (transport, timeout, engine error,
 *      no JSON, malformed JSON, schema validation) persists its message in
 *      sessions.structured_error, bumps structured_attempts, and records a
 *      parse-telemetry outcome under 'structured-extractor'.
 *   4. NO CACHED FAILURES — a failed extraction is not remembered in the
 *      process cache, so a retry retries.
 *
 * The SDK boundary is injected (setSdkQueryImplForTests) and callChat is
 * mocked: no subprocess, no network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

const state = vi.hoisted(() => ({
  model: 'sdk:claude-sonnet-5',
  callChat: vi.fn(async (_opts: Record<string, unknown>) => ({ text: '', thinking: '', inputTokens: 1, outputTokens: 1 })),
  telemetry: [] as Array<{ service: string; model: string; ok: boolean; error?: string }>,
}));

vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => state.model,
}));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: Record<string, unknown>) => state.callChat(opts),
}));
vi.mock('../../server/services/parse-telemetry.js', () => ({
  recordParseOutcome: async (_db: unknown, service: string, model: string, ok: boolean, error?: string) => {
    state.telemetry.push({ service, model, ok, error });
  },
}));

import { createStructuredExtractor, EXTRACTOR_TELEMETRY_SERVICE, type ExtractionInput } from '../../server/services/structured-extractor.js';
import { setSdkQueryImplForTests, activeSdkRunsForTests } from '../../server/services/claude-sdk-client.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';

// ── Fixtures ────────────────────────────────────────────────

const MARKDOWN = `# Risk register\n\n| ID | Risk | L | I |\n|---|---|---|---|\n| R-001 | Fraud through a payments vendor | 3 | 4 |\n| R-002 | Sanctions exposure via a nominee | 2 | 5 |\n\nBoth risks are within appetite after controls.`;

const VALID_BODY = {
  title: 'Risk register',
  items: [
    { id: 'R-001', risk: 'Fraud through a payments vendor', likelihood: 3, impact: 4 },
    { id: 'R-002', risk: 'Sanctions exposure via a nominee', likelihood: 2, impact: 5 },
  ],
};

const INPUT: ExtractionInput = {
  markdown: MARKDOWN,
  contentType: 'risk_register',
  moduleId: 'atlas-threat-cataloguer',
  areaId: 'risk',
  generationModel: 'sdk:claude-opus-5',
  userId: 'alice',
};

function fakeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async () => undefined),
    all: vi.fn(async () => []),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

/** The one UPDATE sessions row the extractor writes, decoded by column. */
function sessionUpdate(runs: Array<{ sql: string; params: unknown[] }>) {
  const updates = runs.filter((r) => /UPDATE sessions/.test(r.sql));
  expect(updates).toHaveLength(1);
  const [serialised, contentType, status, hash, error, attemptDelta, sessionId] = updates[0].params;
  expect(updates[0].sql).toMatch(/structured_error = \?/);
  expect(updates[0].sql).toMatch(/structured_attempts = structured_attempts \+ \?/);
  return { serialised, contentType, status, hash, error, attemptDelta, sessionId };
}

type Captured = { prompt: string; options: Record<string, unknown> };

function fakeSdk(messages: object[]) {
  const calls: Captured[] = [];
  setSdkQueryImplForTests((params) => {
    calls.push(params as Captured);
    return (async function* () {
      for (const m of messages) yield m as { type: string };
    })();
  });
  return calls;
}

/** An engine that answers only when aborted — a hung subprocess. */
function hangingSdk() {
  const calls: Captured[] = [];
  setSdkQueryImplForTests((params) => {
    calls.push(params as Captured);
    const ac = (params.options as { abortController: AbortController }).abortController;
    return (async function* () {
      await new Promise<void>((resolve) => {
        if (ac.signal.aborted) resolve();
        else ac.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new Error('Request was aborted');
    })();
  });
  return calls;
}

const successResult = (structured: unknown) => ({
  type: 'result',
  subtype: 'success',
  result: '',
  usage: { input_tokens: 120, output_tokens: 40 },
  structured_output: structured,
});

const fenced = (obj: unknown) => `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;

beforeEach(() => {
  resetSdkEngineStoreForTests();
  process.env.SDK_ENGINE_ENABLED = 'true';
  state.model = 'sdk:claude-sonnet-5';
  state.telemetry.length = 0;
  state.callChat.mockReset();
});

afterEach(() => {
  setSdkQueryImplForTests(null);
  delete process.env.SDK_ENGINE_ENABLED;
  resetSdkEngineStoreForTests();
});

// ── 1. The SDK path ────────────────────────────────────────

describe('sdk: utility model — one schema-constrained turn', () => {
  it('passes outputFormat json_schema to the SDK, keeps containment, and consumes structured_output', async () => {
    const calls = fakeSdk([successResult(VALID_BODY)]);
    const { db, runs } = fakeDb();
    const extractor = createStructuredExtractor(db);

    const result = await extractor.extractAndStore('sess-1', INPUT);

    expect(result.status).toBe('extracted');
    expect(result.method).toBe('sdk_schema');
    expect(result.model).toBe('sdk:claude-sonnet-5');
    expect(result.payload?.body).toEqual(VALID_BODY);
    expect(result.payload?.content_type).toBe('risk_register');
    expect(result.tokens_used).toBe(160);

    expect(calls).toHaveLength(1);
    const opts = calls[0].options;
    const outputFormat = opts.outputFormat as { type: string; schema: Record<string, unknown> };
    expect(outputFormat.type).toBe('json_schema');
    expect(outputFormat.schema.type).toBe('object');
    expect(outputFormat.schema.required).toEqual(['title', 'items']);
    expect('$schema' in outputFormat.schema).toBe(false);
    expect('$id' in outputFormat.schema).toBe(false);
    // Containment unchanged: text engine, no tools, one turn.
    expect(opts.tools).toEqual([]);
    expect(opts.maxTurns).toBe(1);
    expect(opts.permissionMode).toBe('dontAsk');
    expect(opts.model).toBe('claude-sonnet-5');
    // The prompt asks for structured output, not a fenced block.
    expect(String(opts.systemPrompt)).toMatch(/structured output/);
    expect(String(opts.systemPrompt)).not.toMatch(/fenced JSON block/);

    // No regex path was taken.
    expect(state.callChat).not.toHaveBeenCalled();

    // Metered: a live attempt, no error.
    const row = sessionUpdate(runs);
    expect(row.status).toBe('extracted');
    expect(row.contentType).toBe('risk_register');
    expect(row.error).toBeNull();
    expect(row.attemptDelta).toBe(1);
    expect(row.sessionId).toBe('sess-1');
    expect(state.telemetry).toEqual([{ service: EXTRACTOR_TELEMETRY_SERVICE, model: 'sdk:claude-sonnet-5', ok: true, error: undefined }]);
  });

  it('a timeout aborts the engine call, releases the slot, and is persisted with the attempt', async () => {
    const calls = hangingSdk();
    const { db, runs } = fakeDb();
    const extractor = createStructuredExtractor(db, { timeoutMs: 60 });

    const result = await extractor.extractAndStore('sess-2', INPUT);

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/timed out after 60ms/);
    expect(result.method).toBe('sdk_schema');
    const ac = calls[0].options.abortController as AbortController;
    expect(ac.signal.aborted).toBe(true);
    // The subprocess iterator threw on abort → streamToResponse's finally ran.
    await new Promise((r) => setTimeout(r, 20));
    expect(activeSdkRunsForTests()).toBe(0);

    const row = sessionUpdate(runs);
    expect(row.status).toBe('failed');
    expect(row.serialised).toBeNull();
    expect(row.error).toMatch(/timed out after 60ms/);
    expect(row.attemptDelta).toBe(1);
    expect(state.telemetry).toEqual([
      { service: EXTRACTOR_TELEMETRY_SERVICE, model: 'sdk:claude-sonnet-5', ok: false, error: expect.stringMatching(/timed out/) },
    ]);
  });

  it('an engine-side failure carries the engine message into the session and telemetry', async () => {
    fakeSdk([{ type: 'result', subtype: 'error_during_execution', errors: ['not signed in'] }]);
    const { db, runs } = fakeDb();
    const extractor = createStructuredExtractor(db);

    const result = await extractor.extractAndStore('sess-3', INPUT);

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/error_during_execution/);
    expect(result.error).toMatch(/not signed in/);
    const row = sessionUpdate(runs);
    expect(row.status).toBe('failed');
    expect(row.error).toMatch(/not signed in/);
    expect(row.attemptDelta).toBe(1);
    expect(state.telemetry[0]).toMatchObject({ ok: false, error: expect.stringMatching(/not signed in/) });
  });

  it('a schema-valid object that still misses a required key is a recorded validation failure', async () => {
    // The SDK contract says the object is validated, but the extractor's own
    // gate stays — a regression on either side shows up as a named error.
    fakeSdk([successResult({ title: 'no items' })]);
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-4', INPUT);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Schema validation failed: \$\.items: required/);
    expect(sessionUpdate(runs).error).toMatch(/\$\.items: required/);
    expect(state.telemetry[0]).toMatchObject({ ok: false, error: expect.stringMatching(/items: required/) });
  });
});

// ── 2. The prompt + regex path (API / local providers) ─────

describe('API utility model — prompt + regex, every failure named', () => {
  beforeEach(() => { state.model = 'claude-haiku-4-5-20251001'; });

  it('extracts a fenced JSON block through callChat and meters the success', async () => {
    state.callChat.mockResolvedValueOnce({ text: `Here you go:\n${fenced(VALID_BODY)}`, thinking: '', inputTokens: 10, outputTokens: 5 });
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-5', INPUT);
    expect(result.status).toBe('extracted');
    expect(result.method).toBe('prompt_regex');
    expect(result.payload?.body).toEqual(VALID_BODY);
    const opts = state.callChat.mock.calls[0][0];
    expect(opts.model).toBe('claude-haiku-4-5-20251001');
    expect(opts.jsonMode).toBe(true);
    expect(opts.background).toBe(true);
    expect(String(opts.system)).toMatch(/fenced JSON block/);
    expect(sessionUpdate(runs)).toMatchObject({ status: 'extracted', error: null, attemptDelta: 1 });
    expect(state.telemetry).toEqual([{ service: EXTRACTOR_TELEMETRY_SERVICE, model: 'claude-haiku-4-5-20251001', ok: true, error: undefined }]);
  });

  it('no JSON block → "No JSON block found" persisted, attempt counted, telemetry failed', async () => {
    state.callChat.mockResolvedValueOnce({ text: 'I could not find any risks in this document.', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-6', INPUT);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('No JSON block found in extractor output');
    expect(sessionUpdate(runs)).toMatchObject({ status: 'failed', serialised: null, error: 'No JSON block found in extractor output', attemptDelta: 1 });
    expect(state.telemetry).toEqual([{ service: EXTRACTOR_TELEMETRY_SERVICE, model: 'claude-haiku-4-5-20251001', ok: false, error: 'No JSON block found in extractor output' }]);
  });

  it('malformed JSON → "Malformed JSON: …" persisted', async () => {
    state.callChat.mockResolvedValueOnce({ text: '```json\n{ "title": "x", items: [ }\n```', thinking: '', inputTokens: 1, outputTokens: 1 });
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-7', INPUT);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/^Malformed JSON: /);
    expect(sessionUpdate(runs).error).toMatch(/^Malformed JSON: /);
    expect(state.telemetry[0]).toMatchObject({ ok: false, error: expect.stringMatching(/^Malformed JSON/) });
  });

  it('schema validation failure → the missing path is persisted', async () => {
    state.callChat.mockResolvedValueOnce({ text: fenced({ title: 'x', items: [{ risk: 'no id' }] }), thinking: '', inputTokens: 1, outputTokens: 1 });
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-8', INPUT);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Schema validation failed: .*items\[0\]\.id: required/);
    expect(sessionUpdate(runs).error).toMatch(/items\[0\]\.id: required/);
    expect(state.telemetry[0]).toMatchObject({ ok: false });
  });

  it('a transport error thrown by callChat → its message persisted', async () => {
    state.callChat.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY not configured'));
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-9', INPUT);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('ANTHROPIC_API_KEY not configured');
    expect(sessionUpdate(runs)).toMatchObject({ status: 'failed', error: 'ANTHROPIC_API_KEY not configured', attemptDelta: 1 });
    expect(state.telemetry).toEqual([{ service: EXTRACTOR_TELEMETRY_SERVICE, model: 'claude-haiku-4-5-20251001', ok: false, error: 'ANTHROPIC_API_KEY not configured' }]);
  });

  it('a failure is not cached — the next call runs the engine again', async () => {
    state.callChat
      .mockResolvedValueOnce({ text: 'nothing here', thinking: '', inputTokens: 1, outputTokens: 1 })
      .mockResolvedValueOnce({ text: fenced(VALID_BODY), thinking: '', inputTokens: 1, outputTokens: 1 });
    const { db } = fakeDb();
    const extractor = createStructuredExtractor(db);
    const first = await extractor.extract(INPUT);
    const second = await extractor.extract(INPUT);
    const third = await extractor.extract(INPUT);
    expect(first.status).toBe('failed');
    expect(second.status).toBe('extracted');
    expect(second.cached).toBe(false);
    expect(third.status).toBe('extracted');
    expect(third.cached).toBe(true);
    expect(state.callChat).toHaveBeenCalledTimes(2);
  });

  it('a non-Claude small model gets one strict-mode retry; each call is one telemetry outcome', async () => {
    state.model = 'mistral-small-latest';
    state.callChat
      .mockResolvedValueOnce({ text: 'Sure! Here is a summary instead.', thinking: '', inputTokens: 1, outputTokens: 1 })
      .mockResolvedValueOnce({ text: fenced(VALID_BODY), thinking: '', inputTokens: 1, outputTokens: 1 });
    const { db, runs } = fakeDb();
    const result = await createStructuredExtractor(db).extractAndStore('sess-10', INPUT);
    expect(result.status).toBe('extracted');
    expect(state.callChat).toHaveBeenCalledTimes(2);
    const retryPrompt = (state.callChat.mock.calls[1][0].messages as Array<{ content: string }>)[0].content;
    expect(retryPrompt).toMatch(/STRICT MODE \(a previous attempt failed: No JSON block found/);
    expect(state.telemetry.map((t) => t.ok)).toEqual([false, true]);
    expect(sessionUpdate(runs)).toMatchObject({ status: 'extracted', error: null, attemptDelta: 1 });
  });
});
