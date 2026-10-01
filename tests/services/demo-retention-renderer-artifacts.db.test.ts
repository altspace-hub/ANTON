/**
 * demo-retention-renderer-artifacts.db.test.ts — the Transform panel's files
 * go with the sessions they belong to (public showcase, 2026-10-01).
 *
 * A transform writes OUTPUT_DIR/renderer-artifacts/<session id>/<file>. The
 * rendered_artifacts rows cascade with the session, but the files stayed on
 * disk for ever: the account pass removed only uploads, and the export-file
 * pruning reads only OUTPUT_DIR's top level. Opening the panel to visitors
 * made that a broken retention promise. Here:
 *
 *   - the account pass removes an expired visitor's session directories, and
 *     leaves a current visitor's alone (negative control);
 *   - deleting one session (deleteSessionRows) removes its directory only;
 *   - the daily pruning removes an orphaned directory and a visitor's
 *     directory older than the TTL (with its rows), and keeps a fresh orphan
 *     and an administrator's old directory (negative controls);
 *   - an id that is not a plain session id never names a path.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const TAG = randomUUID().slice(0, 8);
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The passes' reference time. The account pass deletes every demo account
 * expired by then, in the whole test database, and other files run at the
 * same time (demo-retention.db.test.ts expires one an hour back). This
 * file's account expired ten days ago, so a reference five days back finds it
 * and leaves theirs alone.
 */
const FIVE_DAYS_AGO = () => new Date(Date.now() - 5 * DAY_MS);

