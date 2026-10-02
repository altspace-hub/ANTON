/**
 * engagement-demo-row-caps.test.ts — how many scope items, workstreams, team
 * members and resources a demo visitor keeps in one engagement (DEMO_VISITOR_ROW_CAPS,
 * routes/engagements.ts, 2026-10-02).
 *
 * Nothing bounded them: a visitor could pile rows into one engagement, each
 * write small, and every engagement step then puts them all into its prompts.
 * A visitor at the cap is refused with a plain 409 sentence and nothing is
 * written; the model steps that add rows (the intake interview, the letter
 * extraction) stop at the cap. Negative controls: a visitor below the cap, an
 * administrator at it, and a server that is not a demo.
 *
 * Handlers are called directly with a fake database that answers the row
 * counts; tests/routes/engagement-demo-visitor.db.test.ts checks the same
 * rule against the test database.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter } from '../../server/db/database.js';

const callChatMock = vi.fn(async (): Promise<{ text: string; thinking: string; inputTokens: number; outputTokens: number }> => ({ text: '{}', thinking: '', inputTokens: 1, outputTokens: 1 }));
const streamChatMock = vi.fn(async (opts: Record<string, unknown>, res: { write: (s: string) => void }) => {
  void res;
  return { text: '', thinking: '', inputTokens: 1, outputTokens: 1, model: String(opts.model) };
});
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: () => callChatMock(),
  streamChat: (opts: Record<string, unknown>, res: { write: (s: string) => void }) => streamChatMock(opts, res),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'compat:openrouter:z-ai/glm-5.3' }));
vi.mock('../../server/services/default-model-store.js', () => ({ getEffectiveDefaultModel: () => 'compat:openrouter:z-ai/glm-5.3' }));
vi.mock('../../server/services/rag/indexer.js', () => ({ indexFolder: vi.fn() }));
vi.mock('../../server/services/rag/retriever.js', () => ({ retrieveChunks: vi.fn(async () => []) }));
vi.mock('../../server/services/engagement-session-bridge.js', () => ({ bridgeIterationToSession: vi.fn() }));

import { createEngagementsRoutes, DEMO_VISITOR_ROW_CAPS } from '../../server/routes/engagements.js';

type Handler = (req: unknown, res: unknown) => Promise<void>;

const ENV = ['DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_OFFERED_MODELS'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV) saved[k] = process.env[k];
afterAll(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });

const VISITOR = { id: 'visitor-1', role: 'analyst' };
const ADMIN = { id: 'admin-1', role: 'admin' };

async function handler(db: DatabaseAdapter, method: 'post', routePath: string): Promise<Handler> {
  const router = await createEngagementsRoutes(db);
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer?.route) throw new Error(`route not mounted: ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    frames: [] as string[],
    setHeader() { this.headersSent = true; },
    write(s: string) { this.frames.push(s); return true; },
    end() { /* closed */ },
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
}

/** A fake database whose engagement already holds `counts` rows per table. */
function fakeDb(counts: Partial<Record<'engagement_scope_items' | 'engagement_workstreams' | 'engagement_stakeholders' | 'engagement_resources', number>> = {}, doc?: Record<string, unknown>) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const engagement = { id: 'eng-1', title: 'AML review', engagement_type: 'full', client_name: 'A bank', your_organisation: 'Advisory', engagement_brief: '{}', exec_model: null, intake_conversation: '[]' };
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string) => {
      const count = /SELECT COUNT\(\*\) AS [nc] FROM (engagement_\w+) WHERE engagement_id = \?/.exec(sql);
      if (count) { const n = counts[count[1] as keyof typeof counts] ?? 0; return { n, c: n }; }
      if (/FROM engagements WHERE id/.test(sql)) return engagement;
      if (/FROM engagement_documents WHERE id = \?/.test(sql)) return doc;
      if (/SELECT \* FROM engagement_(scope_items|workstreams|stakeholders|resources) WHERE id = \?/.test(sql)) return { id: 'new' };
      return undefined;
    }),
    all: vi.fn(async () => []),
    run: vi.fn(async (sql: string, ...params: unknown[]) => { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, runs };
}

const inserts = (runs: Array<{ sql: string }>, table: string) => runs.filter((r) => new RegExp(`INSERT INTO ${table}\\b`).test(r.sql)).length;
const req = (who: { id: string; role: string }, body: Record<string, unknown>) => ({ params: { id: 'eng-1', docId: 'doc-1' }, body, user: who });

beforeEach(() => {
  process.env.DEMO_MODE = 'true';
  delete process.env.DEPLOYMENT_MODE;
  delete process.env.DEMO_OFFERED_MODELS;
  callChatMock.mockClear();
  streamChatMock.mockClear();
});

const CASES = [
  { kind: 'scope items', route: '/:id/scope-items', table: 'engagement_scope_items', cap: DEMO_VISITOR_ROW_CAPS.scopeItems, body: { title: 'One more scope item' }, says: /up to 200 scope items/ },
  { kind: 'workstreams', route: '/:id/workstreams', table: 'engagement_workstreams', cap: DEMO_VISITOR_ROW_CAPS.workstreams, body: { title: 'One more workstream' }, says: /up to 50 workstreams.*Delete one/ },
  { kind: 'team members', route: '/:id/team', table: 'engagement_stakeholders', cap: DEMO_VISITOR_ROW_CAPS.teamMembers, body: { name: 'One more contact' }, says: /up to 50 team members and client contacts.*Remove one/ },
  { kind: 'resources', route: '/:id/resources', table: 'engagement_resources', cap: DEMO_VISITOR_ROW_CAPS.resources, body: { category: 'other', title: 'A note', text_content: 'x'.repeat(40_000) }, says: /up to 100 resources.*Remove one/ },
] as const;

