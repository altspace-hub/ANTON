/**
 * compat-adapter-reply.test.ts — how a compat endpoint's reply is read
 * (openaiCompatibleAdapter.ts): cost and reasoning tokens, the model's
 * reasoning, the spend ledger row, and the failures that used to pass as a
 * complete answer.
 *
 * Before 2026-09-25: usage.cost and reasoning_tokens were dropped (so nothing
 * could meter or cap OpenRouter spend), reasoning deltas were dropped, an SSE
 * `error` object after the 200 was ignored (a truncated answer looked
 * complete), finish_reason 'length' was never reported, a 402 surfaced as a
 * raw error string, and the abort signal never reached fetch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  streamOpenAICompatible,
  callOpenAICompatible,
  CompatUpstreamError,
  COMPAT_BUDGET_EXHAUSTED_MESSAGE,
  COMPAT_IN_FLIGHT_MESSAGE,
  COMPAT_TRUNCATED_WARNING,
  type OpenAICompatibleStreamParams,
} from '../../server/services/adapters/openaiCompatibleAdapter.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function sse(chunks: unknown[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
}

function streamResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream', ...headers } });
}

function sink() {
  const frames: Array<{ type: string; content?: string }> = [];
  return {
    frames,
    res: {
      headersSent: true,
      writeHead: () => undefined,
      end: () => undefined,
      write: (chunk: string) => {
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) frames.push(JSON.parse(line.slice(6)));
        }
        return true;
      },
    },
  };
}

function ledgerDb() {
  const rows: unknown[][] = [];
  const db = {
    run: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('llm_spend_ledger')) rows.push(args);
      return { changes: 1 };
    }),
    get: vi.fn(), all: vi.fn(), exec: vi.fn(), close: vi.fn(), transaction: vi.fn(),
  } as unknown as DatabaseAdapter;
  return { db, rows };
}

const base: OpenAICompatibleStreamParams = {
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'z-ai/glm-5.3-flash',
  system: 'sys',
  messages: [{ role: 'user', content: 'q' }],
  userId: 'u-1',
};

describe('streamed reply', () => {
  it('forwards reasoning as thinking_delta, reads usage.cost and reasoning tokens, and writes the ledger row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(sse([
      { choices: [{ delta: { reasoning: 'Let me think. ' } }] },
      { choices: [{ delta: { content: 'The ' } }] },
      { choices: [{ delta: { content: 'answer.' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 40, cost: 0.0123, completion_tokens_details: { reasoning_tokens: 25 } } },
    ]))));
    const { db, rows } = ledgerDb();
    const s = sink();
    const out = await streamOpenAICompatible({ ...base, spend: { modelId: 'compat:openrouter:z-ai/glm-5.3-flash', db, purpose: 'test' } }, s.res);

    expect(out.text).toBe('The answer.');
    expect(out.thinking).toBe('Let me think. ');
    expect(out.inputTokens).toBe(100);
    expect(out.outputTokens).toBe(40);
    expect(out.reasoningTokens).toBe(25);
    expect(out.costUsd).toBeCloseTo(0.0123);
    expect(out.costSource).toBe('reported');
    expect(s.frames.filter((f) => f.type === 'thinking_delta').map((f) => f.content).join('')).toBe('Let me think. ');
    expect(s.frames.filter((f) => f.type === 'text_delta').map((f) => f.content).join('')).toBe('The answer.');
    // Only the two frame types streamChat callers parse.
    expect(new Set(s.frames.map((f) => f.type))).toEqual(new Set(['thinking_delta', 'text_delta']));

    expect(rows).toHaveLength(1);
    const [userId, model, cost, inTok, outTok, reasoningTok, source, purpose] = rows[0];
    expect(userId).toBe('u-1');
    expect(model).toBe('compat:openrouter:z-ai/glm-5.3-flash');
    expect(cost).toBeCloseTo(0.0123);
    expect([inTok, outTok, reasoningTok]).toEqual([100, 40, 25]);
    expect(source).toBe('reported');
    expect(purpose).toBe('test');
  });

  it('prices a call from the endpoint prices when the reply reports no cost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(sse([
      { choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1_000_000, completion_tokens: 2_000_000 } },
    ]))));
    const { db, rows } = ledgerDb();
    const out = await streamOpenAICompatible({
      ...base,
      pricing: { inputPerMillion: 0.15, outputPerMillion: 0.5 },
      spend: { modelId: 'compat:x:y', db },
    }, sink().res);
    expect(out.costUsd).toBeCloseTo(1.15);
    expect(out.costSource).toBe('endpoint_price');
    expect(rows).toHaveLength(1);
  });

  it('writes no ledger row when neither a cost nor prices are known', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(sse([
      { choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5 } },
    ]))));
    const { db, rows } = ledgerDb();
    const out = await streamOpenAICompatible({ ...base, spend: { modelId: 'compat:x:y', db } }, sink().res);
    expect(out.costUsd).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('raises an SSE error object after the 200 instead of returning a cut-short answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(sse([
      { choices: [{ delta: { content: 'Half an ans' } }] },
      { error: { code: 502, message: 'Provider disconnected' }, choices: [{ delta: {}, finish_reason: 'error' }] },
    ]))));
    await expect(streamOpenAICompatible(base, sink().res)).rejects.toThrow(/error part-way through the answer: Provider disconnected/);
  });

  it('reports a cut-off answer (finish_reason length) as a warning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(sse([
      { choices: [{ delta: { content: 'Section 1 … Section 7' } }] },
      { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    ]))));
    const out = await streamOpenAICompatible(base, sink().res);
    expect(out.finishReason).toBe('length');
    expect(out.warning).toBe(COMPAT_TRUNCATED_WARNING);
  });

  it('fails a reply that spent the whole allowance reasoning and wrote nothing — after recording its cost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(sse([
      { choices: [{ delta: { reasoning: 'thinking thinking' } }] },
      { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 512, cost: 0.001 } },
    ]))));
    const { db, rows } = ledgerDb();
    await expect(streamOpenAICompatible({ ...base, spend: { modelId: 'compat:x:y', db } }, sink().res))
      .rejects.toMatchObject({ code: 'COMPAT_OUTPUT_LIMIT' });
    expect(rows).toHaveLength(1);
  });

  it('retries once with a plain body when a strict server rejects an optional field', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"Unrecognized request argument supplied: stream_options"}', { status: 400 }))
      .mockResolvedValueOnce(streamResponse(sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }])));
    vi.stubGlobal('fetch', fetchMock);
    const out = await streamOpenAICompatible({
      ...base,
      thinkingLevel: 'quick',
      modelMeta: { reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'] } },
      extraBody: { provider: { only: ['nextbit'] } },
    }, sink().res);
    expect(out.text).toBe('ok');
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0]).toMatchObject({ stream_options: { include_usage: true }, reasoning: { effort: 'low' } });
    expect(bodies[0].user).toBeTruthy();
    expect(bodies[1].stream_options).toBeUndefined();
    expect(bodies[1].reasoning).toBeUndefined();
    expect(bodies[1].user).toBeUndefined();
    // The admin's extra body is kept on the plain retry.
    expect(bodies[1].provider).toEqual({ only: ['nextbit'] });
  });

  it('does not retry an unrelated 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"context length exceeded"}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(streamOpenAICompatible(base, sink().res)).rejects.toThrow(/400 — .*context length exceeded/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = vi.fn(async () => streamResponse(sse([{ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }])));
    vi.stubGlobal('fetch', fetchMock);
    const ac = new AbortController();
    await streamOpenAICompatible({ ...base, signal: ac.signal }, sink().res);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBe(ac.signal);
  });
});

describe('402 from OpenRouter', () => {
  it('says the demo budget is used up when the key limit is reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 402, message: 'Key limit exceeded', metadata: { limit_source: 'openrouter_key_limit' } },
    }), { status: 402 })));
    const err = await streamOpenAICompatible(base, sink().res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CompatUpstreamError);
    expect((err as CompatUpstreamError).message).toBe(COMPAT_BUDGET_EXHAUSTED_MESSAGE);
    expect((err as CompatUpstreamError).code).toBe('COMPAT_BUDGET_EXHAUSTED');
  });

  it('retries once after Retry-After on the in-flight budget, then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 402, message: 'In-flight budget', metadata: { limit_source: 'openrouter_in_flight_budget' } },
      }), { status: 402, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(streamResponse(sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }])));
    vi.stubGlobal('fetch', fetchMock);
    const out = await streamOpenAICompatible(base, sink().res);
    expect(out.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('distinguishes a second in-flight refusal from a used-up budget', async () => {
    const inFlight = () => new Response(JSON.stringify({
      error: { code: 402, metadata: { limit_source: 'openrouter_in_flight_budget' } },
    }), { status: 402, headers: { 'Retry-After': '0' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(inFlight()).mockResolvedValueOnce(inFlight()));
    const err = await streamOpenAICompatible(base, sink().res).catch((e: unknown) => e);
    expect((err as CompatUpstreamError).message).toBe(COMPAT_IN_FLIGHT_MESSAGE);
  });
});

describe('non-streamed reply', () => {
  it('reads usage.cost, reasoning tokens and the model\'s reasoning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}', reasoning: 'short thought' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7, completion_tokens: 9, cost: 0.0004, completion_tokens_details: { reasoning_tokens: 3 } },
    }), { status: 200 })));
    const { db, rows } = ledgerDb();
    const out = await callOpenAICompatible({ ...base, spend: { modelId: 'compat:x:y', db } });
    expect(out.text).toBe('{"ok":true}');
    expect(out.thinking).toBe('short thought');
    expect(out.costUsd).toBeCloseTo(0.0004);
    expect(out.reasoningTokens).toBe(3);
    expect(rows).toHaveLength(1);
  });

  it('raises an error object in a 200 reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'upstream failed' } }), { status: 200 })));
    await expect(callOpenAICompatible(base)).rejects.toThrow(/upstream failed/);
  });
});