d('demo retention removes Transform panel files', () => {
  let db: DatabaseAdapter;
  let outputDir: string;
  let uploadDir: string;
  const users: string[] = [];
  const sessions: string[] = [];
  const savedTtl = process.env.DEMO_ACCOUNT_TTL_DAYS;

  const artifactDir = (sessionId: string) => path.join(outputDir, 'renderer-artifacts', sessionId);

  /** A session's artifact directory with one file, optionally dated `ageMs` back. */
  function writeArtifact(sessionId: string, ageMs = 0): string {
    const dir = artifactDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'board-deck.pptx');
    fs.writeFileSync(file, 'deck');
    if (ageMs > 0) {
      const t = new Date(Date.now() - ageMs);
      fs.utimesSync(file, t, t);
      fs.utimesSync(dir, t, t);
    }
    return dir;
  }

  async function user(kind: string, role: string, expires: string): Promise<string> {
    const id = `u-art-${kind}-${TAG}`;
    users.push(id);
    await db.run(`INSERT INTO users (id, username, password_hash, role, demo_expires_at) VALUES (?, ?, 'x', ?, ${expires})`, id, id, role);
    return id;
  }

  async function session(kind: string, userId: string): Promise<string> {
    const id = `sess-art-${kind}-${TAG}`;
    sessions.push(id);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'transform', '{}', ?)`, id, userId);
    await db.run(
      `INSERT INTO rendered_artifacts (session_id, renderer_id, file_path, file_type, mime_type) VALUES (?, 'export-md', ?, 'md', 'text/markdown')`,
      id, `${id}/board-deck.pptx`,
    );
    return id;
  }

  beforeAll(async () => {
    process.env.DEMO_ACCOUNT_TTL_DAYS = '30';
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-art-out-'));
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-art-up-'));
  });

  afterAll(async () => {
    if (savedTtl === undefined) delete process.env.DEMO_ACCOUNT_TTL_DAYS; else process.env.DEMO_ACCOUNT_TTL_DAYS = savedTtl;
    if (db) {
      for (const s of sessions) {
        await db.run('DELETE FROM rendered_artifacts WHERE session_id = ?', s).catch(() => {});
        await db.run('DELETE FROM sessions WHERE id = ?', s).catch(() => {});
      }
      for (const u of users) await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
      await db.close();
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('the account pass removes an expired visitor\'s transform files and keeps a current visitor\'s', async () => {
    const expired = await user('expired', 'analyst', "NOW() - INTERVAL '10 days'");
    const current = await user('current', 'analyst', "NOW() + INTERVAL '10 days'");
    const gone = writeArtifact(await session('expired', expired));
    const kept = writeArtifact(await session('current', current));

    const { runDemoRetention } = await import('../../server/services/demo-retention.js');
    const result = await runDemoRetention(db, { uploadDir, outputDir, pruneTraces: false, sweepOrphans: false, now: FIVE_DAYS_AGO() });

    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(gone)).toBe(false);
    expect(result.rowsByTable['transform files']).toBeGreaterThanOrEqual(1);
    // Negative control: the visitor whose account has not expired keeps theirs.
    expect(fs.existsSync(kept)).toBe(true);
    expect((await db.get<{ c: number }>('SELECT COUNT(*)::int AS c FROM rendered_artifacts WHERE session_id = ?', `sess-art-current-${TAG}`))!.c).toBe(1);
  }, 30_000);

  it('deleting one session removes that session\'s directory only', async () => {
    const owner = await user('owner', 'analyst', "NOW() + INTERVAL '10 days'");
    const deleted = await session('deleted', owner);
    const sibling = await session('sibling', owner);
    const deletedDir = writeArtifact(deleted);
    const siblingDir = writeArtifact(sibling);

    const { deleteSessionRows } = await import('../../server/services/demo-retention.js');
    const r = await deleteSessionRows(db, deleted, { allSessionRows: false, outputDir });
    expect(r.rowsByTable['transform files']).toBe(1);
    expect(fs.existsSync(deletedDir)).toBe(false);
    expect(fs.existsSync(siblingDir)).toBe(true);
  });

  it('never turns an id that is not a plain session id into a path', async () => {
    const { removeSessionArtifactDir } = await import('../../server/services/demo-retention.js');
    const canary = path.join(outputDir, 'canary.txt');
    fs.writeFileSync(canary, 'stay');
    fs.mkdirSync(path.join(outputDir, 'renderer-artifacts'), { recursive: true });
    for (const id of ['..', '.', '', '../..', 'a/b', 'a\\..', '%2e%2e']) {
      expect(await removeSessionArtifactDir(outputDir, id), JSON.stringify(id)).toBe(false);
    }
    expect(fs.existsSync(canary)).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'renderer-artifacts'))).toBe(true);
  });

  it('the daily pruning removes orphaned and old visitor directories, and keeps a fresh orphan and an administrator\'s', async () => {
    const visitor = await user('old', 'analyst', "NOW() + INTERVAL '10 days'");
    const admin = await user('admin', 'admin', 'NULL');
    const oldVisitor = writeArtifact(await session('old', visitor), 40 * DAY_MS);
    const oldAdmin = writeArtifact(await session('admin', admin), 40 * DAY_MS);
    const freshVisitor = writeArtifact(await session('fresh', visitor));
    // Older than the orphan grace period, measured from the reference time.
    const oldOrphan = writeArtifact(`sess-art-orphan-${TAG}`, 6 * DAY_MS);
    const newOrphan = writeArtifact(`sess-art-neworphan-${TAG}`);

    const { runDemoRetention } = await import('../../server/services/demo-retention.js');
    const result = await runDemoRetention(db, { uploadDir, outputDir, pruneTraces: true, sweepOrphans: false, now: FIVE_DAYS_AGO() });

    expect(fs.existsSync(oldOrphan)).toBe(false);
    expect(fs.existsSync(oldVisitor)).toBe(false);
    expect((await db.get<{ c: number }>('SELECT COUNT(*)::int AS c FROM rendered_artifacts WHERE session_id = ?', `sess-art-old-${TAG}`))!.c).toBe(0);
    expect(result.rowsByTable['transform files (orphaned)']).toBeGreaterThanOrEqual(1);
    expect(result.rowsByTable['transform files (older than 30d)']).toBeGreaterThanOrEqual(1);
    // Negative controls: a transform still being written, a recent one, an administrator's.
    expect(fs.existsSync(newOrphan)).toBe(true);
    expect(fs.existsSync(freshVisitor)).toBe(true);
    expect(fs.existsSync(oldAdmin)).toBe(true);
    expect((await db.get<{ c: number }>('SELECT COUNT(*)::int AS c FROM rendered_artifacts WHERE session_id = ?', `sess-art-admin-${TAG}`))!.c).toBe(1);
  }, 30_000);
});