describe('the per-engagement row caps for a demo visitor', () => {
  it('names the caps the finding asked for', () => {
    expect(DEMO_VISITOR_ROW_CAPS).toEqual({ scopeItems: 200, workstreams: 50, teamMembers: 50, resources: 100 });
  });

  for (const c of CASES) {
    it(`refuses a visitor's new ${c.kind} at the cap with a 409 sentence, and writes nothing`, async () => {
      const { db, runs } = fakeDb({ [c.table]: c.cap });
      const res = mockRes();
      await (await handler(db, 'post', c.route))(req(VISITOR, { ...c.body }), res);
      expect(res.statusCode).toBe(409);
      expect((res.body as { error: string }).error).toMatch(c.says);
      expect((res.body as { code: string }).code).toBe('DEMO_ROW_LIMIT');
      expect(inserts(runs, c.table)).toBe(0);
    });

    it(`adds ${c.kind} below the cap, for an admin at it, and on a server that is not a demo (negative controls)`, async () => {
      const below = fakeDb({ [c.table]: c.cap - 1 });
      const r1 = mockRes();
      await (await handler(below.db, 'post', c.route))(req(VISITOR, { ...c.body }), r1);
      expect(r1.statusCode).toBe(200);
      expect(inserts(below.runs, c.table)).toBe(1);

      const admin = fakeDb({ [c.table]: c.cap + 10 });
      const r2 = mockRes();
      await (await handler(admin.db, 'post', c.route))(req(ADMIN, { ...c.body }), r2);
      expect(r2.statusCode).toBe(200);
      expect(inserts(admin.runs, c.table)).toBe(1);

      process.env.DEMO_MODE = 'false';
      const notDemo = fakeDb({ [c.table]: c.cap + 10 });
      const r3 = mockRes();
      await (await handler(notDemo.db, 'post', c.route))(req(VISITOR, { ...c.body }), r3);
      expect(r3.statusCode).toBe(200);
      expect(inserts(notDemo.runs, c.table)).toBe(1);
    });
  }

  it('the intake interview adds only as many scope items as the engagement has room for', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ title: `Confirmed item ${i + 1}` }));
    const text = `Noted.\n<intake_update>\n${JSON.stringify({ scope_items: items, done: false })}\n</intake_update>`;
    streamChatMock.mockImplementation(async (opts: Record<string, unknown>) => ({ text, thinking: '', inputTokens: 1, outputTokens: 1, model: String(opts.model) }));

    const nearCap = fakeDb({ engagement_scope_items: DEMO_VISITOR_ROW_CAPS.scopeItems - 2 });
    await (await handler(nearCap.db, 'post', '/:id/intake/turn'))(req(VISITOR, { message: 'Yes, all five.' }), mockRes());
    expect(inserts(nearCap.runs, 'engagement_scope_items')).toBe(2);

    const full = fakeDb({ engagement_scope_items: DEMO_VISITOR_ROW_CAPS.scopeItems });
    await (await handler(full.db, 'post', '/:id/intake/turn'))(req(VISITOR, { message: 'Yes, all five.' }), mockRes());
    expect(inserts(full.runs, 'engagement_scope_items')).toBe(0);

    // Negative control: an administrator gets all five.
    const admin = fakeDb({ engagement_scope_items: DEMO_VISITOR_ROW_CAPS.scopeItems });
    await (await handler(admin.db, 'post', '/:id/intake/turn'))(req(ADMIN, { message: 'Yes, all five.' }), mockRes());
    expect(inserts(admin.runs, 'engagement_scope_items')).toBe(5);
  });

  it("a visitor's letter extraction adds no more scope items, workstreams or contacts than the caps", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-eng-caps-'));
    try {
      const file = path.join(dir, 'letter.txt');
      fs.writeFileSync(file, 'Engagement letter.');
      const doc = { id: 'doc-1', engagement_id: 'eng-1', document_type: 'engagement_letter', file_path: file, file_name: 'letter.txt' };
      const extracted = {
        scope_items: Array.from({ length: 230 }, (_, i) => ({ title: `Item ${i}` })),
        workstreams: Array.from({ length: 70 }, (_, i) => ({ title: `Stream ${i}` })),
        parties: { contacts: Array.from({ length: 70 }, (_, i) => ({ name: `Contact ${i}` })) },
      };
      callChatMock.mockImplementation(async () => ({ text: JSON.stringify(extracted), thinking: '', inputTokens: 1, outputTokens: 1 }));

      const visitor = fakeDb({ engagement_scope_items: 1 }, doc);
      const r1 = mockRes();
      await (await handler(visitor.db, 'post', '/:id/documents/:docId/extract'))(req(VISITOR, {}), r1);
      expect(r1.statusCode).toBe(200);
      expect(inserts(visitor.runs, 'engagement_scope_items')).toBe(DEMO_VISITOR_ROW_CAPS.scopeItems);
      expect(inserts(visitor.runs, 'engagement_workstreams')).toBe(DEMO_VISITOR_ROW_CAPS.workstreams);
      expect(inserts(visitor.runs, 'engagement_stakeholders')).toBe(DEMO_VISITOR_ROW_CAPS.teamMembers);

      // Negative control: an administrator's letter adds everything it names.
      const admin = fakeDb({ engagement_scope_items: 1 }, doc);
      await (await handler(admin.db, 'post', '/:id/documents/:docId/extract'))(req(ADMIN, {}), mockRes());
      expect(inserts(admin.runs, 'engagement_scope_items')).toBe(230);
      expect(inserts(admin.runs, 'engagement_workstreams')).toBe(70);
      expect(inserts(admin.runs, 'engagement_stakeholders')).toBe(70);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
