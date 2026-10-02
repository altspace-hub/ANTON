/**
 * demo-run-collections.db.test.ts — a Work run that uses Knowledge Base
 * collections as a source (knowledgeSources.ragSearch, Mode 5b), on the public
 * demo (2026-10-02).
 *
 * The Knowledge Base is open to visitors, and its page tells them their
 * documents are searched by keyword only and are private to them. The run
 * path made neither true: routes/claude.ts searched with the configured
 * embedder (a visitor's question went to the embedding service the privacy
 * notice does not name), and it searched any collection id it was sent,
 * filtering only by document uploader — so a document of the visitor's that
 * sat in another visitor's collection came back.
 *
 * Now, for a visitor: the question is never embedded (the embedder spy never
 * sees it), the passages are found by keyword, and only the visitor's own
 * collections are searched (another visitor's collection id finds nothing,
 * not even the visitor's own document left in it).
 *
 * Negative control: an admin on the demo still has the question embedded and
 * still searches every collection named, every uploader's documents.
 *
 * Drives the real Work route on the test database; the model is a fake
 * OpenAI-compatible server that records what it was sent, and the embedder is
 * a spy.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http, { type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-run-collections';
});

// Every text the configured embedder is asked to embed.
const embedSpy = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  const fake = {
    provider: 'ollama' as const,
    model: 'fake-embed',
    dimensions: 4,
    embed: async (text: string) => { embedSpy.texts.push(text); return [0.1, 0.2, 0.3, 0.4]; },
    embedBatch: async (texts: string[]) => { embedSpy.texts.push(...texts); return texts.map(() => [0.1, 0.2, 0.3, 0.4]); },
  };
  return { ...actual, getEmbeddingAdapter: () => fake };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const tag = randomUUID().replace(/-/g, '').slice(0, 10);
const SLUG = `tcol${tag}`;
const MODEL = `compat:${SLUG}:fake-model`;
/** The word every passage and the question share, so keyword search finds them. */
const WORD = `zebrafish${tag}`;
const QUESTION = `What do my notes say about ${WORD} habitats?`;
const MARK = {
  aliceOwn: `ALICEOWN${tag}`,
  aliceStray: `ALICESTRAY${tag}`,
  bob: `BOBPASSAGE${tag}`,
};

