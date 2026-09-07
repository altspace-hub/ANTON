/**
 * mission-credentials-ownership.test.ts — the credential vault, scoped to its owner.
 *
 * ── What was open ────────────────────────────────────────────────────────────
 *
 * mission-credential-vault.ts has taken a CredentialOwnerScope on every API-facing read
 * and write since it was written — getCredentialMeta, listCredentials, rotateCredential,
 * revokeCredential, listAccessLog — each defaulting to UNSCOPED. Not one route passed
 * it. So on a team install any authenticated user could list, inspect, rotate, revoke
 * and read the access log of everyone else's stored credentials: API keys, OAuth refresh
 * tokens, passwords.
 *
 * A complete scope API with no caller is the reason this survived a security pass. It
 * reads as done. These cases exist so it cannot read as done again without being it.
 *
 * ── The half that is easy to miss ────────────────────────────────────────────
 *
 * Scoping the reads alone would have been WORSE than leaving them open. createCredential
 * used to stamp created_by from resolveUserId(db), which ignores the request entirely —
 * it returns community_identity.user_id, else the 'solo'/'default' sentinel, else
 * whichever account sorts first by created_at. A non-admin would have created a
 * credential, had it attributed to somebody else, and lost sight of it immediately. So
 * the create-then-read round trip below is not a nicety; it is the case that proves the
 * two halves of the fix agree.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseAdapter } from '../../server/db/database.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return undefined;
  const m = readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
  return m ? m[1].trim() : undefined;
}

const DATABASE_URL = resolveDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('mission credential vault — cross-tenant access', () => {
  let db: DatabaseAdapter;
  let app: Express;
  let current: { id: string; role: string } | null = null;

  const alice = `u_test_alice_${randomUUID()}`;
  const bob = `u_test_bob_${randomUUID()}`;
  let bobsCredential = '';
  const created: string[] = [];

  let originalMode: string | undefined;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // credential_vault.created_by is NOT NULL with an FK to users(id).
    for (const [id, name] of [[alice, 'test-alice'], [bob, 'test-bob']]) {
      await db.run(
        'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
        id, `${name}-${id.slice(-8)}`, 'x', 'analyst');
    }

    const { createCredentialVault } = await import('../../server/services/missions/mission-credential-vault.js');
    // Seeded through the vault itself, so the row is encrypted exactly as production
    // writes it rather than by a hand-built INSERT that could drift from the schema.
    const vault = createCredentialVault(db);
    const bobs = await vault.createCredential(
      { name: 'bobs-key', credential_type: 'api_key', service_name: 'stripe', secret: 'sk_bob_secret' },
      bob);
    bobsCredential = bobs.id;
    created.push(bobsCredential);

    const routes = await import('../../server/routes/mission-credentials.js');
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (current) (req as unknown as { user: unknown }).user = current;
      next();
    });
    app.use('/api', routes.createMissionCredentialRoutes(db));
  });

  afterAll(async () => {
    for (const id of created) {
      await db.run('DELETE FROM missions.credential_access_log WHERE credential_id = ?', id).catch(() => {});
      await db.run('DELETE FROM missions.credential_vault WHERE id = ?', id).catch(() => {});
    }
    for (const u of [alice, bob]) {
      await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
    }
    await db.close();
  });

  beforeEach(() => { originalMode = process.env.DEPLOYMENT_MODE; process.env.DEPLOYMENT_MODE = 'team'; });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = originalMode;
  });

  async function call(method: string, path: string, as: { id: string; role: string } | null, body?: unknown) {
    current = as;
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as { port: number }).port;
    try {
      const sendsBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: sendsBody ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      return { status: res.status, body: parsed as Record<string, unknown> | null };
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  const ALICE = { id: alice, role: 'analyst' };
  const BOB = { id: bob, role: 'analyst' };
  const ADMIN = { id: 'root_test', role: 'admin' };

  // ── Reads ────────────────────────────────────────────────────────────────

  it('Alice\'s listing does not contain Bob\'s credential', async () => {
    const res = await call('GET', '/api/credentials', ALICE);
    expect(res.status).toBe(200);
    const ids = (res.body?.credentials as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(bobsCredential);
  });

  it('Alice cannot fetch Bob\'s credential by id', async () => {
    const res = await call('GET', `/api/credentials/${bobsCredential}`, ALICE);
    expect(res.status).toBe(404);
  });

  it('"not yours" and "no such credential" are indistinguishable', async () => {
    const notYours = await call('GET', `/api/credentials/${bobsCredential}`, ALICE);
    const noSuch = await call('GET', '/api/credentials/cred_does_not_exist', ALICE);
    expect(notYours.status).toBe(noSuch.status);
    expect(notYours.body).toEqual(noSuch.body);
  });

  it('Alice cannot read the access log of Bob\'s credential', async () => {
    const res = await call('GET', `/api/credentials/${bobsCredential}/access-log`, ALICE);
    expect((res.body?.access_log as unknown[]) ?? []).toEqual([]);
  });

  it('Bob still sees his own credential', async () => {
    const one = await call('GET', `/api/credentials/${bobsCredential}`, BOB);
    expect(one.status).toBe(200);
    const list = await call('GET', '/api/credentials', BOB);
    expect((list.body?.credentials as Array<{ id: string }>).map((c) => c.id)).toContain(bobsCredential);
  });

  // ── Writes, and that the refusal left the row alone ──────────────────────

  it('Alice cannot rotate Bob\'s credential, and his secret is untouched', async () => {
    const before = await db.get<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM missions.credential_vault WHERE id = ?', bobsCredential);
    const res = await call('POST', `/api/credentials/${bobsCredential}/rotate`, ALICE, { secret: 'sk_attacker' });
    expect(res.status).toBe(404);
    const after = await db.get<{ encrypted_data: string }>(
      'SELECT encrypted_data FROM missions.credential_vault WHERE id = ?', bobsCredential);
    expect(after?.encrypted_data, 'the secret was rewritten despite the 404').toBe(before?.encrypted_data);
  });

  it('Alice cannot revoke Bob\'s credential, and it stays active', async () => {
    const res = await call('DELETE', `/api/credentials/${bobsCredential}`, ALICE);
    expect(res.status).toBe(404);
    const row = await db.get<{ is_active: boolean }>(
      'SELECT is_active FROM missions.credential_vault WHERE id = ?', bobsCredential);
    expect(row?.is_active, 'the credential was revoked despite the 404').toBe(true);
  });

  // ── The owner stamp: the half that makes the scoping usable ──────────────

  it('a new credential is stamped with the CALLER, not the instance sentinel', async () => {
    // The defect that would have made scoped reads worse than no scoping at all:
    // resolveUserId(db) ignores the request and returns community_identity.user_id,
    // else 'solo'/'default', else whichever account sorts first by created_at.
    const res = await call('POST', '/api/credentials', ALICE, {
      name: 'alices-key', credential_type: 'api_key', secret: 'sk_alice',
    });
    expect(res.status).toBe(201);
    const id = (res.body?.credential as { id: string }).id;
    created.push(id);
    const row = await db.get<{ created_by: string }>(
      'SELECT created_by FROM missions.credential_vault WHERE id = ?', id);
    expect(row?.created_by).toBe(alice);
  });

  it('and Alice can read back what she just created', async () => {
    // The round trip. Scoping the reads without fixing the stamp would 404 here.
    const made = await call('POST', '/api/credentials', ALICE, {
      name: 'alices-second-key', credential_type: 'api_key', secret: 'sk_alice_2',
    });
    expect(made.status).toBe(201);
    const id = (made.body?.credential as { id: string }).id;
    created.push(id);
    const back = await call('GET', `/api/credentials/${id}`, ALICE);
    expect(back.status, 'Alice cannot see the credential she just created').toBe(200);
    // And it is hers alone.
    expect((await call('GET', `/api/credentials/${id}`, BOB)).status).toBe(404);
  });

  it('the secret never comes back out, for anyone', async () => {
    // Unchanged by this work, asserted because the scoping edits touched every read.
    const res = await call('GET', `/api/credentials/${bobsCredential}`, BOB);
    expect(JSON.stringify(res.body)).not.toContain('sk_bob_secret');
    const list = await call('GET', '/api/credentials', BOB);
    expect(JSON.stringify(list.body)).not.toContain('sk_bob_secret');
  });

  // ── The modes that must not change ───────────────────────────────────────

  it('an admin still sees every credential', async () => {
    const res = await call('GET', `/api/credentials/${bobsCredential}`, ADMIN);
    expect(res.status).toBe(200);
  });

  it('solo mode is unscoped — the operator reaches every credential', async () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const res = await call('GET', `/api/credentials/${bobsCredential}`, { id: 'solo', role: 'admin' });
    expect(res.status, 'the solo operator was locked out of their own vault').toBe(200);
  });

  it('an unidentified caller cannot create a credential with no owner', async () => {
    const res = await call('POST', '/api/credentials', null, {
      name: 'orphan', credential_type: 'api_key', secret: 'sk_orphan',
    });
    expect(res.status).not.toBe(201);
  });
});
