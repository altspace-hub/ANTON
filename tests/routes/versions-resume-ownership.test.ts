/**
 * versions-resume-ownership.test.ts — the two side doors around the sessions guard.
 *
 * `sessions.ts` scopes `GET /api/sessions/:id` to its owner. Two other routers read
 * and destroy the same material without going through it:
 *
 *   - `/api/versions/...` is a generic version store keyed on a caller-supplied
 *     entity_type/entity_id pair, or on an enumerable SERIAL primary key. It holds the
 *     saved assistant output of the session named by entity_id.
 *   - `/api/sessions/:sessionId/snapshots*` and `/resume-context` take :sessionId
 *     straight to the resume service; a snapshot carries the conversation summary,
 *     key decisions and resume context derived from the session's messages.
 *
 * Everything below runs against LIVE PostgreSQL, because both fixes are SQL predicates
 * and a recording fake would happily accept a query PostgreSQL rejects.
 *
 * The TEAM-mode block runs as a NON-ADMIN — the only configuration in which the guards
 * do anything (solo and admin short-circuit by design). Every refusal case is paired
 * with an owner case: a guard that blocks the owner is an outage, not a fix. The SOLO
 * block then proves the single operator is untouched, including on rows written before
 * migration 265 attributed anything (user_id IS NULL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Same resolver the other DB-backed route suites use: env first, then .env. */
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
const d = DATABASE_URL ? describe : describe.skip;

