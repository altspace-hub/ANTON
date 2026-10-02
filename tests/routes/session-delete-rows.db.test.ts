/**
 * session-delete-rows.db.test.ts — deleting a session takes the rows no
 * foreign key removes with it (privacy review of the public demo, G4 / F2),
 * and a demo visitor's review carries no name (L8).
 *
 * DELETE /api/sessions/:id deleted only the sessions row. The answer copies in
 * versions (entity_id = the session) and the answer embeddings (content_id = a
 * message id) became orphans nothing could reach — not even the account's
 * deletion, which finds them through the session. Now:
 *
 *   - every mode: the session's versions and answer embeddings go with it;
 *   - public demo: every row keyed by it goes too (scores, memory feedback,
 *     audit rows, ratings, sign-offs, its module output), the edited module
 *     prompt only its runs name, and the spend ledger loses the session id;
 *   - outside the demo those rows stay (negative control): the audit log and
 *     the learning signals are the instance owner's;
 *   - someone else's session: 404 and nothing is deleted.
 *
 * Drives the real sessions router on the test database. Skips without one.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID, randomBytes } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const TAG = randomUUID().slice(0, 8);

interface Seeded {
  session: string;
  message: string;
  prompt: string;
}

d('deleting a session (routes/sessions.ts)', () => {
  let db: DatabaseAdapter;
  let app: Server;
  let base = '';
  let hasLedger = false;
  const users = { owner: randomUUID(), other: randomUUID(), admin: randomUUID() };
  const seeded: Seeded[] = [];
  const savedDemo = process.env.DEMO_MODE;

  async function seed(userId: string): Promise<Seeded> {
    const s: Seeded = { session: randomUUID(), message: randomUUID(), prompt: randomBytes(8).toString('hex') };
    seeded.push(s);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'alert-investigation', 'delete me', ?, ?)`,
      s.session, JSON.stringify({ modulePromptVersionId: s.prompt }), userId);
    await db.run(`INSERT INTO messages (id, session_id, role, content, config_snapshot) VALUES (?, ?, 'assistant', 'an answer', ?)`,
      s.message, s.session, JSON.stringify({ model: 'x', modulePromptVersionId: s.prompt }));
    await db.run(`INSERT INTO system_prompts (id, module_id, version, content, content_hash, author) VALUES (?, ?, 1, 'edited', ?, 'user-override')`,
      s.prompt, `mod-${TAG}-${s.prompt}`, s.prompt);
    await db.run(`INSERT INTO versions (entity_type, entity_id, version_number, label, content, user_id) VALUES ('session', ?, 1, 'Auto v1', 'copy', ?), ('output', ?, 1, 'saved', 'copy', NULL)`,
      s.session, userId, s.session);
    await db.run(`INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension) VALUES (?, 'session_output', ?, 'answer head', '[]', 'm', 0)`,
      `emb-${s.message}`, s.message);
    await db.run(`INSERT INTO quality_scores (id, session_id, module_id, content_hash, score_overall) VALUES (?, ?, 'alert-investigation', 'h', 7)`, `qs-${s.session}`, s.session);
    await db.run(`INSERT INTO retrieval_feedback (session_id, atom_id, retrieval_method) VALUES (?, 'atom-x', 'hybrid')`, s.session);
    await db.run(`INSERT INTO audit_log (id, session_id, module_id, user_id, system_prompt_version_id) VALUES (?, ?, 'alert-investigation', ?, ?)`,
      `al-${s.session}`, s.session, userId, s.prompt);
    await db.run(`INSERT INTO output_feedback (id, session_id, module_id, rating, user_id) VALUES (?, ?, 'alert-investigation', 4, ?)`, `of-${s.session}`, s.session, userId);
    await db.run(
      `INSERT INTO workflow_outputs (id, execution_id, workflow_id, step_index, step_type, output_data, created_by, workflow_name, step_name)
       VALUES (?, ?, 'module:alert-investigation', 0, 'module_session', '"x"', ?, 'wf', 'step')`,
      `wo-${s.session}`, s.session, userId,
    );
    if (hasLedger) {
      await db.run(`INSERT INTO llm_spend_ledger (user_id, model, cost_usd, cost_source, session_id) VALUES (?, 'compat:x:y', 0.0042, 'usage.cost', ?)`, userId, s.session);
    }
    return s;
  }

  const n = async (sql: string, ...params: unknown[]): Promise<number> =>
    Number((await db.get<{ n: string | number }>(sql, ...params))?.n ?? 0);

  /** Rows keyed to the seeded session, per table. */
  async function counts(s: Seeded): Promise<Record<string, number>> {
    return {
      sessions: await n('SELECT COUNT(*) AS n FROM sessions WHERE id = ?', s.session),
      versions: await n('SELECT COUNT(*) AS n FROM versions WHERE entity_id = ?', s.session),
      embeddings: await n('SELECT COUNT(*) AS n FROM embeddings WHERE content_id = ?', s.message),
      quality_scores: await n('SELECT COUNT(*) AS n FROM quality_scores WHERE session_id = ?', s.session),
      retrieval_feedback: await n('SELECT COUNT(*) AS n FROM retrieval_feedback WHERE session_id = ?', s.session),
      audit_log: await n('SELECT COUNT(*) AS n FROM audit_log WHERE session_id = ?', s.session),
      output_feedback: await n('SELECT COUNT(*) AS n FROM output_feedback WHERE session_id = ?', s.session),
      workflow_outputs: await n('SELECT COUNT(*) AS n FROM workflow_outputs WHERE execution_id = ?', s.session),
      system_prompts: await n('SELECT COUNT(*) AS n FROM system_prompts WHERE id = ?', s.prompt),
    };
  }

  const as = (userId: string, role: string) => ({ 'x-test-user': userId, 'x-test-role': role, 'content-type': 'application/json' });

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    hasLedger = !!(await db.get("SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'llm_spend_ledger'"));
    for (const [kind, id] of Object.entries(users)) {
      await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', ?)`, id, `sdel_${kind}_${TAG}`, kind === 'admin' ? 'admin' : 'analyst');
    }
    const { createSessionRoutes } = await import('../../server/routes/sessions.js');
    const e = express();
    e.use(express.json());
    e.use((req: Request, _res: Response, next: NextFunction) => {
      const id = String(req.headers['x-test-user'] ?? '');
      (req as Request & { user?: { id: string; username: string; role: string } }).user = { id, username: id, role: String(req.headers['x-test-role'] ?? 'analyst') };
      next();
    });
    e.use('/api', await createSessionRoutes(db));
    await new Promise<void>((resolve) => { app = e.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    if (savedDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = savedDemo;
  });

  afterAll(async () => {
    if (db) {
      for (const s of seeded) {
        await db.run('DELETE FROM embeddings WHERE content_id = ?', s.message).catch(() => {});
        await db.run('DELETE FROM versions WHERE entity_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM quality_scores WHERE session_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM retrieval_feedback WHERE session_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM audit_log WHERE session_id = ? OR system_prompt_version_id = ?', s.session, s.prompt).catch(() => {});
        await db.run('DELETE FROM output_feedback WHERE session_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM workflow_outputs WHERE execution_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM sessions WHERE id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM system_prompts WHERE id = ?', s.prompt).catch(() => {});
      }
      for (const id of Object.values(users)) {
        if (hasLedger) await db.run('DELETE FROM llm_spend_ledger WHERE user_id = ?', id).catch(() => {});
        await db.run('DELETE FROM sessions WHERE user_id = ?', id).catch(() => {});
        await db.run('DELETE FROM users WHERE id = ?', id).catch(() => {});
      }
      await db.close();
    }
    await new Promise<void>((resolve) => { app?.close(() => resolve()); });
  });

  const del = (s: Seeded, userId: string, role: string) =>
    fetch(`${base}/api/sessions/${s.session}`, { method: 'DELETE', headers: as(userId, role) });

  it('outside the demo: the answer copies and embeddings go with the session; scores, feedback and audit rows stay', async () => {
    delete process.env.DEMO_MODE;
    const s = await seed(users.owner);
    const res = await del(s, users.owner, 'analyst');
    expect(res.status).toBe(200);
    const after = await counts(s);
    expect(after).toMatchObject({ sessions: 0, versions: 0, embeddings: 0 });
    // Negative control: the owner's audit log and learning signals are untouched.
    expect(after).toMatchObject({ quality_scores: 1, retrieval_feedback: 1, audit_log: 1, output_feedback: 1, workflow_outputs: 1, system_prompts: 1 });
  });

  it('on the demo: every row keyed by the session goes at once, and its edited prompt; the ledger keeps the spend without the session', async () => {
    process.env.DEMO_MODE = 'true';
    const s = await seed(users.owner);
    const res = await del(s, users.owner, 'analyst');
    expect(res.status).toBe(200);
    const after = await counts(s);
    for (const [table, count] of Object.entries(after)) expect(count, table).toBe(0);
    if (hasLedger) {
      expect(await n('SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE session_id = ?', s.session)).toBe(0);
      // The spend stays with its user: the per-user daily cap reads it.
      expect(await n('SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE user_id = ? AND session_id IS NULL AND cost_usd = 0.0042', users.owner)).toBeGreaterThanOrEqual(1);
    }
  });

  it('on the demo: an edited prompt another session\'s run also names stays', async () => {
    process.env.DEMO_MODE = 'true';
    const s = await seed(users.owner);
    const t = await seed(users.other);
    // The same text sent in two sessions resolves to one row (content-addressed).
    await db.run('UPDATE messages SET config_snapshot = ? WHERE id = ?', JSON.stringify({ modulePromptVersionId: s.prompt }), t.message);
    const res = await del(s, users.owner, 'analyst');
    expect(res.status).toBe(200);
    expect(await n('SELECT COUNT(*) AS n FROM system_prompts WHERE id = ?', s.prompt)).toBe(1);
    expect((await counts(s)).versions).toBe(0);
  });

  it('someone else\'s session: 404, and nothing of it is deleted', async () => {
    process.env.DEMO_MODE = 'true';
    const s = await seed(users.owner);
    const before = await counts(s);
    const res = await del(s, users.other, 'analyst');
    expect(res.status).toBe(404);
    expect(await counts(s)).toEqual(before);
    // Negative control: an administrator may delete it.
    expect((await del(s, users.admin, 'admin')).status).toBe(200);
    expect((await counts(s)).versions).toBe(0);
  });

  describe('review status (L8)', () => {
    const review = (s: Seeded, userId: string, role: string) =>
      fetch(`${base}/api/sessions/${s.session}/review-status`, {
        method: 'PATCH', headers: as(userId, role), body: JSON.stringify({ status: 'approved', reviewedBy: 'Jane Real-Name' }),
      });
    const reviewer = async (s: Seeded) => (await db.get<{ reviewed_by: string | null }>('SELECT reviewed_by FROM sessions WHERE id = ?', s.session))?.reviewed_by;

    it('on the demo a visitor\'s reviewer name is not stored', async () => {
      process.env.DEMO_MODE = 'true';
      const s = await seed(users.owner);
      const res = await review(s, users.owner, 'analyst');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, reviewedBy: null });
      expect(await reviewer(s)).toBeNull();
      expect((await db.get<{ review_status: string }>('SELECT review_status FROM sessions WHERE id = ?', s.session))?.review_status).toBe('approved');
    });

    it('negative controls: an administrator on the demo, and anyone outside it, keep the name', async () => {
      process.env.DEMO_MODE = 'true';
      const s = await seed(users.owner);
      expect((await review(s, users.admin, 'admin')).status).toBe(200);
      expect(await reviewer(s)).toBe('Jane Real-Name');

      delete process.env.DEMO_MODE;
      const t = await seed(users.owner);
      expect((await review(t, users.owner, 'analyst')).status).toBe(200);
      expect(await reviewer(t)).toBe('Jane Real-Name');
    });
  });
});
