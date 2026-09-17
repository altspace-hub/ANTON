/**
 * iterative-reasoning-router.test.ts — the Iterative Reasoning Engine runs
 * through the provider router on the model the run was given.
 *
 * Until 2026-09-17 iterative-reasoning.ts built a raw Anthropic client and
 * pinned every phase to 'claude-opus-4-8', so on an instance whose default is
 * the subscription engine (sdk:claude-opus-5) the chain never ran at all:
 * routes/claude.ts gated it on provider === 'anthropic' and the service
 * needed an API key the instance does not have. revelation_chains had 0 rows.
 *
 * Proves, with provider-router mocked (no network, no database):
 *   - every phase calls callChat (internal) / streamChat (synthesis) with the
 *     configured model — prefixed id as given, never a literal Opus 4.8 — and
 *     hands depth to the router as an ANTON thinking level, never an effort;
 *   - usage aggregates across phases and the chain row's totals are the sum;
 *   - the summary + SSE envelope carry engine, model and a registry label;
 *   - thinking from the router result (the SDK path's completion data) lands
 *     in the step records, as the API path's did;
 *   - the reflect-phase checkpoint is parsed from text on both engines;
 *   - ireSupportedProvider admits exactly the two Anthropic engines;
 *   - a failing phase surfaces through the existing error contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Response } from 'express';
import type { DatabaseAdapter } from '../../server/db/database.js';

const router = vi.hoisted(() => ({
  callChat: vi.fn(),
  streamChat: vi.fn(),
}));

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: router.callChat,
  streamChat: router.streamChat,
  resolveModel: (m?: string) => m ?? 'sdk:claude-opus-5',
  mapModelToProvider: (m: string) => m,
}));

// Prefix routing only — the real module drags in every vendor SDK.
vi.mock('../../server/services/model-adapter.js', () => ({
  getProviderFromModelId: (id: string) => {
    if (id.startsWith('sdk:')) return 'anthropic_sdk';
    if (id.startsWith('codex:')) return 'openai_codex';
    if (id.startsWith('claude-')) return 'anthropic';
    if (id.startsWith('mistral-')) return 'mistral';
    throw new Error(`Cannot determine provider for model: ${id}`);
  },
}));

import {
  runIterativeReasoning,
  ireSupportedProvider,
  describeIreModel,
  extractCheckpoint,
  flattenMessageContent,
  phaseThinkingLevel,
  type IREConfig,
} from '../../server/services/iterative-reasoning.js';

// ── Fakes ──────────────────────────────────────────────────────────

interface RouterCall {
  model?: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  thinkingLevel?: string;
  tools?: unknown[];
  maxTokens?: number;
  [k: string]: unknown;
}

function makeDb() {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    runs,
    async run(sql: string, ...params: unknown[]) { runs.push({ sql, params }); return { changes: 1 }; },
    async get() { return undefined; },
    async all() { return []; },
  };
  return db;
}
type FakeDb = ReturnType<typeof makeDb>;
const asDb = (db: FakeDb) => db as unknown as DatabaseAdapter;

function makeRes() {
  const frames: string[] = [];
  const res = {
    headersSent: false,
    ended: false,
    frames,
    writeHead() { res.headersSent = true; },
    write(chunk: string) { frames.push(chunk); return true; },
    end() { res.ended = true; },
    events(): Array<Record<string, unknown>> {
      return frames
        .flatMap((f) => f.split('\n'))
        .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
        .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
    },
    done(): boolean { return frames.some((f) => f.includes('data: [DONE]')); },
  };
  return res;
}
type FakeRes = ReturnType<typeof makeRes>;
const asRes = (res: FakeRes) => res as unknown as Response;

function baseConfig(over: Partial<IREConfig> = {}): IREConfig {
  return {
    thinkingLevel: 'deep_investigate',
    model: 'sdk:claude-opus-5',
    staticSystemPrompt: 'FOUNDATION PROMPT',
    dynamicSystemPrompt: 'OUTPUT FORMAT BLOCK',
    messages: [{ role: 'user', content: 'Assess the AMLR exposure of a Nordic fintech.' }],
    sessionId: 'sess-1',
    ...over,
  };
}

/** Mocked engine: phase n answers with distinct text/thinking/usage; reflect
 *  ends with a checkpoint block, as the phase directive asks for. */
