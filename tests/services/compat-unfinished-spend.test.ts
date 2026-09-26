/**
 * compat-unfinished-spend.test.ts — a compat call's spend is recorded however
 * the call ends (review C1/C9, 2026-09-25), against a local fake
 * OpenAI-compatible server (no paid API is called).
 *
 * Before: the ledger row was written only when a streamed reply was read to
 * its last chunk. Closing the page, pressing Stop, a timeout, an `error` chunk
 * or finish_reason 'error' wrote nothing — while the provider still billed
 * the prompt and every token generated — so every daily cap could be passed
 * by closing the connection. Now the worst case is reserved before the call,
 * the row is settled to an estimate (or the usage an error chunk carried) when
 * the call is cut short, and OpenRouter's own figure replaces the estimate.
 *
 * Also here: a sink that stops taking frames still ends the call (review C9),
 * the in-flight 402 retry waits when there is no Retry-After (review L7), and
 * a context-length 400 says so instead of "please try again" (review C10).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import http, { type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  compatStreamEvents,
  streamOpenAICompatible,
  callOpenAICompatible,
  compatUnfinishedUsageOf,
  compatHttpError,
  retryAfterMs,
  setCompatReconcileForTests,
  estimateCompatTextTokens,
  COMPAT_CONTEXT_TOO_LONG_MESSAGE,
  type OpenAICompatibleStreamParams,
} from '../../server/services/adapters/openaiCompatibleAdapter.js';
import { createModelAdapter } from '../../server/services/model-adapter.js';
import { publicErrorMessage } from '../../server/lib/error-response.js';

// ── A ledger in memory, answering the SQL llm-spend.ts sends ─────────────────

interface LedgerRow { id: number; userId: unknown; model: string; cost: number; input: number; output: number; source: string }

function memoryLedger() {
  const rows: LedgerRow[] = [];
  let nextId = 1;
  const db = {
    get: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('INSERT INTO llm_spend_ledger') && sql.includes('RETURNING id')) {
        const [userId, model, cost, input, output, source] = args;
        const row: LedgerRow = { id: nextId++, userId, model: String(model), cost: Number(cost), input: Number(input), output: Number(output), source: String(source) };
        rows.push(row);
        return { id: row.id };
      }
      if (sql.includes('SUM(cost_usd)')) {
        const perUser = sql.includes('user_id = ?');
        const total = rows.filter((r) => !perUser || r.userId === args[0]).reduce((s, r) => s + r.cost, 0);
        return { total };
      }
      return undefined;
    }),
    run: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith('INSERT INTO llm_spend_ledger') || sql.includes('INSERT INTO llm_spend_ledger')) {
        const [userId, model, cost, input, output, , source] = args;
        rows.push({ id: nextId++, userId, model: String(model), cost: Number(cost), input: Number(input), output: Number(output), source: String(source) });
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (sql.includes('UPDATE llm_spend_ledger')) {
        const [cost, source, input, output, , id] = args;
        const row = rows.find((r) => r.id === id);
        if (!row) return { changes: 0, lastInsertRowid: 0 };
        row.cost = Number(cost);
        row.source = String(source);
        if (input !== null) row.input = Number(input);
        if (output !== null) row.output = Number(output);
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (sql.includes('DELETE FROM llm_spend_ledger')) {
        const i = rows.findIndex((r) => r.id === args[0] && r.source === 'reserved');
        if (i >= 0) rows.splice(i, 1);
        return { changes: i >= 0 ? 1 : 0, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }),
    all: vi.fn(async () => []),
    exec: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn(),
  } as unknown as DatabaseAdapter;
  return { db, rows };
}

// ── A fake OpenRouter: the model name picks the behaviour ────────────────────

const held: ServerResponse[] = [];
let generationLookups = 0;

function startFake(): Promise<{ server: Server; baseUrl: string }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/v1/generation')) {
      generationLookups++;
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      if (id !== 'gen-slow') { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id, total_cost: 0.0031, tokens_prompt: 900, tokens_completion: 40, native_tokens_reasoning: 12 } }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end('not found'); return; }
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString('utf8'); });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as { model?: string; stream?: boolean };
      const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      if (!body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'gen-ns', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.0001 } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      switch (body.model) {
        case 'slow':
          // Two deltas, then the connection is held open: the reader has to give up.
          send({ id: 'gen-slow', choices: [{ delta: { reasoning: 'Thinking about it. ' } }] });
          send({ id: 'gen-slow', choices: [{ delta: { content: 'The first part of the answer' } }] });
          held.push(res);
          return;
        case 'err-usage':
          send({ id: 'gen-e1', choices: [{ delta: { content: 'Half an ans' } }] });
          send({ id: 'gen-e1', error: { code: 502, message: 'Provider disconnected' }, choices: [{ delta: {}, finish_reason: 'error' }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0009 } });
          break;
        case 'err-no-usage':
          send({ id: 'gen-e2', choices: [{ delta: { content: 'Half an ans' } }] });
          send({ id: 'gen-e2', choices: [{ delta: {}, finish_reason: 'error' }] });
          break;
        default:
          send({ id: 'gen-ok', choices: [{ delta: { content: 'The answer.' } }] });
          send({ id: 'gen-ok', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0042 } });
      }
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` });
    });
  });
}

let fake: Awaited<ReturnType<typeof startFake>>;
beforeAll(async () => { fake = await startFake(); });
afterAll(async () => {
  for (const r of held) r.destroy();
  await new Promise<void>((resolve) => fake.server.close(() => resolve()));
});
afterEach(() => {
  setCompatReconcileForTests(null);
  for (const r of held.splice(0)) r.destroy();
  vi.restoreAllMocks();
});

const PRICING = { inputPerMillion: 0.165, outputPerMillion: 0.55 };

function params(model: string, db: DatabaseAdapter, extra: Partial<OpenAICompatibleStreamParams> = {}): OpenAICompatibleStreamParams {
  return {
    baseUrl: fake.baseUrl,
    apiKey: 'sk-test',
    model,
    system: 'You are a compliance analyst.',
    messages: [{ role: 'user', content: 'Assess our AML controls against the regulation in detail.' }],
    maxTokens: 1000,
    userId: 'visitor-1',
    modelMeta: { pricing: PRICING },
    spend: { modelId: `compat:or:${model}`, db, purpose: 'test' },
    ...extra,
  };
}

async function waitFor(check: () => boolean, ms = 2_000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('a streamed call cut short still writes its spend row', () => {
  it('an abort after the first delta records one estimated row, priced from the model\'s list price', async () => {
    const { db, rows } = memoryLedger();
    const ac = new AbortController();
    const events = compatStreamEvents(params('slow', db, { signal: ac.signal }));
    const first = await events.next();
    expect(first.done).toBe(false);
    // Reserved before the call went out.
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('reserved');
    const reserved = rows[0].cost;

    ac.abort();
    const err = await readToEnd(events).catch((e: unknown) => e);
    expect((err as { name?: string }).name).toBe('AbortError');

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('estimated');
    expect(rows[0].userId).toBe('visitor-1');
    expect(rows[0].cost).toBeGreaterThan(0);
    // The estimate is the prompt plus the text received — below the worst case reserved.
    expect(rows[0].cost).toBeLessThan(reserved);
    expect(rows[0].output).toBe(estimateCompatTextTokens('Thinking about it. The first part of the answer'));
    // …and it rides on the error, for the Work route's monthly token count.
    expect(compatUnfinishedUsageOf(err)).toMatchObject({ outputTokens: rows[0].output, estimated: true });
  });

  it('an error chunk that carries usage records that usage, as reported', async () => {
    const { db, rows } = memoryLedger();
    const err = await streamOpenAICompatible(params('err-usage', db), { headersSent: true, writeHead: () => undefined, write: () => true, end: () => undefined })
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('COMPAT_STREAM_ERROR');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'reported', input: 100, output: 20 });
    expect(rows[0].cost).toBeCloseTo(0.0009);
  });

  it('finish_reason error with no usage records an estimate', async () => {
    const { db, rows } = memoryLedger();
    await expect(callStream(params('err-no-usage', db))).rejects.toMatchObject({ code: 'COMPAT_STREAM_ERROR' });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('estimated');
    expect(rows[0].cost).toBeGreaterThan(0);
  });

  it('negative control: a finished reply writes exactly one row, at the reported cost', async () => {
    const { db, rows } = memoryLedger();
    const out = await callStream(params('ok', db));
    expect(out.costUsd).toBeCloseTo(0.0042);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'reported', input: 1200, output: 300 });
  });

  it('replaces the estimate with OpenRouter\'s own figure from its generation record', async () => {
    setCompatReconcileForTests({ delaysMs: [20, 20], anyHost: true });
    const { db, rows } = memoryLedger();
    const ac = new AbortController();
    const events = compatStreamEvents(params('slow', db, { signal: ac.signal }));
    await events.next();
    ac.abort();
    await readToEnd(events).catch(() => undefined);
    expect(rows[0].source).toBe('estimated');
    await waitFor(() => rows[0].source === 'reported');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cost: 0.0031, input: 900, output: 40 });
  });

  it('does not look the generation up on a host that is not OpenRouter', async () => {
    setCompatReconcileForTests({ delaysMs: [10] });
    const before = generationLookups;
    const { db, rows } = memoryLedger();
    const ac = new AbortController();
    const events = compatStreamEvents(params('slow', db, { signal: ac.signal }));
    await events.next();
    ac.abort();
    await readToEnd(events).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 60));
    expect(generationLookups).toBe(before);
    expect(rows[0].source).toBe('estimated');
  });

  it('a sink that throws still ends the call and records its spend', async () => {
    const { db, rows } = memoryLedger();
    const sinkErr = new Error('client went away');
    const err = await streamOpenAICompatible(params('slow', db), {
      headersSent: true, writeHead: () => undefined, end: () => undefined,
      write: () => { throw sinkErr; },
    }).catch((e: unknown) => e);
    expect(err).toBe(sinkErr);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('estimated');
  });

  it('a unified-client reader that stops early still ends the call and records its spend', async () => {
    const { db, rows } = memoryLedger();
    const adapter = createModelAdapter('openai_compatible', undefined, undefined, {
      baseUrl: fake.baseUrl, apiKey: 'sk-test', modelMeta: { pricing: PRICING }, modelId: 'compat:or:slow', db,
    });
    for await (const chunk of adapter.sendStreamRequest({
      model: 'compat:or:slow', systemPrompt: 's', messages: [{ role: 'user', content: 'q' }],
      thinking: 'quick', creativity: 'balanced', stream: true,
    })) {
      expect(chunk).toBeTruthy();
      break;
    }
    await waitFor(() => rows[0]?.source === 'estimated');
    expect(rows).toHaveLength(1);
  });
});

/** Read a streamed call to its end (its result, or the error it ends with). */
async function readToEnd(events: ReturnType<typeof compatStreamEvents>) {
  for (;;) {
    const n = await events.next();
    if (n.done) return n.value;
  }
}

