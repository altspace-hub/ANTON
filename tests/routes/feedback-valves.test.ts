/**
 * feedback-valves.test.ts — Wave 3.3 feedback valves
 * (CORE_EXPERIENCE_REVIEW 2026-06): the two endpoints behind the
 * OutputToolbar footer.
 *
 *   POST /api/embeddings/feedback/bulk      — one tap rates ALL injected
 *                                             atoms of a session
 *                                             (retrieval_feedback.was_relevant)
 *   POST /api/quality/output-verdict        — 1-click Good output / Needs work
 *                                             (output_feedback.verdict +
 *                                             message_id, migration 226)
 *   GET  /api/quality/output-verdict/:sessionId — current "rated ✓" state
 *
 * No LLM is called anywhere on these paths. Requires DATABASE_URL (env or
 * .env) + migration 226; skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('Wave 3.3 feedback valves', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const sessionId = randomUUID();
  const olderAssistantId = randomUUID();
  const latestAssistantId = randomUUID();
  const atomIds = [`atom-a-${randomUUID().slice(0, 8)}`, `atom-b-${randomUUID().slice(0, 8)}`, `atom-c-${randomUUID().slice(0, 8)}`];

  beforeAll(async () => {
    // middleware/auth throws at import when JWT_SECRET is unset (solo dev envs).
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-feedback-valves';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createEmbeddingRoutes } = await import('../../server/routes/embeddings.js');
    const { createQualityRoutes } = await import('../../server/routes/quality.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    // Solo-mode user injection (what createAuthMiddleware does in solo mode).
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 'solo', username: 'solo', role: 'admin' };
      next();
    });
    app.use('/api/embeddings', await createEmbeddingRoutes(db));
    app.use('/api', await createQualityRoutes(db));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    // Seed: session + user→assistant→assistant + 3 injected-atom feedback rows.
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`,
      sessionId, 'gap-analysis', 'Feedback valves test', t(60_000), t(60_000));
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', 'Assess this.', ?)`,
      randomUUID(), sessionId, t(50_000));
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', 'First output.', ?)`,
      olderAssistantId, sessionId, t(40_000));
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', 'Latest output.', ?)`,
      latestAssistantId, sessionId, t(10_000));
    for (const atomId of atomIds) {
      await db.run(
        `INSERT INTO retrieval_feedback (session_id, atom_id, retrieval_method, retrieval_score) VALUES (?, ?, 'hybrid', 0.42)`,
        sessionId, atomId);
    }
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM output_feedback WHERE session_id = ?', sessionId);
      await db.run('DELETE FROM retrieval_feedback WHERE session_id = ?', sessionId);
      await db.run('DELETE FROM sessions WHERE id = ?', sessionId); // messages cascade
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  // ── Atom bulk-rate ─────────────────────────────────────────────────────────

  it('bulk 👍 rates ALL injected atoms of the session in one tap', async () => {
    const { status, json } = await post('/api/embeddings/feedback/bulk', { sessionId, wasRelevant: true });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(Number(json.updated)).toBe(atomIds.length);

    const rows = await db.all(
      'SELECT was_relevant FROM retrieval_feedback WHERE session_id = ?', sessionId,
    ) as Array<{ was_relevant: number | null }>;
    expect(rows).toHaveLength(atomIds.length);
    expect(rows.every((r) => Number(r.was_relevant) === 1)).toBe(true);
  });

  it('bulk 👎 overwrites the previous bulk rating', async () => {
    const { status, json } = await post('/api/embeddings/feedback/bulk', { sessionId, wasRelevant: false });
    expect(status).toBe(200);
    expect(Number(json.updated)).toBe(atomIds.length);
    const rows = await db.all(
      'SELECT was_relevant FROM retrieval_feedback WHERE session_id = ?', sessionId,
    ) as Array<{ was_relevant: number | null }>;
    expect(rows.every((r) => Number(r.was_relevant) === 0)).toBe(true);
  });

  it('bulk 400s on missing/invalid input', async () => {
    expect((await post('/api/embeddings/feedback/bulk', { sessionId })).status).toBe(400);
    expect((await post('/api/embeddings/feedback/bulk', { wasRelevant: true })).status).toBe(400);
    expect((await post('/api/embeddings/feedback/bulk', { sessionId, wasRelevant: 'yes' })).status).toBe(400);
  });

  // ── Finding #3: GET /feedback/:sessionId returns an ARRAY (was db.get → 500) ──

  it('GET /feedback/:sessionId returns injectedAtoms as an ARRAY the UI can iterate', async () => {
    const r = await fetch(`${base}/api/embeddings/feedback/${sessionId}`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { sessionId: string; injectedAtoms: unknown; total: number };
    // Pre-#3 this was db.get → a single object (or 500). The UI iterates the array.
    expect(Array.isArray(json.injectedAtoms)).toBe(true);
    expect((json.injectedAtoms as unknown[]).length).toBe(atomIds.length);
    expect(json.total).toBe(atomIds.length);
  });

  it('GET /feedback/:sessionId on an EMPTY session returns [] (no 500 from rows.length on undefined)', async () => {
    const emptySession = randomUUID();
    const r = await fetch(`${base}/api/embeddings/feedback/${emptySession}`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { injectedAtoms: unknown[]; total: number };
    expect(json.injectedAtoms).toEqual([]);
    expect(json.total).toBe(0);
  });

  // ── Output verdict ─────────────────────────────────────────────────────────

  it("verdict 'good' resolves the session's LATEST assistant message and writes verdict (rating stays NULL)", async () => {
    const { status, json } = await post('/api/quality/output-verdict', {
      sessionId, moduleId: 'gap-analysis', areaId: 'fcp', verdict: 'good',
    });
    expect(status).toBe(200);
    expect(json.verdict).toBe('good');
    expect(json.messageId).toBe(latestAssistantId);
    expect(json.updated).toBe(false);

    const row = await db.get(
      'SELECT session_id, message_id, module_id, area_id, verdict, rating FROM output_feedback WHERE message_id = ?',
      latestAssistantId,
    ) as Record<string, unknown>;
    expect(row.verdict).toBe('good');
    expect(row.rating).toBeNull();
    expect(row.session_id).toBe(sessionId);
    expect(row.module_id).toBe('gap-analysis');
    expect(row.area_id).toBe('fcp');
  });

  it('a second click toggles the verdict in place — no stacked rows', async () => {
    const { status, json } = await post('/api/quality/output-verdict', {
      sessionId, moduleId: 'gap-analysis', verdict: 'needs_work',
    });
    expect(status).toBe(200);
    expect(json.updated).toBe(true);

    const rows = await db.all(
      'SELECT verdict FROM output_feedback WHERE message_id = ?', latestAssistantId,
    ) as Array<{ verdict: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe('needs_work');
  });

  it('explicit messageId rates that exact output', async () => {
    const { status, json } = await post('/api/quality/output-verdict', {
      messageId: olderAssistantId, moduleId: 'gap-analysis', verdict: 'good',
    });
    expect(status).toBe(200);
    expect(json.messageId).toBe(olderAssistantId);
    const row = await db.get(
      'SELECT verdict, session_id FROM output_feedback WHERE message_id = ?', olderAssistantId,
    ) as { verdict: string; session_id: string };
    expect(row.verdict).toBe('good');
    expect(row.session_id).toBe(sessionId); // back-resolved from the message
  });

  it('GET returns the current rated state for the latest output', async () => {
    const r = await fetch(`${base}/api/quality/output-verdict/${sessionId}`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as Record<string, unknown>;
    expect(json.messageId).toBe(latestAssistantId);
    expect(json.verdict).toBe('needs_work');
  });

  it('verdict 400s on invalid verdict and missing identifiers', async () => {
    expect((await post('/api/quality/output-verdict', { sessionId, verdict: 'meh' })).status).toBe(400);
    expect((await post('/api/quality/output-verdict', { verdict: 'good' })).status).toBe(400);
  });

  it('verdict 404s when the session has no assistant output', async () => {
    const emptySession = randomUUID();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config) VALUES (?, 'gap-analysis', 'Empty', '{}')`, emptySession);
    try {
      const { status } = await post('/api/quality/output-verdict', { sessionId: emptySession, verdict: 'good' });
      expect(status).toBe(404);
    } finally {
      await db.run('DELETE FROM sessions WHERE id = ?', emptySession);
    }
  });
});