function primeRouter(opts: { failAt?: number; failSynthesis?: boolean } = {}) {
  let n = 0;
  router.callChat.mockReset();
  router.streamChat.mockReset();
  router.callChat.mockImplementation(async (cfg: RouterCall) => {
    n += 1;
    if (opts.failAt === n) throw new Error('engine busy');
    const phase = /PHASE: ([A-Z]+)/.exec(cfg.system)?.[1]?.toLowerCase() ?? `phase${n}`;
    const text = phase === 'reflect'
      ? `Reflection on the analysis.\n\n<checkpoint>{"confidence": 0.7, "revision_needed": false, "next_action": "probe the beneficial-ownership threshold"}</checkpoint>`
      : `${phase} output ${n}`;
    return { text, thinking: `${phase} thinking ${n}`, inputTokens: 100 * n, outputTokens: 10 * n };
  });
  router.streamChat.mockImplementation(async (_cfg: RouterCall, res: FakeRes) => {
    if (opts.failSynthesis) throw new Error('stream broke');
    // The router writes the deltas itself; the service owns the envelope.
    res.write(`data: ${JSON.stringify({ type: 'thinking_delta', content: 'final thought' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'text_delta', content: 'FINAL ANSWER' })}\n\n`);
    return { text: 'FINAL ANSWER', thinking: 'final thought', inputTokens: 500, outputTokens: 50 };
  });
}

const calls = (): RouterCall[] => router.callChat.mock.calls.map((c) => c[0] as RouterCall);
const synthCall = (): RouterCall => router.streamChat.mock.calls[0][0] as RouterCall;
const stepInserts = (db: FakeDb) => db.runs.filter((r) => /INSERT INTO revelation_steps/.test(r.sql));
const chainUpdate = (db: FakeDb) => db.runs.find((r) => /UPDATE revelation_chains/.test(r.sql));

beforeEach(() => primeRouter());

// ── Tests ──────────────────────────────────────────────────────────