function callStream(p: OpenAICompatibleStreamParams) {
  return readToEnd(compatStreamEvents(p));
}

describe('a refused call is not charged', () => {
  it('drops the reservation when the endpoint refuses the request', async () => {
    const { db, rows } = memoryLedger();
    const refusing = { ...params('ok', db), baseUrl: `${fake.baseUrl.replace(/\/v1$/, '')}/nope` };
    await expect(callStream(refusing)).rejects.toMatchObject({ code: 'COMPAT_HTTP_ERROR', status: 404 });
    expect(rows).toHaveLength(0);
  });

  it('a non-streamed call settles its reservation to the reported cost', async () => {
    const { db, rows } = memoryLedger();
    const out = await callOpenAICompatible(params('ok', db));
    expect(out.costUsd).toBeCloseTo(0.0001);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('reported');
  });
});

describe('in-flight 402 retry delay (review L7)', () => {
  it('waits the default two seconds when the reply names no Retry-After', () => {
    // Headers.get returns null for an absent header; Number(null) is 0.
    expect(retryAfterMs(null)).toBe(2_000);
    expect(retryAfterMs(undefined)).toBe(2_000);
    expect(retryAfterMs('')).toBe(2_000);
    expect(retryAfterMs('  ')).toBe(2_000);
  });

  it('negative control: an explicit Retry-After is still honoured (and capped)', () => {
    expect(retryAfterMs('0')).toBe(0);
    expect(retryAfterMs('3')).toBe(3_000);
    expect(retryAfterMs('60')).toBe(10_000);
    expect(retryAfterMs('soon')).toBe(2_000);
  });

  it('carries the default on the in-flight error built from a reply with no header', () => {
    const body = JSON.stringify({ error: { code: 402, metadata: { limit_source: 'openrouter_in_flight_budget' } } });
    expect(compatHttpError(402, body, 'https://openrouter.ai/api/v1', null).retryAfterMs).toBe(2_000);
  });
});

describe('a prompt larger than the model\'s window (review C10)', () => {
  it('tells the person the request is too long instead of "please try again"', () => {
    const err = compatHttpError(400, '{"error":{"message":"This endpoint\'s maximum context length is 131072 tokens. However, you requested about 140000 tokens"}}', 'https://openrouter.ai/api/v1');
    expect(err.code).toBe('COMPAT_CONTEXT_TOO_LONG');
    expect(publicErrorMessage(err)).toBe(COMPAT_CONTEXT_TOO_LONG_MESSAGE);
    // The raw reply stays in the log message, never in what the person sees.
    expect(err.message).toMatch(/maximum context length/);
  });

  it('negative control: another 400 keeps the generic message', () => {
    const err = compatHttpError(400, '{"error":"bad request"}', 'https://openrouter.ai/api/v1');
    expect(err.code).toBe('COMPAT_HTTP_ERROR');
    expect(publicErrorMessage(err)).toMatch(/could not answer \(HTTP 400\)/);
  });
});
