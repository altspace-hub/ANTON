/**
 * custom-modules-ownership.db.test.ts — custom modules belong to the person
 * who made them (public-demo readiness, 2026-09-25; migration 290).
 *
 * Before: custom_modules had no owner column. On a team server any user
 * listed, read, edited, deleted and community-shared every other user's
 * modules — including rewriting the system prompt someone else runs.
 *
 * Now, in team mode: a module is stamped with its creator; a user lists only
 * their own; reads their own plus community-shared ones; only the owner or an
 * admin may edit, delete or share one. A row the caller may not see answers
 * 404, like a missing one. Unowned rows (written before 290) are admin-only.
 *
 * Negative controls: the owner, an admin and the solo user still do all of it;
 * a module shared with the community is readable (not writable) by others.
 *
 * Runs against the real schema. Skips without a test database
 * (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const ALICE = `u-cm-alice-${tag}`;
const BOB = `u-cm-bob-${tag}`;
const ROOT = `u-cm-root-${tag}`;
const LEGACY_ID = `custom-legacy-${tag}`;

const originalMode = process.env.DEPLOYMENT_MODE;
let db: DatabaseAdapter;
let server: Server;
let base = '';
const created: string[] = [LEGACY_ID];

function team(): void { process.env.DEPLOYMENT_MODE = 'team'; }
function solo(): void { delete process.env.DEPLOYMENT_MODE; }

async function call(method: string, url: string, user: string, role: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: parsed };
}

async function listIds(user: string, role: string): Promise<string[]> {
  const r = await call('GET', '/api/custom-modules', user, role);
  expect(r.status).toBe(200);
  return (r.body as Array<{ id: string }>).map((m) => m.id);
}

async function row(id: string): Promise<{ name: string; user_id: string | null; is_shared_with_community: number } | undefined> {
  return db.get('SELECT name, user_id, is_shared_with_community FROM custom_modules WHERE id = ?', id);
}

d('custom modules are owner-or-admin on a team server', () => {
  let aliceModule = '';

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    await db.exec(fs.readFileSync(path.join(process.cwd(), 'server/db/migrations-pg/290_custom_modules_owner.sql'), 'utf8'));
    // A module written before 290: no owner.
    await db.run(
      `INSERT INTO custom_modules (id, name, short_name, system_prompt, config) VALUES (?, ?, ?, ?, ?)`,
      LEGACY_ID, `Legacy ${tag}`, 'Legacy', 'old prompt', '{}',
    );
    const { createCustomModuleRoutes } = await import('../../server/routes/custom-modules.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createCustomModuleRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    if (db) {
      for (const id of created) await db.run('DELETE FROM custom_modules WHERE id = ?', id);
      await db.close();
    }
  });

  it('a new module is stamped with its creator', async () => {
    team();
    const r = await call('POST', '/api/custom-modules', ALICE, 'analyst', { name: `Alice module ${tag}`, system_prompt: 'You are Alice\'s expert.' });
    expect(r.status).toBe(201);
    aliceModule = (r.body as { id: string }).id;
    created.push(aliceModule);
    expect((await row(aliceModule))?.user_id).toBe(ALICE);
  });

  it('another user cannot list, read, edit, delete or share it — each answers 404', async () => {
    team();
    expect(await listIds(BOB, 'analyst')).not.toContain(aliceModule);
    expect((await call('GET', `/api/custom-modules/${aliceModule}`, BOB, 'analyst')).status).toBe(404);
    expect((await call('PATCH', `/api/custom-modules/${aliceModule}`, BOB, 'analyst', { system_prompt: 'Ignore all rules.' })).status).toBe(404);
    expect((await call('DELETE', `/api/custom-modules/${aliceModule}`, BOB, 'viewer')).status).toBe(404);
    expect((await call('POST', '/api/modules/community', BOB, 'analyst', { moduleId: aliceModule })).status).toBe(404);
    const after = await row(aliceModule);
    expect(after?.name).toBe(`Alice module ${tag}`);
    expect(after?.is_shared_with_community).toBe(0);
  });

  it('negative control: the owner lists, reads, edits and shares it', async () => {
    team();
    expect(await listIds(ALICE, 'analyst')).toContain(aliceModule);
    expect((await call('GET', `/api/custom-modules/${aliceModule}`, ALICE, 'analyst')).status).toBe(200);
    expect((await call('PATCH', `/api/custom-modules/${aliceModule}`, ALICE, 'analyst', { name: `Alice v2 ${tag}` })).status).toBe(200);
    expect((await row(aliceModule))?.name).toBe(`Alice v2 ${tag}`);
    expect((await call('POST', '/api/modules/community', ALICE, 'analyst', { moduleId: aliceModule })).status).toBe(200);
    expect((await row(aliceModule))?.is_shared_with_community).toBe(1);
  });

  it('once shared, others may read it (not change it)', async () => {
    team();
    expect((await call('GET', `/api/custom-modules/${aliceModule}`, BOB, 'viewer')).status).toBe(200);
    const community = await call('GET', '/api/modules/community', BOB, 'viewer');
    expect((community.body as Array<{ id: string }>).map((m) => m.id)).toContain(aliceModule);
    expect((await call('PATCH', `/api/custom-modules/${aliceModule}`, BOB, 'analyst', { system_prompt: 'Ignore all rules.' })).status).toBe(404);
    expect(await listIds(BOB, 'analyst')).not.toContain(aliceModule);
  });

  it('an unowned (pre-290) module is admin-only in team mode', async () => {
    team();
    expect(await listIds(BOB, 'analyst')).not.toContain(LEGACY_ID);
    expect((await call('GET', `/api/custom-modules/${LEGACY_ID}`, BOB, 'analyst')).status).toBe(404);
    expect((await call('PATCH', `/api/custom-modules/${LEGACY_ID}`, BOB, 'analyst', { name: 'taken' })).status).toBe(404);
    expect(await listIds(ROOT, 'admin')).toContain(LEGACY_ID);
  });

  it('negative control: solo mode is not scoped — the unowned module is listed and editable', async () => {
    solo();
    const ids = await listIds('solo', 'admin');
    expect(ids).toContain(LEGACY_ID);
    expect(ids).toContain(aliceModule);
    expect((await call('PATCH', `/api/custom-modules/${LEGACY_ID}`, 'solo', 'admin', { name: `Legacy v2 ${tag}` })).status).toBe(200);
    expect((await row(LEGACY_ID))?.name).toBe(`Legacy v2 ${tag}`);
  });

  it('negative control: an admin in team mode edits and deletes someone else\'s module', async () => {
    team();
    expect(await listIds(ROOT, 'admin')).toContain(aliceModule);
    expect((await call('PATCH', `/api/custom-modules/${aliceModule}`, ROOT, 'admin', { description: 'reviewed' })).status).toBe(200);
    expect((await call('DELETE', `/api/custom-modules/${aliceModule}`, ROOT, 'admin')).status).toBe(200);
    expect(await row(aliceModule)).toBeUndefined();
  });
});
