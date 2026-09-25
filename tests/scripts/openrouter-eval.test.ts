/**
 * openrouter-eval.test.ts — the showcase model test run (scripts/eval/openrouter-eval.ts).
 *
 * No paid API: every run goes to a fake OpenAI-compatible server started here
 * (the shape of tests/routes/work-run-non-claude-stream.db.test.ts), and the judge
 * is either injected or a mocked router. Each behaviour has a negative control:
 * the default-routing candidates carry no provider pin, an English case gets no
 * language layer, a generous budget runs every call, a 402 is not retried.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http, { type Server, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const routerCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  return {
    ...actual,
    callChat: vi.fn(async (config: Record<string, unknown>) => {
      routerCalls.push(config);
      return { text: '{"scores":[{"criterion":"x","score":4}],"overall":4}', thinking: '', inputTokens: 1, outputTokens: 1 };
    }),
  };
});

import {
  CANDIDATES,
  CASES,
  EU_ZDR_PROVIDER,
  DEFAULT_JUDGE_MODEL,
  buildJudgePrompt,
  buildRequestBody,
  nearestEffort,
  parseArgs,
  parseJudgeReply,
  prepareCase,
  resolveReasoning,
  routerJudge,
  runEval,
  type Candidate,
  type EvalOptions,
  type EvalRecord,
  type JudgeFn,
  type PreparedCase,
} from '../../scripts/eval/openrouter-eval';
import { buildOutputInstruction } from '../../src/lib/output-format-definitions';

const FIXED_NOW = new Date(2026, 8, 25, 10, 30, 0);
const KEY = 'test-key-not-real';

const byKey = (k: string): Candidate => {
  const c = CANDIDATES.find((x) => x.key === k);
  if (!c) throw new Error(`no candidate ${k}`);
  return c;
};

// ── Fake OpenRouter ─────────────────────────────────────────

interface Reply { status: number; headers?: Record<string, string>; lines?: string[]; json?: unknown }
type Scenario = (model: string) => Reply;

const sse = (...chunks: unknown[]): string[] => [
  ': OPENROUTER PROCESSING\n\n',
  ...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`),
  'data: [DONE]\n\n',
];

const okStream = (model: string, cost: number, text = 'The answer is here.'): string[] => sse(
  { id: 'gen-1', provider: 'Inceptron', model, choices: [{ delta: { role: 'assistant', content: '', reasoning: 'Thinking it over.' } }] },
  { id: 'gen-1', provider: 'Inceptron', model, choices: [{ delta: { content: text.slice(0, 4) } }] },
  { id: 'gen-1', provider: 'Inceptron', model, choices: [{ delta: { content: text.slice(4) } }] },
  { id: 'gen-1', provider: 'Inceptron', model, choices: [{ delta: {}, finish_reason: 'stop', native_finish_reason: 'stop' }] },
  {
    id: 'gen-1', provider: 'Inceptron', model, choices: [],
    usage: { prompt_tokens: 3000, completion_tokens: 400, completion_tokens_details: { reasoning_tokens: 120 }, prompt_tokens_details: { cached_tokens: 0 }, cost },
  },
);

interface Fake {
  server: Server;
  baseUrl: string;
  requests: Array<{ body: Record<string, unknown>; headers: IncomingHttpHeaders }>;
  scenario: Scenario;
}

function startFake(): Promise<Fake> {
  const fake: Fake = { server: undefined as unknown as Server, baseUrl: '', requests: [], scenario: (m) => ({ status: 200, lines: okStream(m, 0.001) }) };
  fake.server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString('utf8'); });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      fake.requests.push({ body, headers: req.headers });
      const reply = fake.scenario(String(body.model));
      if (reply.lines) {
        res.writeHead(reply.status, { 'Content-Type': 'text/event-stream', ...(reply.headers ?? {}) });
        for (const line of reply.lines) {
          // Split every event over two writes, so the reader's line buffer is exercised.
          const mid = Math.floor(line.length / 2);
          res.write(line.slice(0, mid));
          res.write(line.slice(mid));
        }
        res.end();
      } else {
        res.writeHead(reply.status, { 'Content-Type': 'application/json', ...(reply.headers ?? {}) });
        res.end(JSON.stringify(reply.json ?? {}));
      }
    });
  });
  return new Promise((resolve) => {
    fake.server.listen(0, '127.0.0.1', () => {
      const { port } = fake.server.address() as AddressInfo;
      fake.baseUrl = `http://127.0.0.1:${port}/api/v1`;
      resolve(fake);
    });
  });
}

let fake: Fake;
let outRoot: string;
const sleeps: number[] = [];

function opts(over: Partial<EvalOptions> = {}): EvalOptions {
  return {
    ...parseArgs([], {}),
    baseUrl: fake.baseUrl,
    outDir: fs.mkdtempSync(path.join(outRoot, 'run-')),
    cases: ['press-release'],
    ...over,
  };
}

async function run(o: EvalOptions, extra: { judge?: JudgeFn; apiKey?: string } = {}) {
  const lines: string[] = [];
  const outcome = await runEval(o, {
    log: (l) => lines.push(l),
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => FIXED_NOW,
    apiKey: extra.apiKey ?? KEY,
    judge: extra.judge,
  });
  return { outcome, log: lines.join('\n') };
}

beforeAll(async () => {
  fake = await startFake();
  outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openrouter-eval-test-'));
});

afterAll(async () => {
  await new Promise<void>((r) => fake.server.close(() => r()));
  fs.rmSync(outRoot, { recursive: true, force: true });
});

beforeEach(() => {
  fake.requests.length = 0;
  fake.scenario = (m) => ({ status: 200, lines: okStream(m, 0.001) });
  sleeps.length = 0;
  routerCalls.length = 0;
});

// ── Options ─────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults to a capped, low-effort, non-judged run against OpenRouter', () => {
    const o = parseArgs([], {});
    expect(o).toMatchObject({
      dryRun: false, maxUsd: 2, judge: false, judgeModel: 'sdk:claude-opus-5-5', effort: 'low',
      maxTokens: 16384, concurrency: 1, baseUrl: 'https://openrouter.ai/api/v1', models: null, cases: null,
    });
  });

  it('reads flags in both --flag value and --flag=value form', () => {
    const o = parseArgs(['--dry-run', '--max-usd=0.5', '--effort', 'auto', '--models', 'glm-eu,ling-vl', '--judge',
      '--reference', 'openai/gpt-6-luna', '--reference-price', '0.1,0.5'], { OPENROUTER_BASE_URL: 'http://x/v1' });
    expect(o).toMatchObject({
      dryRun: true, maxUsd: 0.5, effort: 'auto', models: ['glm-eu', 'ling-vl'], judge: true,
      reference: 'openai/gpt-6-luna', referencePrice: { input: 0.1, output: 0.5 }, baseUrl: 'http://x/v1',
    });
  });

  it('refuses unknown flags and bad values', () => {
    expect(() => parseArgs(['--effort', 'extreme'])).toThrow(/--effort/);
    expect(() => parseArgs(['--max-usd', '-1'])).toThrow(/--max-usd/);
    expect(() => parseArgs(['--concurrency', '9'])).toThrow(/at most 6/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
  });
});

// ── Request body ────────────────────────────────────────────

describe('request body', () => {
  let prepared: PreparedCase;
  beforeAll(async () => { prepared = await prepareCase(CASES.find((c) => c.id === 'press-release')!, FIXED_NOW); });
  const settings = { effort: 'low' as const, maxTokens: 16384, temperature: 0.5 };

  it('pins the EU candidate to the zero-retention providers, and only that one', () => {
    const eu = buildRequestBody(byKey('glm-eu'), prepared, settings);
    expect(eu.provider).toEqual({ only: ['inceptron', 'nextbit'], allow_fallbacks: true, zdr: true, data_collection: 'deny' });
    expect(EU_ZDR_PROVIDER).toEqual(eu.provider);
    // Negative control: default routing sends no provider object.
    expect(buildRequestBody(byKey('glm-default'), prepared, settings)).not.toHaveProperty('provider');
    expect(buildRequestBody(byKey('ling-vl'), prepared, settings)).not.toHaveProperty('provider');
  });

  it('streams with usage, sends the composed prompt and the rendered user message', () => {
    const body = buildRequestBody(byKey('glm-eu'), prepared, settings);
    expect(body).toMatchObject({
      model: 'z-ai/glm-5.3-flash', stream: true, stream_options: { include_usage: true }, max_tokens: 16384, temperature: 0.5,
      messages: [{ role: 'system', content: prepared.systemPrompt }, { role: 'user', content: prepared.userContent }],
    });
  });

  it('clamps max_tokens to an endpoint cap and never lets the extra body replace the model or messages', () => {
    expect(buildRequestBody(byKey('ling-vl'), prepared, { ...settings, maxTokens: 50000 }).max_tokens).toBe(32768);
    expect(buildRequestBody(byKey('glm-eu'), prepared, { ...settings, maxTokens: 50000 }).max_tokens).toBe(50000);
    const sneaky: Candidate = { ...byKey('glm-eu'), extraBody: { model: 'anthropic/claude-opus', messages: [] } };
    const body = buildRequestBody(sneaky, prepared, settings);
    expect(body.model).toBe('z-ai/glm-5.3-flash');
    expect(body.messages).toHaveLength(2);
  });

  it('maps effort onto what each model accepts', () => {
    expect(nearestEffort('medium', ['low', 'high', 'max'])).toBe('high');
    expect(nearestEffort('max', ['low', 'medium', 'high'])).toBe('high');
    const glm = byKey('glm-eu');
    const ling = byKey('ling-vl');
    expect(resolveReasoning(glm, 'low', 'think_hard')).toEqual({ effort: 'low' });
    expect(resolveReasoning(glm, 'medium', 'think_hard')).toEqual({ effort: 'high' });
    expect(resolveReasoning(glm, 'max', 'think_hard')).toEqual({ effort: 'max' });
    // GLM's reasoning is mandatory: "none" asks for its least, Ling's can be switched off.
    expect(resolveReasoning(glm, 'none', 'quick')).toEqual({ effort: 'low' });
    expect(resolveReasoning(ling, 'none', 'quick')).toEqual({ enabled: false });
    expect(resolveReasoning(ling, 'auto', 'quick')).toEqual({ enabled: false });
    expect(resolveReasoning(glm, 'auto', 'investigate')).toEqual({ effort: 'high' });
    expect(resolveReasoning(glm, 'auto', 'deep_investigate')).toEqual({ effort: 'max' });
    // A reference model with no reasoning profile gets no reasoning field.
    const ref: Candidate = { key: 'reference', label: 'r', model: 'x/y', reasoning: null };
    expect(buildRequestBody(ref, prepared, settings)).not.toHaveProperty('reasoning');
  });
});

// ── The real composed prompt ────────────────────────────────

describe('prepareCase', () => {
  it('composes the module\'s real system prompt with its default formats', async () => {
    const p = await prepareCase(CASES.find((c) => c.id === 'fcp-gap')!, FIXED_NOW);
    const moduleFile = fs.readFileSync(path.resolve(__dirname, '../../server/areas/fcp/modules/gap-analysis/system-prompt.md'), 'utf8');
    expect(moduleFile).toContain('## GAP SEVERITY SCALE');
    expect(p.systemPrompt).toContain('## GAP SEVERITY SCALE');
    expect(p.systemPrompt).toContain('You are ANTON, an expert AI reasoning engine');
    expect(p.systemPrompt).toContain(buildOutputInstruction(['gap-scoring-matrix', 'executive-summary', 'action-plan']));
    expect(p.systemPrompt).toContain('Sources, assumptions and what was not checked');
    expect(p.systemPrompt).toContain('Today is Friday 25 September 2026');
    expect(p.layers).toEqual(expect.arrayContaining(['layer2_foundation', 'layer3_area_context', 'layer4_module_prompt', 'layer6b_output_format', 'layer7_provenance_contract']));
    expect(p.areaId).toBe('fcp');
    expect(p.outputFormats).toEqual(['gap-scoring-matrix', 'executive-summary', 'action-plan']);
    expect(p.systemPromptSha256).toMatch(/^[0-9a-f]{64}$/);
    // Guided inputs rendered with the module's labels, as the route does.
    expect(p.userContent.startsWith('## Module Settings\n')).toBe(true);
    expect(p.userContent).toContain('- **Institution Type:** Fintech / Payment Institution');
    expect(p.userContent).not.toContain('**Institution Type:** fintech');
    // Negative control: an English case has no output-language layer.
    expect(p.systemPrompt).not.toContain('## OUTPUT LANGUAGE');
  });

  it('asks the Swedish case for Swedish', async () => {
    const p = await prepareCase(CASES.find((c) => c.id === 'sv-dsar')!, FIXED_NOW);
    expect(p.layers).toContain('layer1_output_language');
    expect(p.systemPrompt).toMatch(/## OUTPUT LANGUAGE\nRespond entirely in Swedish/);
  });

  it('every case names a module that exists', async () => {
    for (const c of CASES) await expect(prepareCase(c, FIXED_NOW)).resolves.toMatchObject({ case: { id: c.id } });
    expect(CASES).toHaveLength(10);
  });
});

// ── Runs against the fake server ────────────────────────────

describe('runEval against a fake OpenAI-compatible server', () => {
  it('a dry run calls nothing, needs no key and writes nothing', async () => {
    const o = opts({ dryRun: true, cases: null });
    const { outcome, log } = await run(o, { apiKey: '' });
    expect(outcome.exitCode).toBe(0);
    expect(fake.requests).toHaveLength(0);
    expect(fs.readdirSync(o.outDir as string)).toHaveLength(0);
    expect(log).toContain('10 module(s) x 3 model(s) = 30 call(s)');
    expect(log).toMatch(/Estimated spend: \$\d+\.\d{4} expected/);
    expect(log).toContain('Dry run: no model was called');
  });

  it('refuses to run without OPENROUTER_API_KEY', async () => {
    const { outcome, log } = await run(opts(), { apiKey: '' });
    expect(outcome.exitCode).toBe(2);
    expect(fake.requests).toHaveLength(0);
    expect(log).toContain('OPENROUTER_API_KEY is not set');
  });

  it('records answer, tokens, reasoning, cost, latency and finish_reason, and flags errors and cut-offs', async () => {
    fake.scenario = (model) => {
      if (model === 'inclusionai/ling-3.0-flash-vl') {
        return { status: 200, lines: sse(
          { choices: [{ delta: { content: 'Partial ' } }] },
          { error: { code: 502, message: 'Provider disconnected' }, choices: [{ delta: { content: '' }, finish_reason: 'error' }] },
        ) };
      }
      if (model === 'test/cutoff') {
        return { status: 200, lines: sse(
          { choices: [{ delta: { content: 'A long answer' } }] },
          { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 100, completion_tokens: 16384, cost: 0.01 } },
        ) };
      }
      return { status: 200, lines: okStream(model, 0.0021) };
    };
    const o = opts({ reference: 'test/cutoff' });
    const { outcome } = await run(o);
    expect(outcome.exitCode).toBe(0);
    const results = outcome.record!.results;
    expect(results.map((r) => r.candidate)).toEqual(['glm-eu', 'glm-default', 'ling-vl', 'reference']);

    const glm = results[0];
    expect(glm).toMatchObject({
      status: 'ok', content: 'The answer is here.', reasoning: 'Thinking it over.', finishReason: 'stop',
      provider: 'Inceptron', servedModel: 'z-ai/glm-5.3-flash', generationId: 'gen-1', costUsd: 0.0021, costSource: 'reported',
      usage: { promptTokens: 3000, completionTokens: 400, reasoningTokens: 120, cachedTokens: 0, costUsd: 0.0021 },
      request: { maxTokens: 16384, reasoning: { effort: 'low' }, provider: EU_ZDR_PROVIDER },
    });
    expect(glm.latencyMs).toBeGreaterThanOrEqual(0);
    expect(glm.firstContentMs).toBeGreaterThanOrEqual(glm.firstTokenMs as number);

    const ling = results[2];
    expect(ling.status).toBe('error');
    expect(ling.error).toContain('Provider disconnected');
    expect(ling.content).toBe('Partial ');
    // Streamed without a reported cost: priced at list price, and marked as an estimate.
    expect(ling.costSource).toBe('estimated');
    expect(ling.costUsd).toBeGreaterThan(0);

    const ref = results[3];
    expect(ref).toMatchObject({ status: 'ok', finishReason: 'length', truncated: true, costUsd: 0.01 });
    expect(ref.warnings.join(' ')).toContain('cut off');
    // The reference gets the run's effort (it used to get none, and Claude 5
    // then reasoned away its whole allowance).
    expect(ref.request.reasoning).toEqual({ effort: 'low' });

    // What reached the server: the key as a bearer token, the pin on the EU call only.
    expect(fake.requests).toHaveLength(4);
    expect(fake.requests.every((r) => r.headers.authorization === `Bearer ${KEY}`)).toBe(true);
    expect(fake.requests[0].body.provider).toEqual(EU_ZDR_PROVIDER);
    expect(fake.requests[1].body).not.toHaveProperty('provider');

    expect(outcome.record!.meta.spentUsd).toBeCloseTo(0.0021 * 2 + (ling.costUsd as number) + 0.01, 8);
    const md = fs.readFileSync(outcome.files!.markdown, 'utf8');
    const json = JSON.parse(fs.readFileSync(outcome.files!.json, 'utf8')) as EvalRecord;
    expect(path.basename(outcome.files!.markdown)).toBe('openrouter-eval-103000.md');
    expect(md.startsWith('# OpenRouter showcase model eval (2026-09-25 10:30)')).toBe(true);
    expect(md).toContain('| glm-eu | z-ai/glm-5.3-flash | 1/1 |');
    expect(md).toContain('The answer is here.');
    expect(md).toContain('Provider disconnected');
    expect(json.results).toHaveLength(4);
    expect(json.cases[0].systemPrompt).toContain('You are ANTON');
    // The key is never written to the report.
    expect(md + JSON.stringify(json)).not.toContain(KEY);
  });

  it('an answer that is only reasoning is an error, not an empty success', async () => {
    fake.scenario = () => ({ status: 200, lines: sse(
      { choices: [{ delta: { reasoning: 'thinking and thinking' } }] },
      { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 16384, completion_tokens_details: { reasoning_tokens: 16384 }, cost: 0.008 } },
    ) });
    const { outcome } = await run(opts({ models: ['glm-eu'] }));
    expect(outcome.record!.results[0]).toMatchObject({ status: 'error', truncated: true, costUsd: 0.008 });
    expect(outcome.record!.results[0].error).toContain('used up by reasoning');
    expect(outcome.exitCode).toBe(1);
  });

  it('stops once --max-usd is spent', async () => {
    fake.scenario = (m) => ({ status: 200, lines: okStream(m, 0.6) });
    const { outcome } = await run(opts({ maxUsd: 1 }));
    expect(fake.requests).toHaveLength(2);
    const r = outcome.record!.results;
    expect(r.map((x) => x.status)).toEqual(['ok', 'ok', 'skipped']);
    expect(r[2].skipReason).toMatch(/^budget: \$1\.2000 spent of --max-usd 1\.00/);

    // Negative control: a budget that covers the run lets every call through.
    fake.requests.length = 0;
    const generous = await run(opts({ maxUsd: 5 }));
    expect(fake.requests).toHaveLength(3);
    expect(generous.outcome.record!.results.every((x) => x.status === 'ok')).toBe(true);
  });

  it('does not start a call whose worst case at list price would cross --max-usd', async () => {
    const { outcome } = await run(opts({ maxUsd: 0.001 }));
    expect(fake.requests).toHaveLength(0);
    expect(outcome.record!.results.every((x) => x.status === 'skipped' && /could cost up to/.test(x.skipReason ?? ''))).toBe(true);
  });

  it('a 402 for the key limit stops the run without retrying', async () => {
    fake.scenario = () => ({ status: 402, json: { error: { code: 402, message: 'Key limit exceeded', metadata: { limit_source: 'openrouter_key_limit' } } } });
    const { outcome } = await run(opts());
    expect(fake.requests).toHaveLength(1);
    const r = outcome.record!.results;
    expect(r[0]).toMatchObject({ status: 'error', httpStatus: 402, budgetRefused: true });
    expect(r[0].error).toContain('openrouter_key_limit');
    expect(r.slice(1).every((x) => x.status === 'skipped' && x.skipReason?.includes('402'))).toBe(true);
    expect(outcome.record!.meta.stopReason).toContain('402');
  });

  it('retries a 429 after Retry-After', async () => {
    let calls = 0;
    fake.scenario = (m) => (++calls === 1
      ? { status: 429, headers: { 'Retry-After': '2' }, json: { error: { code: 429, message: 'Rate limited' } } }
      : { status: 200, lines: okStream(m, 0.001) });
    const { outcome } = await run(opts({ models: ['glm-eu'] }));
    expect(fake.requests).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
    expect(outcome.record!.results[0].status).toBe('ok');
  });
});

// ── Judge ───────────────────────────────────────────────────

describe('judge', () => {
  it('grades each answer blind against the case rubric and records the scores', async () => {
    const seen: Array<{ model: string; system: string; user: string }> = [];
    const judge: JudgeFn = async (input) => {
      seen.push(input);
      return 'Here is my grading.\n```json\n{"scores":[{"criterion":"Structure","score":4,"note":"fine"},{"criterion":"Facts","score":2}],"overall":3,"verdict":"edit","summary":"Usable after edits."}\n```';
    };
    const { outcome } = await run(opts({ judge: true, models: ['glm-eu', 'ling-vl'] }), { judge });
    expect(seen).toHaveLength(2);
    expect(seen[0].model).toBe(DEFAULT_JUDGE_MODEL);
    const pressCase = CASES.find((c) => c.id === 'press-release')!;
    expect(seen[0].user).toContain(pressCase.rubric[0]);
    expect(seen[0].user).toContain('The answer is here.');
    // Blind: the judge is not told which model wrote the answer.
    for (const s of seen) expect(`${s.system}\n${s.user}`).not.toMatch(/glm-5\.3|ling-3\.0|inclusionai|z-ai|glm-eu|ling-vl/i);
    const r = outcome.record!.results[0];
    expect(r.judge).toMatchObject({ overall: 3, verdict: 'edit', scores: [{ criterion: 'Structure', score: 4 }, { criterion: 'Facts', score: 2 }] });
    expect(fs.readFileSync(outcome.files!.markdown, 'utf8')).toMatch(/\| glm-eu \|[^\n]*\| 3\.00 \|/);
  });

  it('without --judge, no answer is graded', async () => {
    const judge = vi.fn<JudgeFn>(async () => '{}');
    await run(opts({ models: ['glm-eu'] }), { judge });
    expect(judge).not.toHaveBeenCalled();
  });

  it('parses judge replies defensively', () => {
    expect(parseJudgeReply('m', '<think>{"overall":1}</think> {"scores":[{"criterion":"a","score":5},{"criterion":"b","score":3}]}'))
      .toMatchObject({ overall: 4, scores: [{ score: 5 }, { score: 3 }] });
    expect(parseJudgeReply('m', 'no json at all')).toMatchObject({ overall: null, error: expect.stringContaining('no JSON') });
    expect(parseJudgeReply('m', '{"scores":[{"criterion":"a","score":9}]}')).toMatchObject({ overall: null, scores: [] });
  });

  it('tells the judge when the answer was cut off', () => {
    const c = CASES[0];
    const prompt = buildJudgePrompt({ moduleLabel: 'L', userContent: 'U', case: c }, 'answer', 'length');
    expect(prompt.user).toContain('cut off');
    expect(buildJudgePrompt({ moduleLabel: 'L', userContent: 'U', case: c }, 'answer', 'stop').user).not.toContain('cut off');
  });

  it('the default judge runs the subscription engine through ANTON\'s router', async () => {
    const saved = process.env.SDK_ENGINE_ENABLED;
    delete process.env.SDK_ENGINE_ENABLED;
    try {
      const text = await routerJudge({ model: DEFAULT_JUDGE_MODEL, system: 'S', user: 'U' });
      expect(text).toContain('"overall":4');
      expect(routerCalls).toHaveLength(1);
      expect(routerCalls[0]).toMatchObject({ model: 'sdk:claude-opus-5-5', system: 'S', messages: [{ role: 'user', content: 'U' }] });
      expect(process.env.SDK_ENGINE_ENABLED).toBe('true');
    } finally {
      if (saved === undefined) delete process.env.SDK_ENGINE_ENABLED; else process.env.SDK_ENGINE_ENABLED = saved;
    }
  });

  it('--rejudge grades an earlier results file without calling OpenRouter', async () => {
    const first = await run(opts({ models: ['glm-eu'] }));
    const jsonPath = first.outcome.files!.json;
    fake.requests.length = 0;
    const judge: JudgeFn = async () => '{"scores":[{"criterion":"a","score":5}],"overall":5}';
    const again = await run({ ...opts(), rejudge: jsonPath }, { judge, apiKey: '' });
    expect(fake.requests).toHaveLength(0);
    expect(again.outcome.files!.json).toBe(jsonPath.replace(/\.json$/, '-judged.json'));
    const judged = JSON.parse(fs.readFileSync(again.outcome.files!.json, 'utf8')) as EvalRecord;
    expect(judged.results[0].judge?.overall).toBe(5);
  });
});

describe('--resume and the reference model (after the first live run, 2026-09-25)', () => {
  it('sends the reference model the same effort as the run, so it does not reason away its whole allowance', async () => {
    fake.scenario = (model) => ({ status: 200, lines: okStream(model, 0.001) });
    const { outcome } = await run(opts({ reference: 'anthropic/claude-sonnet-5', models: ['reference'] }));
    expect(outcome.record!.results[0].request.reasoning).toEqual({ effort: 'low' });
    expect(fake.requests.at(-1)?.body.reasoning).toEqual({ effort: 'low' });
  });

  it('reuses the finished answers of an earlier run and calls only the rest; a cut-off answer is called again', async () => {
    fake.scenario = (model) => (model === 'inclusionai/ling-3.0-flash-vl'
      ? { status: 200, lines: sse(
        { choices: [{ delta: { content: 'Cut' } }] },
        { choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0001 } },
      ) }
      : { status: 200, lines: okStream(model, 0.002) });
    const first = await run(opts());
    const jsonPath = first.outcome.files!.json;
    const callsBefore = fake.requests.length;

    fake.scenario = (model) => ({ status: 200, lines: okStream(model, 0.003) });
    const second = await run(opts({ resume: jsonPath }));
    const calledAgain = fake.requests.slice(callsBefore).map((r) => r.body.model);
    expect(calledAgain).toEqual(['inclusionai/ling-3.0-flash-vl']);   // only the cut-off one
    const results = second.outcome.record!.results;
    expect(results.filter((r) => r.reusedFrom)).toHaveLength(2);
    expect(results.find((r) => r.candidate === 'ling-vl')?.reusedFrom).toBeUndefined();
    // Reused answers were paid in the earlier run: this run spent only the new call.
    expect(second.outcome.record!.meta.spentUsd).toBeCloseTo(0.003);
    expect(second.log).toContain('Resuming: 2 of 3 answer(s) reused');
  });

  it('negative control: without --resume every call is made', async () => {
    fake.scenario = (model) => ({ status: 200, lines: okStream(model, 0.002) });
    const before = fake.requests.length;
    await run(opts());
    expect(fake.requests.length - before).toBe(3);
  });
});