describe('IRE through the provider router', () => {
  it('runs every deep_investigate phase on the configured model — the prefixed id, never a pinned Opus 4.8', async () => {
    const db = makeDb();
    const res = makeRes();
    const summary = await runIterativeReasoning(baseConfig(), asRes(res), asDb(db));

    expect(router.callChat).toHaveBeenCalledTimes(5);
    expect(router.streamChat).toHaveBeenCalledTimes(1);
    for (const cfg of [...calls(), synthCall()]) {
      expect(cfg.model).toBe('sdk:claude-opus-5');
      // Depth is an ANTON level for the router/thinking-map — never an effort here.
      expect(cfg).not.toHaveProperty('thinking');
      expect(cfg).not.toHaveProperty('output_config');
      expect(cfg).not.toHaveProperty('effort');
    }
    expect(JSON.stringify(router.callChat.mock.calls)).not.toContain('claude-opus-4-8');
    expect(JSON.stringify(router.streamChat.mock.calls[0][0])).not.toContain('claude-opus-4-8');

    const order = res.events().filter((e) => e.type === 'phase_start').map((e) => e.phaseName);
    expect(order).toEqual(['analyse', 'reflect', 'deepen', 'explore', 'validate', 'synthesise']);
    expect(summary.phaseCount).toBe(6);
    expect(summary.synthesisText).toBe('FINAL ANSWER');
    expect(res.done()).toBe(true);
    expect(res.ended).toBe(true);
  });

  it('scaffolding phases think at think_hard; deepen/explore/synthesise at the run level', async () => {
    await runIterativeReasoning(baseConfig(), asRes(makeRes()), asDb(makeDb()));
    const levels = calls().map((c) => c.thinkingLevel);
    expect(levels).toEqual(['think_hard', 'think_hard', 'deep_investigate', 'deep_investigate', 'think_hard']);
    expect(synthCall().thinkingLevel).toBe('deep_investigate');

    expect(phaseThinkingLevel('run', 'investigate')).toBe('investigate');
    expect(phaseThinkingLevel('think_hard', 'investigate')).toBe('think_hard');
    expect(phaseThinkingLevel('run', 'think_hard')).toBe('think_hard');
  });

  it('think_hard is two phases, both at think_hard depth', async () => {
    await runIterativeReasoning(baseConfig({ thinkingLevel: 'think_hard' }), asRes(makeRes()), asDb(makeDb()));
    expect(router.callChat).toHaveBeenCalledTimes(1);
    expect(calls()[0].thinkingLevel).toBe('think_hard');
    expect(synthCall().thinkingLevel).toBe('think_hard');
  });

  it('composes the phase prompt: static first, then dynamic, prior outputs and the directive', async () => {
    await runIterativeReasoning(baseConfig(), asRes(makeRes()), asDb(makeDb()));
    const [analyse, reflect, deepen] = calls();

    expect(analyse.system.indexOf('FOUNDATION PROMPT')).toBeLessThan(analyse.system.indexOf('OUTPUT FORMAT BLOCK'));
    expect(analyse.system).toContain('PHASE: ANALYSE');
    expect(analyse.system).not.toContain('<checkpoint>');           // analyse reports no checkpoint
    expect(reflect.system).toContain('<checkpoint>');               // reflect is asked for one
    expect(reflect.system).toContain('### ANALYSE PHASE OUTPUT\nanalyse output 1');
    expect(deepen.system).toContain('### REFLECT PHASE OUTPUT\nReflection on the analysis.');
    // The checkpoint block is bookkeeping — it never rides into the next phase's context.
    expect(deepen.system).not.toContain('"confidence": 0.7');
  });

  it('aggregates usage across phases; the chain row totals are the sum (subscription engine)', async () => {
    const db = makeDb();
    const res = makeRes();
    const summary = await runIterativeReasoning(baseConfig(), asRes(res), asDb(db));

    const expectedIn = 100 * (1 + 2 + 3 + 4 + 5) + 500;
    const expectedOut = 10 * (1 + 2 + 3 + 4 + 5) + 50;
    expect(summary.totalInputTokens).toBe(expectedIn);
    expect(summary.totalOutputTokens).toBe(expectedOut);

    const update = chainUpdate(db);
    expect(update).toBeDefined();
    expect(update!.params.slice(0, 3)).toEqual([6, expectedIn, expectedOut]);
    expect(update!.params[4]).toBe(0.7);            // synthesis_quality_score from the reflect checkpoint
    expect(update!.params[5]).toBe(summary.chainId);

    const usage = res.events().find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ inputTokens: expectedIn, outputTokens: expectedOut });

    const steps = stepInserts(db);
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.params[10])).toEqual([100, 200, 300, 400, 500, 500]); // input_tokens per step
    expect(steps.map((s) => s.params[11])).toEqual([10, 20, 30, 40, 50, 50]);       // output_tokens per step
  });

  it('aggregates usage the same way on the API engine', async () => {
    const db = makeDb();
    const summary = await runIterativeReasoning(baseConfig({ model: 'claude-opus-5' }), asRes(makeRes()), asDb(db));
    expect(summary.engine).toBe('anthropic');
    expect(summary.model).toBe('claude-opus-5');
    expect(summary.totalInputTokens).toBe(2000);
    expect(summary.totalOutputTokens).toBe(200);
    for (const cfg of [...calls(), synthCall()]) expect(cfg.model).toBe('claude-opus-5');
  });

  it('the summary and the SSE envelope carry engine, model and a registry label', async () => {
    const res = makeRes();
    const summary = await runIterativeReasoning(baseConfig(), asRes(res), asDb(makeDb()));
    expect(summary.engine).toBe('anthropic_sdk');
    expect(summary.model).toBe('sdk:claude-opus-5');
    expect(summary.modelLabel).toBe('Claude Opus 5 (subscription engine)');

    const chainEvent = res.events().find((e) => e.type === 'revelation_chain_id');
    expect(chainEvent).toMatchObject({
      chainId: summary.chainId,
      engine: 'anthropic_sdk',
      model: 'sdk:claude-opus-5',
      modelLabel: 'Claude Opus 5 (subscription engine)',
      totalPhases: 6,
    });

    expect(describeIreModel('claude-opus-4-8')).toEqual({ engine: 'anthropic', model: 'claude-opus-4-8', label: 'Claude Opus 4.8' });
    expect(describeIreModel('sdk:claude-sonnet-5').label).toBe('Claude Sonnet 5 (subscription engine)');
    expect(describeIreModel('sdk:not-in-registry')).toEqual({ engine: 'anthropic_sdk', model: 'sdk:not-in-registry', label: 'not-in-registry (subscription engine)' });
    expect(describeIreModel('who-knows').engine).toBe('unknown');
  });

  it('thinking from the router result lands in every step record and the stream_end blocks', async () => {
    const db = makeDb();
    const res = makeRes();
    await runIterativeReasoning(baseConfig(), asRes(res), asDb(db));

    const steps = stepInserts(db);
    expect(steps.map((s) => s.params[5])).toEqual([
      'analyse thinking 1', 'reflect thinking 2', 'deepen thinking 3', 'explore thinking 4', 'validate thinking 5', 'final thought',
    ]);
    expect(steps.map((s) => s.params[4])).toEqual(['analyse', 'reflect', 'deepen', 'explore', 'validate', 'synthesise']);
    expect(steps[5].params[6]).toBe('FINAL ANSWER');

    const end = res.events().find((e) => e.type === 'stream_end');
    expect(end?.contentBlocks).toEqual([
      { type: 'thinking', content: 'final thought' },
      { type: 'text', content: 'FINAL ANSWER' },
    ]);
    // The router's own deltas reached the response ahead of the envelope.
    const types = res.events().map((e) => e.type);
    expect(types.indexOf('text_delta')).toBeLessThan(types.indexOf('stream_end'));
  });

  it('parses the reflect checkpoint from text and strips it from the stored output', async () => {
    const db = makeDb();
    const res = makeRes();
    const summary = await runIterativeReasoning(baseConfig(), asRes(res), asDb(db));

    const reflect = stepInserts(db)[1];
    expect(reflect.params[6]).toBe('Reflection on the analysis.');   // output_content, block removed
    expect(reflect.params[7]).toBe(0.7);                              // confidence_score
    expect(reflect.params[8]).toBe(0);                                // revision_needed
    expect(reflect.params[9]).toBe('probe the beneficial-ownership threshold');
    expect(summary.synthesisQualityScore).toBe(0.7);

    const phaseEnd = res.events().find((e) => e.type === 'phase_end' && e.phaseName === 'reflect');
    expect(phaseEnd?.confidenceScore).toBe(0.7);
  });

  it('extractCheckpoint tolerates fences, clamps confidence and survives bad JSON', () => {
    const fenced = extractCheckpoint('Body.\n<checkpoint>```json\n{"confidence": 1.4, "revision_needed": true, "next_action": " x "}\n```</checkpoint>');
    expect(fenced.text).toBe('Body.');
    expect(fenced.checkpoint).toEqual({ confidenceScore: 1, revisionNeeded: true, nextAction: 'x' });

    const broken = extractCheckpoint('Body.\n<checkpoint>{not json}</checkpoint>');
    expect(broken.text).toBe('Body.');
    expect(broken.checkpoint).toEqual({ confidenceScore: null, revisionNeeded: null, nextAction: null });

    const none = extractCheckpoint('No block here.');
    expect(none.text).toBe('No block here.');
    expect(none.checkpoint.confidenceScore).toBeNull();
  });

  it('forwards the run tools to the synthesis phase only', async () => {
    const tools = [{ type: 'web_search_20260209', name: 'web_search' }];
    await runIterativeReasoning(baseConfig({ tools }), asRes(makeRes()), asDb(makeDb()));
    for (const cfg of calls()) expect(cfg.tools).toBeUndefined();
    expect(synthCall().tools).toEqual(tools);
  });

  it('flattens block content for the router: text kept, thinking not replayed, images named', async () => {
    const config = baseConfig({
      messages: [
        { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }, { type: 'text', text: 'Look at this chart.' }] },
        { role: 'assistant', content: [{ type: 'thinking', content: 'private reasoning' }, { type: 'text', content: 'Earlier answer.' }] },
        { role: 'user', content: 'Follow up.' },
      ],
    });
    await runIterativeReasoning(config, asRes(makeRes()), asDb(makeDb()));
    const msgs = calls()[0].messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[0].content).toBe('[image block not carried into this reasoning phase]\n\nLook at this chart.');
    expect(msgs[1].content).toBe('Earlier answer.');
    expect(msgs[2].content).toBe('Follow up.');
    expect(JSON.stringify(msgs)).not.toContain('private reasoning');
    expect(JSON.stringify(msgs)).not.toContain('AAAA');

    expect(flattenMessageContent('plain')).toBe('plain');
    expect(flattenMessageContent([{ type: 'text', text: 'a' }, { type: 'tool_use', name: 't' }])).toBe('a\n\n[tool_use block not carried into this reasoning phase]');
  });

  it('ireSupportedProvider admits exactly the two Anthropic engines', () => {
    expect(ireSupportedProvider('anthropic')).toBe(true);
    expect(ireSupportedProvider('anthropic_sdk')).toBe(true);
    for (const p of ['openai_codex', 'openai', 'mistral', 'google', 'ollama', 'azure_openai', 'openai_compatible', '', 'Anthropic']) {
      expect(ireSupportedProvider(p)).toBe(false);
    }
  });

  it('a failing internal phase surfaces through the existing error contract', async () => {
    primeRouter({ failAt: 2 });
    const db = makeDb();
    const res = makeRes();
    const summary = await runIterativeReasoning(baseConfig(), asRes(res), asDb(db));

    const error = res.events().find((e) => e.type === 'error');
    expect(error?.message).toBe("IRE phase 'reflect' failed: engine busy");
    expect(res.done()).toBe(true);
    expect(res.ended).toBe(true);
    expect(router.streamChat).not.toHaveBeenCalled();

    expect(summary.phaseCount).toBe(1);
    expect(summary.synthesisText).toBe('');
    expect(summary.synthesisQualityScore).toBeNull();
    expect(summary.totalInputTokens).toBe(100);       // what actually ran, not a guess
    expect(summary.engine).toBe('anthropic_sdk');
    expect(chainUpdate(db)).toBeUndefined();           // totals are not written for an aborted chain
  });

  it('a failing synthesis surfaces as "IRE synthesis failed" and still closes the stream', async () => {
    primeRouter({ failSynthesis: true });
    const db = makeDb();
    const res = makeRes();
    const summary = await runIterativeReasoning(baseConfig({ thinkingLevel: 'investigate' }), asRes(res), asDb(db));

    const error = res.events().find((e) => e.type === 'error');
    expect(error?.message).toBe('IRE synthesis failed: stream broke');
    expect(res.done()).toBe(true);
    expect(res.ended).toBe(true);
    expect(summary.synthesisText).toBe('');
    expect(summary.phaseCount).toBe(4);
    expect(summary.totalInputTokens).toBe(600);        // the three internal phases that ran
    expect(chainUpdate(db)?.params[1]).toBe(600);
  });
});

describe('IRE source guard', () => {
  const src = readFileSync(join(process.cwd(), 'server', 'services', 'iterative-reasoning.ts'), 'utf8');

  it('carries no pinned model id and no raw Anthropic client', () => {
    // The behavioural tests above prove the model that reaches the router; this
    // pins the two literals whose return would silently re-pin the engine.
    expect(src).not.toMatch(/['"]claude-opus-4-8['"]/);
    expect(src).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]/);
    expect(src).not.toMatch(/from ['"]\.\/claude-client\.js['"]/);
  });
});
