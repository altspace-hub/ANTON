/**
 * team-isolation-round4-lows.test.ts — the low-severity gaps left after round 3
 * of the team-isolation work (fix/team-isolation, 2026-09-23).
 *
 *  - POST /api/embeddings/reindex and /backfill-vec are instance-wide operator
 *    actions (every user's atoms re-embedded; a pgvector column and index built)
 *    but had no role gate, unlike /reembed-mismatched beside them. Now
 *    requireAdminOrSolo: a team non-admin gets 403 and nothing runs.
 *  - topK came from the body unchecked on /search/atoms, /search/decisions and
 *    /similar: a string reached the search service as a string, and nothing
 *    capped a large value (the scoped searches over-fetch a multiple of it). It
 *    is now a whole number in [1, 100], else the route's default.
 *  - POST /api/coding/score wrote the score row against any sessionId, and
 *    quality trends read a session's scores by its owner — so a score could be
 *    written into a colleague's session. A session that is not the caller's is
 *    treated as absent, the rule /quality/score applies.
 *  - The companion app's agent routes continued a conversation by id with no
 *    requester, which matched every NULL-requester conversation with that agent.
 *    They now bind it to the phone user (requesterHash `app:<id>`); the
 *    processor's rule itself is covered in team-isolation-round3-atoms-files.
 *
 * Fake adapters, no database. Each closed gap has a negative control.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-team-isolation-round4';
  return {
    searches: [] as Array<{ topK?: unknown }>,
    similar: [] as Array<{ topK?: unknown }>,
    adapterCalls: 0,
    backfills: 0,
    scored: [] as Array<string | undefined>,
  };
});

vi.mock('../../server/services/hybrid-search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/hybrid-search.js')>();
  return {
    ...actual,
    hybridSearch: vi.fn(async (_db: unknown, opts: { topK?: unknown }) => { H.searches.push({ topK: opts.topK }); return []; }),
    findSimilar: vi.fn(async (_db: unknown, opts: { topK?: unknown }) => { H.similar.push({ topK: opts.topK }); return []; }),
  };
});
vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  return { ...actual, getEmbeddingAdapter: () => { H.adapterCalls++; return { provider: 'test', model: 'test-embedder' }; } };
});
vi.mock('../../server/services/embedding-pipeline.js', () => ({
  backfillKnowledgeAtoms: vi.fn(async () => { H.backfills++; }),
  backfillCheckpoints: vi.fn(async () => { H.backfills++; }),
  embedModuleDescriptions: vi.fn(async () => { H.backfills++; }),
}));
vi.mock('../../server/services/coding-integration.js', () => ({
  createCodingIntegration: async () => ({
    scoreOutput: async (_content: string, _moduleId: string, _areaId: string, sessionId?: string) => {
      H.scored.push(sessionId);
      return { score: 80, id: 'score-1', regressionWarning: null };
    },
  }),
}));

interface Caller { id: string; username: string; role: 'admin' | 'analyst' }
const ALICE: Caller = { id: 'alice', username: 'alice', role: 'analyst' };
const BOB: Caller = { id: 'bob', username: 'bob', role: 'analyst' };
const ADMIN: Caller = { id: 'root', username: 'root', role: 'admin' };

const SESSION_OWNERS: Record<string, string> = { 'sess-alice': 'alice' };
const runs: string[] = [];
let caller: Caller = BOB;
const savedMode = process.env.DEPLOYMENT_MODE;

const db = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT 1 AS ok FROM sessions WHERE id = \? AND user_id = \?/.test(s)) {
      return (SESSION_OWNERS[String(params[0])] === params[1] ? { ok: 1 } : undefined) as T | undefined;
    }
    if (/COUNT\(\*\)/.test(s)) return { c: 0 } as T;
    return undefined;
  },
  async all<T>(): Promise<T[]> { return []; },
  async run(sql: string): Promise<RunResult> { runs.push(sql); return { changes: 0, lastInsertRowid: 0 }; },
  async exec(): Promise<void> {},
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close(): Promise<void> {},
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';

beforeAll(async () => {
  const { createEmbeddingRoutes } = await import('../../server/routes/embeddings.js');
  const { createCodingRoutes } = await import('../../server/routes/coding.js');
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: Caller }).user = caller;
    next();
  });
  app.use('/api/embeddings', await createEmbeddingRoutes(db));
  app.use('/api', await createCodingRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no addr');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = savedMode;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => {
  H.searches.length = 0;
  H.similar.length = 0;
  H.adapterCalls = 0;
  H.backfills = 0;
  H.scored.length = 0;
  runs.length = 0;
  caller = BOB;
  process.env.DEPLOYMENT_MODE = 'team';
});

const solo = (): void => { delete process.env.DEPLOYMENT_MODE; };
const post = (route: string, body: unknown) => fetch(`${base}/api${route}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('embeddings operator routes — admin-only on a team server', () => {
  it('a team non-admin gets 403 on /reindex and /backfill-vec, and nothing runs', async () => {
    expect((await post('/embeddings/reindex', {})).status).toBe(403);
    expect((await post('/embeddings/backfill-vec', {})).status).toBe(403);
    expect(H.adapterCalls).toBe(0);
    expect(H.backfills).toBe(0);
    expect(runs).toEqual([]);
  });

  it('negative controls — a team admin and the solo user run them', async () => {
    caller = ADMIN;
    expect((await post('/embeddings/reindex', {})).status).toBe(200);
    expect(H.backfills).toBe(3);
    expect((await post('/embeddings/backfill-vec', {})).status).toBe(200);
    expect(runs.some((s) => s.includes('CREATE EXTENSION IF NOT EXISTS vector'))).toBe(true);

    caller = BOB;
    solo();
    expect((await post('/embeddings/reindex', {})).status).toBe(200);
  });
});

describe('topK is a whole number in [1, 100]', () => {
  // Solo: instance scope, so the routes hand topK to the service unchanged —
  // exactly where a string or an unbounded value used to reach it.
  beforeEach(solo);

  it('/search/decisions', async () => {
    for (const [sent, got] of [['5', 5], [1e9, 100], [-3, 10], ['many', 10], [7.9, 7]] as const) {
      H.searches.length = 0;
      expect((await post('/embeddings/search/decisions', { query: 'q', topK: sent })).status).toBe(200);
      expect(H.searches[0]?.topK, `topK ${String(sent)}`).toBe(got);
    }
  });

  it('/search/atoms (over-fetches twice the bounded value)', async () => {
    await post('/embeddings/search/atoms', { query: 'q', topK: '7' });
    expect(H.searches[0]?.topK).toBe(14);
    H.searches.length = 0;
    await post('/embeddings/search/atoms', { query: 'q', topK: 5000 });
    expect(H.searches[0]?.topK).toBe(200);
  });

  it('/similar', async () => {
    await post('/embeddings/similar', { contentType: 'module', contentId: 'm-1', topK: 1e6 });
    expect(H.similar[0]?.topK).toBe(100);
    H.similar.length = 0;
    await post('/embeddings/similar', { contentType: 'module', contentId: 'm-1' });
    expect(H.similar[0]?.topK).toBe(5);
  });
});

describe('POST /coding/score — the session must be the caller\'s', () => {
  const score = (sessionId?: string) => post('/coding/score', { content: 'out', moduleId: 'code-review', sessionId });

  it("a colleague's session is treated as absent: the score is recorded against no session", async () => {
    expect((await score('sess-alice')).status).toBe(200);
    expect(H.scored).toEqual([undefined]);
  });

  it('negative controls — the owner, a team admin and the solo user keep the session', async () => {
    for (const who of [ALICE, ADMIN]) {
      caller = who;
      await score('sess-alice');
    }
    caller = BOB;
    solo();
    await score('sess-alice');
    expect(H.scored).toEqual(['sess-alice', 'sess-alice', 'sess-alice']);
  });
});

/** The argument text of every `<callee>(` call in `source`, by balanced parentheses. */
function callArguments(source: string, callee: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(`${callee}(`, from);
    if (at < 0) return out;
    let depth = 0;
    let i = at + callee.length;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')' && --depth === 0) break;
    }
    out.push(source.slice(at + callee.length + 1, i));
    from = i;
  }
}

describe('source rules', () => {
  const read = (rel: string): string => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('the companion app binds every agent conversation it continues to the phone user', () => {
    const gateway = read('server/routes/app-gateway.ts');
    const calls = [
      ...callArguments(gateway, 'agentProcessor.processQuery'),
      ...callArguments(gateway, 'agentProcessor.processQueryStream'),
    ];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const args of calls) expect(args).toMatch(/requesterHash: `app:\$\{req\.appUser!\.id\}`/);
  });

  it('Code Studio records the signed-in user, not an untyped req.userId that nothing sets', () => {
    const large = read('server/routes/coding-large.ts');
    expect(large).not.toMatch(/\(req as any\)\.userId/);
  });
});