d('versions + session-resume do not bypass the sessions ownership guard', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: import('http').Server;
  let base = '';
  let originalMode: string | undefined;

  const ALICE = 'user-alice-' + randomUUID().slice(0, 8);
  const BOB = 'user-bob-' + randomUUID().slice(0, 8);

  const alicesSession = randomUUID();
  const bobsSession = randomUUID();

  let alicesVersionId = 0;
  let bobsVersionId = 0;
  let bobsSecondVersionId = 0;
  /** Pre-migration-265 row: no owner at all. Solo must still see it. */
  let legacyVersionId = 0;

  let alicesSnapshotId = '';
  let bobsSnapshotId = '';

  /** The caller identity for the next request — mutated per case. */
  let current: { id: string; username: string; role: string } = {
    id: ALICE, username: 'alice', role: 'analyst',
  };

  async function insertVersion(entityId: string, userId: string | null, label: string): Promise<number> {
    const row = await db.get<{ id: number }>(
      `INSERT INTO versions (entity_type, entity_id, version_number, label, content, user_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      'output', entityId, 1, label, 'CONFIDENTIAL BODY — ' + label, userId,
    );
    return Number(row!.id);
  }

  beforeAll(async () => {
    originalMode = process.env.DEPLOYMENT_MODE;

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    for (const [id, name] of [[ALICE, 'alice'], [BOB, 'bob']] as const) {
      await db.run(
        'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
        id, `${name}-${id}`, 'x', 'analyst',
      );
    }
    await db.run(
      'INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, ?, ?, ?)',
      alicesSession, 'test-module', "Alice's session", ALICE,
    );
    await db.run(
      'INSERT INTO sessions (id, module_id, title, user_id) VALUES (?, ?, ?, ?)',
      bobsSession, 'test-module', "Bob's session", BOB,
    );

    alicesVersionId = await insertVersion(alicesSession, ALICE, 'alice-v1');
    bobsVersionId = await insertVersion(bobsSession, BOB, 'bob-v1');
    // A second version number under the same entity so the diff route has two ids.
    bobsSecondVersionId = await db.get<{ id: number }>(
      `INSERT INTO versions (entity_type, entity_id, version_number, label, content, user_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      'output', bobsSession, 2, 'bob-v2', 'CONFIDENTIAL BODY — bob-v2', BOB,
    ).then((r) => Number(r!.id));
    legacyVersionId = await insertVersion('legacy-module-slug', null, 'legacy-v1');

    // session_snapshots is UNIQUE(session_id): one per session.
    alicesSnapshotId = randomUUID();
    bobsSnapshotId = randomUUID();
    for (const [snapId, sessId, owner] of [
      [alicesSnapshotId, alicesSession, ALICE],
      [bobsSnapshotId, bobsSession, BOB],
    ] as const) {
      await db.run(
        `INSERT INTO session_snapshots (id, session_id, snapshot_type, summary, user_id)
         VALUES (?, ?, ?, ?, ?)`,
        snapId, sessId, 'manual', `PRIVATE SUMMARY for ${owner}`, owner,
      );
    }

    const { createVersionsRoutes } = await import('../../server/routes/versions.js');
    const { createSessionResumeRoutes } = await import('../../server/routes/session-resume.js');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { user: typeof current }).user = current;
      next();
    });
    app.use('/api/versions', await createVersionsRoutes(db));
    app.use('/api', await createSessionResumeRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = originalMode;
    await db.run('DELETE FROM versions WHERE entity_id IN (?, ?, ?)',
      alicesSession, bobsSession, 'legacy-module-slug').catch(() => {});
    await db.run('DELETE FROM session_snapshots WHERE session_id IN (?, ?)', alicesSession, bobsSession).catch(() => {});
    await db.run('DELETE FROM sessions WHERE id IN (?, ?)', alicesSession, bobsSession).catch(() => {});
    await db.run('DELETE FROM users WHERE id IN (?, ?)', ALICE, BOB).catch(() => {});
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  // ── TEAM mode, non-admin ───────────────────────────────────────────────────
  describe('TEAM mode, role analyst', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'team';
      current = { id: ALICE, username: 'alice', role: 'analyst' };
    });

    it('lets Alice list the versions of her OWN session — blocking the owner would be an outage', async () => {
      const res = await fetch(`${base}/api/versions/output/${alicesSession}`);
      expect(res.status).toBe(200);
      const rows = await res.json() as Array<{ id: number }>;
      expect(rows.map((r) => r.id)).toContain(alicesVersionId);
    });

    it('hides BOB\'s saved output from the version list', async () => {
      const res = await fetch(`${base}/api/versions/output/${bobsSession}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('refuses BOB\'s version content by version number, with 404 not 403', async () => {
      const res = await fetch(`${base}/api/versions/output/${bobsSession}/1`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain('CONFIDENTIAL');
    });

    it('refuses the diff of BOB\'s two versions — the diff body echoes their content', async () => {
      const res = await fetch(`${base}/api/versions/diff?oldId=${bobsVersionId}&newId=${bobsSecondVersionId}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain('CONFIDENTIAL');
    });

    it('refuses DELETE of BOB\'s version by its enumerable SERIAL id, and the row survives', async () => {
      const res = await fetch(`${base}/api/versions/${bobsVersionId}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
      const still = await db.get('SELECT id FROM versions WHERE id = ?', String(bobsVersionId));
      expect(still).toBeTruthy();
    });

    it('still lets Alice delete her OWN version', async () => {
      const mine = await insertVersion(alicesSession, ALICE, 'alice-disposable');
      const res = await fetch(`${base}/api/versions/${mine}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(await db.get('SELECT id FROM versions WHERE id = ?', String(mine))).toBeUndefined();
    });

    it('stamps the caller as the owner on save, so the row is not unattributable', async () => {
      const res = await fetch(`${base}/api/versions/output/${alicesSession}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'freshly saved', label: 'stamped' }),
      });
      expect(res.status).toBe(200);
      const row = await db.get<{ user_id: string | null }>(
        'SELECT user_id FROM versions WHERE entity_id = ? AND label = ?', alicesSession, 'stamped',
      );
      expect(row?.user_id).toBe(ALICE);
    });

    it('refuses BOB\'s latest snapshot', async () => {
      const res = await fetch(`${base}/api/sessions/${bobsSession}/snapshots/latest`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain('PRIVATE SUMMARY');
    });

    it('refuses BOB\'s resume context — it is built from his messages', async () => {
      const res = await fetch(`${base}/api/sessions/${bobsSession}/resume-context`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain('PRIVATE SUMMARY');
    });

    it('refuses to list BOB\'s snapshots', async () => {
      const res = await fetch(`${base}/api/sessions/${bobsSession}/snapshots`);
      expect(res.status).toBe(404);
    });

    it('refuses to write a snapshot onto BOB\'s session', async () => {
      const res = await fetch(`${base}/api/sessions/${bobsSession}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'forged' }),
      });
      expect(res.status).toBe(404);
      const forged = await db.get('SELECT id FROM session_snapshots WHERE summary = ?', 'forged');
      expect(forged).toBeUndefined();
    });

    it('refuses to delete BOB\'s snapshot when it is paired with Alice\'s OWN session id', async () => {
      // The router.param gate passes — the session IS hers. Only the session_id
      // predicate inside the delete stops this.
      const res = await fetch(
        `${base}/api/sessions/${alicesSession}/snapshots/${bobsSnapshotId}`, { method: 'DELETE' },
      );
      expect(res.status).toBe(404);
      expect(await db.get('SELECT id FROM session_snapshots WHERE id = ?', bobsSnapshotId)).toBeTruthy();
    });

    it('still lets Alice read and delete her OWN snapshot', async () => {
      const list = await fetch(`${base}/api/sessions/${alicesSession}/snapshots`);
      expect(list.status).toBe(200);
      const body = await list.json() as { snapshots: Array<{ id: string }> };
      expect(body.snapshots.map((s) => s.id)).toContain(alicesSnapshotId);

      const del = await fetch(
        `${base}/api/sessions/${alicesSession}/snapshots/${alicesSnapshotId}`, { method: 'DELETE' },
      );
      expect(del.status).toBe(200);
      expect(await db.get('SELECT id FROM session_snapshots WHERE id = ?', alicesSnapshotId)).toBeUndefined();
      // Put it back for any later case.
      await db.run(
        `INSERT INTO session_snapshots (id, session_id, snapshot_type, summary, user_id)
         VALUES (?, ?, ?, ?, ?)`,
        alicesSnapshotId, alicesSession, 'manual', `PRIVATE SUMMARY for ${ALICE}`, ALICE,
      );
    });
  });

  // ── SOLO mode: the single operator must be untouched ───────────────────────
  describe('SOLO mode (default deployment)', () => {
    beforeEach(() => {
      delete process.env.DEPLOYMENT_MODE;
      current = { id: 'solo', username: 'solo', role: 'admin' };
    });

    it('reads a version attributed to somebody else', async () => {
      const res = await fetch(`${base}/api/versions/output/${bobsSession}`);
      expect(res.status).toBe(200);
      const rows = await res.json() as Array<{ id: number }>;
      expect(rows.map((r) => r.id)).toContain(bobsVersionId);
    });

    it('reads a pre-migration-265 version that has no owner at all', async () => {
      const res = await fetch(`${base}/api/versions/output/legacy-module-slug/1`);
      expect(res.status).toBe(200);
      expect((await res.json() as { content: string }).content).toContain('legacy-v1');
    });

    it('deletes an unattributed version — the operator is not locked out of their own history', async () => {
      const orphan = await insertVersion('legacy-module-slug', null, 'legacy-disposable');
      const res = await fetch(`${base}/api/versions/${orphan}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(await db.get('SELECT id FROM versions WHERE id = ?', String(orphan))).toBeUndefined();
    });

    it('reads any session\'s snapshots and resume context', async () => {
      const latest = await fetch(`${base}/api/sessions/${bobsSession}/snapshots/latest`);
      expect(latest.status).toBe(200);
      const ctx = await fetch(`${base}/api/sessions/${bobsSession}/resume-context`);
      expect(ctx.status).toBe(200);
      expect((await ctx.json() as { context: string }).context).toContain('PRIVATE SUMMARY');
    });

    it('still 404s a session that genuinely does not exist, so behaviour does not fork by mode', async () => {
      const res = await fetch(`${base}/api/sessions/${randomUUID()}/snapshots`);
      expect(res.status).toBe(404);
    });
  });
});
