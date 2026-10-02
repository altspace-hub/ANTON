/**
 * intelligence-insights-glm.test.ts — "Generate Insights" on the Intelligence
 * dashboard with an OpenRouter model (public showcase, 2026-10-02).
 *
 * Before: the reply had a leading ```json and a trailing ``` stripped and was
 * then JSON.parse'd. GLM wraps its JSON in prose or reasoning, which threw, and
 * the catch answered an empty list: the page said "no insights" for a call that
 * had been paid for. No jsonMode, no audit purpose, the tokens counted against
 * nobody's monthly budget, and a daily spend cap read as "no insights" too. An
 * index from the model outside the numbered sample (negative, too large, a
 * fraction) crashed or named nothing; a time range outside the four known ones
 * reached the SQL as INTERVAL 'undefined'.
 *
 * Now the reply is read tolerantly (parseInsightsReply), each field checked,
 * jsonMode and purpose sent, the caller charged, a spend cap answered 402 with
 * its own sentence, and the INTERVAL written only from a fixed table.
 *
 * Negative controls: a plain JSON reply still parses; an admin's call reads
 * every atom (no owner condition); with no atoms there is no model call.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const chat = vi.hoisted(() => ({ callChat: vi.fn() }));
vi.mock('../../server/services/provider-router.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/provider-router.js')>()),
  callChat: chat.callChat,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'compat:openrouter:z-ai/glm-5.3',
}));
const budget = vi.hoisted(() => ({ charge: vi.fn(async () => undefined) }));
vi.mock('../../server/services/budget-manager.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/budget-manager.js')>()),
  chargeMonthlyUsage: budget.charge,
}));

import { createIntelligenceDashboardRoutes } from '../../server/routes/intelligence-dashboard.js';
import { parseInsightsReply, parseInsightTimeRange } from '../../server/services/insights-generator.js';
import { SpendCapError } from '../../server/services/llm-spend.js';

const ATOMS = Array.from({ length: 3 }, (_, i) => ({
  id: `atom_${i}`, category: 'aml', content: `Atom content ${i}`, confidence: 0.8, sentiment: 'neutral',
}));
const atomQueries: Array<{ sql: string; params: unknown[] }> = [];
let atomsToReturn: unknown[] = ATOMS;

const db = {
  dialect: 'postgresql',
  async get() { return undefined; },
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    if (sql.includes('FROM knowledge_atoms')) {
      atomQueries.push({ sql, params: params.length === 1 && Array.isArray(params[0]) ? params[0] : params });
      return atomsToReturn as T[];
    }
    return [];
  },
  async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';
let current: { id: string; username: string; role: string } = { id: 'vis_1', username: 'vis_1', role: 'analyst' };
const originalMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: typeof current }).user = current; next(); });
  app.use('/api', await createIntelligenceDashboardRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(() => {
  vi.clearAllMocks();
  atomQueries.length = 0;
  atomsToReturn = ATOMS;
  process.env.DEPLOYMENT_MODE = 'team';
  current = { id: 'vis_1', username: 'vis_1', role: 'analyst' };
});

const INSIGHT = { type: 'trend', title: 'More AML findings', description: 'AML findings rose.', severity: 'warning', confidence: 0.7, supporting_atom_indices: [0, 1] };

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${base}${path}`);
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

describe('parseInsightsReply: what GLM sends back', () => {
  const list = JSON.stringify([INSIGHT]);
  const obj = JSON.stringify({ insights: [INSIGHT] });
  for (const [name, text] of [
    ['an object (what jsonMode asks for)', obj],
    ['a bare array (negative control: the old happy path)', list],
    ['a fenced object', `\`\`\`json\n${obj}\n\`\`\``],
    ['an object in prose', `Here are the insights you asked for:\n${obj}\nLet me know if you need more.`],
    ['a bare array in prose', `Here you go: ${list} — that is all.`],
    ['reasoning, then the object', `<think>Look at the AML atoms first.</think>\n${obj}`],
  ] as const) {
    it(`reads ${name}`, () => {
      expect(parseInsightsReply(text)?.[0]).toMatchObject({ title: 'More AML findings' });
    });
  }

  it('gives null for a reply with no insights in it', () => {
    expect(parseInsightsReply('I could not find any patterns.')).toBeNull();
    expect(parseInsightsReply('{"summary": "nothing"}')).toBeNull();
  });
});

describe('GET /intelligence/insights on a compat model', () => {
  it('turns a prose-wrapped GLM reply into insights, sends jsonMode and a purpose, and charges the caller', async () => {
    chat.callChat.mockResolvedValueOnce({
      text: `Sure! Here is my analysis.\n\`\`\`json\n${JSON.stringify({ insights: [INSIGHT] })}\n\`\`\``,
      thinking: '', inputTokens: 120, outputTokens: 40,
    });
    const r = await get('/intelligence/insights?timeRange=month');
    expect(r.status).toBe(200);
    const insights = r.body.insights as Array<Record<string, unknown>>;
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ type: 'trend', title: 'More AML findings', severity: 'warning', confidence: 0.7, supporting_atoms: ['atom_0', 'atom_1'] });

    const call = chat.callChat.mock.calls[0][0] as { jsonMode?: boolean; purpose?: string; db?: unknown };
    expect(call).toMatchObject({ jsonMode: true, purpose: 'intelligence-insights' });
    expect(call.db).toBe(db);
    expect(budget.charge).toHaveBeenCalledWith(db, expect.objectContaining({ id: 'vis_1' }), 120, 40);
  });

  it('checks every field: unknown type and severity fall back, confidence is clamped, odd indices name nothing', async () => {
    chat.callChat.mockResolvedValueOnce({
      text: JSON.stringify({ insights: [
        { type: 'prophecy', title: 'X happens', severity: 'apocalyptic', confidence: 7, supporting_atom_indices: [2, 25, -1, 1.5, 2, '0'] },
        { title: '' },
        null,
      ] }),
      thinking: '', inputTokens: 1, outputTokens: 1,
    });
    const r = await get('/intelligence/insights');
    const insights = r.body.insights as Array<Record<string, unknown>>;
    expect(insights).toEqual([expect.objectContaining({ type: 'pattern', severity: 'info', confidence: 1, supporting_atoms: ['atom_2'] })]);
  });

  it('a daily spend cap answers 402 with its own sentence, not an empty list', async () => {
    chat.callChat.mockRejectedValueOnce(new SpendCapError('user', 'Your AI budget for today is used up.'));
    const r = await get('/intelligence/insights');
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('Your AI budget for today is used up.');
    expect(budget.charge).not.toHaveBeenCalled();
  });

  it('a team user\'s atoms are their own and the shared ones; an admin\'s are all (negative control)', async () => {
    chat.callChat.mockResolvedValue({ text: '{"insights": []}', thinking: '', inputTokens: 1, outputTokens: 1 });
    await get('/intelligence/insights');
    expect(atomQueries[0].sql).toContain('(owner_user_id IS NULL OR owner_user_id = ?)');
    expect(atomQueries[0].params).toContain('vis_1');

    current = { id: 'root', username: 'root', role: 'admin' };
    await get('/intelligence/insights');
    expect(atomQueries[1].sql).not.toContain('owner_user_id');
  });

  it('with no atoms there is no model call', async () => {
    atomsToReturn = [];
    const r = await get('/intelligence/insights');
    expect(r.body.insights).toEqual([]);
    expect(chat.callChat).not.toHaveBeenCalled();
  });

  it('a time range outside the four known ones never reaches the SQL', async () => {
    chat.callChat.mockResolvedValue({ text: '{"insights": []}', thinking: '', inputTokens: 1, outputTokens: 1 });
    for (const bad of ['constructor', 'toString', "week'; DROP TABLE x; --", '']) {
      atomQueries.length = 0;
      const r = await get(`/intelligence/insights?timeRange=${encodeURIComponent(bad)}`);
      expect(r.status).toBe(200);
      expect(atomQueries[0].sql).toContain("INTERVAL '7 days'");
      expect(atomQueries[0].sql).not.toMatch(/undefined|function|DROP/);
    }
    expect(parseInsightTimeRange('all')).toBe('all');
    expect(parseInsightTimeRange('__proto__')).toBeUndefined();
  });

  it('the export with an unknown time range has no INTERVAL (it used to send INTERVAL \'undefined\')', async () => {
    atomQueries.length = 0;
    const r = await fetch(`${base}/intelligence/export?format=json&timeRange=hasOwnProperty`);
    expect(r.status).toBe(200);
    expect(atomQueries[0].sql).not.toContain('INTERVAL');
  });
});