function startFake(): Promise<{ server: Server; baseUrl: string; bodies: string[] }> {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      bodies.push(body);
      const parsed = JSON.parse(body || '{}') as { stream?: boolean };
      const usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 };
      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Answer ${tag}.` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, bodies }));
  });
}

d('collections as a run source on the public demo', () => {
  let db: DatabaseAdapter;
  let fake: Awaited<ReturnType<typeof startFake>>;
  let app: Server;
  let base = '';
  const sessions: string[] = [];
  const users = { alice: `u-col-alice-${tag}`, bob: `u-col-bob-${tag}`, admin: `u-col-admin-${tag}` };
  const COL = { alice: `kb-alice-${tag}`, bob: `kb-bob-${tag}` };
  const ENV = ['DEMO_MODE', 'DEMO_OFFERED_MODELS', 'DEMO_POST_ANSWER_CALLS', 'DEPLOYMENT_MODE'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])) as Record<(typeof ENV)[number], string | undefined>;
  let setDefault: (db: DatabaseAdapter, model: string | null) => Promise<unknown>;

  async function addDocument(collectionId: string, uploader: string, mark: string): Promise<void> {
    const docId = `doc-${mark}`;
    await db.run(
      `INSERT INTO rag_documents (id, collection_id, filename, file_path, file_type, file_size, chunk_count, uploaded_by, index_status, indexed_at)
       VALUES (?, ?, ?, ?, 'txt', 100, 1, ?, 'indexed', NOW())`,
      [docId, collectionId, `${mark}.txt`, `/nonexistent/${mark}.txt`, uploader],
    );
    await db.run(
      `INSERT INTO rag_chunks (id, document_id, chunk_index, content, chroma_id, metadata) VALUES (?, ?, 0, ?, ?, '{}')`,
      [`chunk-${mark}`, docId, `${mark}: the ${WORD} lives in shallow freshwater habitats.`, `chroma-${mark}`],
    );
  }

  beforeAll(async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_POST_ANSWER_CALLS = 'none';
    fake = await startFake();
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    await db.run(
      `INSERT INTO custom_model_endpoints (slug, display_name, base_url, default_model, enabled) VALUES (?, 'Fake', ?, 'fake-model', TRUE)`,
      [SLUG, fake.baseUrl],
    );
    for (const [kind, id] of Object.entries(users)) {
      await db.run(
        `INSERT INTO users (id, username, password_hash, role, monthly_token_budget) VALUES (?, ?, 'x', ?, 0)`,
        [id, `col_${kind}_${tag}`, kind === 'admin' ? 'admin' : 'analyst'],
      );
    }
    for (const [kind, id] of Object.entries(COL)) {
      await db.run(
        'INSERT INTO knowledge_collections (id, name, display_name, created_by) VALUES (?, ?, ?, ?)',
        [id, id, `${kind}'s notes`, users[kind as keyof typeof COL]],
      );
    }
    await addDocument(COL.alice, users.alice, MARK.aliceOwn);
    await addDocument(COL.bob, users.bob, MARK.bob);
    // A document of Alice's left in Bob's collection (data from before the
    // collection rules): naming Bob's collection must not reach it.
    await addDocument(COL.bob, users.alice, MARK.aliceStray);

    const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
    setRouterDb(db);
    const store = await import('../../server/services/default-model-store.js');
    setDefault = store.setPersistedDefaultModel as typeof setDefault;
    await setDefault(db, MODEL);
    const { createClaudeRoutes } = await import('../../server/routes/claude.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      const id = String(req.headers['x-test-user'] ?? '');
      req.user = { id, username: id, role: String(req.headers['x-test-role'] ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    e.use('/api', await createClaudeRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ['DEMO_MODE', 'DEMO_OFFERED_MODELS'] as const) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    embedSpy.texts.length = 0;
    fake.bodies.length = 0;
  });

  afterAll(async () => {
    for (const k of ['DEMO_POST_ANSWER_CALLS', 'DEPLOYMENT_MODE'] as const) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    await new Promise((r) => setTimeout(r, 1000));
    if (db) {
      await setDefault(db, null).catch(() => {});
      for (const s of sessions) {
        for (const t of ['llm_spend_ledger', 'session_snapshots', 'run_artifacts', 'workflow_outputs', 'quality_scores', 'audit_log', 'messages']) {
          await db.run(`DELETE FROM ${t} WHERE ${t === 'workflow_outputs' ? 'execution_id' : 'session_id'} = ?`, [s]).catch(() => {});
        }
        await db.run('DELETE FROM versions WHERE entity_id = ?', [s]).catch(() => {});
        await db.run('DELETE FROM sessions WHERE id = ?', [s]).catch(() => {});
      }
      await db.run('DELETE FROM knowledge_collections WHERE id IN (?, ?)', [COL.alice, COL.bob]).catch(() => {});
      for (const id of Object.values(users)) {
        for (const t of ['apprentice_profiles', 'audit_log', 'user_monthly_usage', 'llm_spend_ledger']) {
          await db.run(`DELETE FROM ${t} WHERE user_id = ?`, [id]).catch(() => {});
        }
        await db.run('DELETE FROM users WHERE id = ?', [id]).catch(() => {});
      }
      await db.run('DELETE FROM llm_spend_ledger WHERE model = ?', [MODEL]).catch(() => {});
      await db.run('DELETE FROM custom_model_endpoints WHERE slug = ?', [SLUG]).catch(() => {});
      const { setRouterDb } = await import('../../server/services/compat-endpoint.js');
      setRouterDb(null);
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
    await new Promise<void>((resolve) => { fake?.server.close(() => resolve()); });
  });

  function demo(): void {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_OFFERED_MODELS = MODEL;
  }

  /** One Open Chat run with the named collections as a source; answers the status and what the model was sent. */
  async function run(userId: string, role: string, collections: string[]): Promise<{ status: number; sent: string }> {
    const sessionId = randomUUID();
    sessions.push(sessionId);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'collections', '{}', ?)`, [sessionId, userId]);
    const res = await fetch(`${base}/api/claude/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': userId, 'x-test-role': role },
      body: JSON.stringify({
        userMessage: QUESTION,
        model: MODEL,
        sessionId,
        thinking: 'quick',
        systemPrompt: 'You help.',
        atomInjectionEnabled: false,
        knowledgeSources: {
          modes: { claudeKnowledge: { enabled: true, webSearchEnabled: false } },
          ragSearch: { enabled: true, collections, topK: 10, rerank: true, showRelevance: true },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const status = res.status;
    await res.text();
    return { status, sent: fake.bodies.join('\n') };
  }

  const embeddedTheQuestion = () => embedSpy.texts.some((t) => t.includes(WORD));

  it('a visitor\'s question is never embedded; their own passages are found by keyword', async () => {
    demo();
    const { status, sent } = await run(users.alice, 'analyst', [COL.alice]);
    expect(status).toBe(200);
    expect(sent).toContain(MARK.aliceOwn);
    expect(sent).toContain('keyword matching over your uploaded documents');
    expect(embeddedTheQuestion()).toBe(false);
  });

  it('another visitor\'s collection finds nothing — not their passages, not the visitor\'s own document left in it', async () => {
    demo();
    const { status, sent } = await run(users.alice, 'analyst', [COL.alice, COL.bob]);
    expect(status).toBe(200);
    expect(sent).toContain(MARK.aliceOwn);
    expect(sent).not.toContain(MARK.bob);
    expect(sent).not.toContain(MARK.aliceStray);
    expect(embeddedTheQuestion()).toBe(false);

    // Bob's collection alone: no passages at all.
    fake.bodies.length = 0;
    const only = await run(users.alice, 'analyst', [COL.bob]);
    expect(only.status).toBe(200);
    expect(only.sent).not.toContain('RETRIEVED KNOWLEDGE FROM KNOWLEDGE BASE');
    expect(only.sent).not.toContain(MARK.aliceStray);
    expect(only.sent).not.toContain(MARK.bob);
  });

  it('negative control: an admin on the demo has the question embedded and searches every collection named', async () => {
    demo();
    const { status, sent } = await run(users.admin, 'admin', [COL.alice, COL.bob]);
    expect(status).toBe(200);
    expect(embeddedTheQuestion()).toBe(true);
    for (const mark of Object.values(MARK)) expect(sent, mark).toContain(mark);
  });
});
