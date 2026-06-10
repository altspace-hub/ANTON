/**
 * two-instance-harness.ts — in-process "two ANTON instances" for the A2A
 * verification ladder (update-plan item 3.5).
 *
 * Per instance, the harness provisions an ISOLATED PostgreSQL database
 * (cloned from the proven tests/helpers/markets-test-db.ts pattern), builds
 * a minimal Express app mounting ONLY the production route factories the
 * ladder exercises (community, p2p, agents, mission-delegation), and listens
 * on an ephemeral 127.0.0.1 port. We deliberately do NOT boot
 * server/index.ts — it starts crons, push, migrations and module-level
 * singletons that cannot run twice in one process.
 *
 * SAFETY CONTRACT (load-bearing — same as markets-test-db.ts):
 *   • NEVER write to the dev 'anton' database. Every connection that runs
 *     DDL first asserts current_database() equals the expected isolated DB
 *     name and that the name is not on the forbidden list.
 *   • The connection to the configured DATABASE_URL is used ONLY for
 *     cluster-level CREATE/DROP DATABASE.
 *   • If an isolated DB cannot be provisioned (no creds / no CREATEDB / PG
 *     down) the suite SKIPS with a reason — it never falls back to dev.
 *
 * Environment knobs set here (BEFORE any server module loads — which is why
 * every server import below is dynamic):
 *   • ENCRYPTION_KEY    — fixed test vault key so credential-vault never
 *     touches data/.vault-key. Both instances share the process key; that is
 *     fine because the key only encrypts each instance's own rows at rest.
 *   • ALLOW_PRIVATE_P2P — peer-transport's SSRF guard blocks 127.0.0.1
 *     endpoints by default; the two instances live on loopback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import type { DatabaseAdapter } from '../../server/db/database.js';

const { Client } = pg;

// ── Environment — must be set before the first dynamic server import ────────

// 64 hex chars — a fixed throwaway key for test-only at-rest encryption.
process.env.ENCRYPTION_KEY ??= 'a2a0c0de0000000000000000000000000000000000000000000000000000beef';
process.env.ALLOW_PRIVATE_P2P = 'true';

// ── Isolated database provisioning ───────────────────────────────────────────

/** Databases this harness refuses to run DDL against, ever. */
const FORBIDDEN_DB_NAMES = new Set(['anton', 'postgres', 'template0', 'template1']);

export interface A2AProvision {
  ok: boolean;
  reason?: string;
  adminUrl?: string;
  /** instance name → isolated database connection string */
  urls?: Record<string, string>;
  dbNames?: string[];
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function readBaseDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envText = fs.readFileSync(path.join(repoRoot(), '.env'), 'utf8');
    const m = envText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function dbNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function withDbName(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Hard gate before any DDL: must actually be on the expected isolated DB. */
async function assertSafeTarget(client: pg.Client, expectedDb: string): Promise<void> {
  if (FORBIDDEN_DB_NAMES.has(expectedDb)) {
    throw new Error(`refusing to run test DDL against forbidden database '${expectedDb}'`);
  }
  const r = await client.query('SELECT current_database() AS db');
  const actual = String(r.rows[0]?.db ?? '');
  if (actual !== expectedDb || FORBIDDEN_DB_NAMES.has(actual)) {
    throw new Error(
      `connected to '${actual}' but expected isolated test DB '${expectedDb}' — aborting before any write`,
    );
  }
}

async function applyFixtureSchema(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await assertSafeTarget(client, dbNameOf(url));
    const ddl = fs.readFileSync(path.join(repoRoot(), 'tests', 'fixtures', 'a2a-schema.sql'), 'utf8');
    await client.query(ddl);
  } finally {
    await client.end();
  }
}

/**
 * Drop + create one isolated database per instance name and apply the A2A
 * fixture schema. `dbSuffix` keeps parallel test FILES from colliding —
 * each file must use its own suffix.
 */
export async function provisionA2ADatabases(
  instanceNames: string[],
  dbSuffix: string,
): Promise<A2AProvision> {
  const baseUrl = readBaseDatabaseUrl();
  if (!baseUrl) {
    return { ok: false, reason: 'no DATABASE_URL in env or .env — cannot derive PG credentials' };
  }
  if (FORBIDDEN_DB_NAMES.has(dbSuffix)) {
    return { ok: false, reason: `invalid dbSuffix '${dbSuffix}'` };
  }

  const dbNames = instanceNames.map((n) => `anton_a2a_${dbSuffix}_${n}`.toLowerCase());
  for (const name of dbNames) {
    if (FORBIDDEN_DB_NAMES.has(name) || dbNameOf(baseUrl) === name) {
      return { ok: false, reason: `derived test DB name '${name}' is unsafe` };
    }
  }

  const admin = new Client({ connectionString: baseUrl });
  try {
    await admin.connect();
  } catch (err) {
    return { ok: false, reason: `cannot reach PostgreSQL: ${(err as Error).message}` };
  }
  try {
    // Cluster-level statements only — no table access on the dev DB.
    for (const name of dbNames) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${name}`);
    }
  } catch (err) {
    return {
      ok: false,
      reason: `cannot create A2A test databases (role may lack CREATEDB): ${(err as Error).message}`,
    };
  } finally {
    await admin.end();
  }

  const urls: Record<string, string> = {};
  for (let i = 0; i < instanceNames.length; i++) {
    const url = withDbName(baseUrl, dbNames[i]);
    try {
      await applyFixtureSchema(url);
    } catch (err) {
      return { ok: false, reason: `fixture DDL failed on ${dbNames[i]}: ${(err as Error).message}` };
    }
    urls[instanceNames[i]] = url;
  }
  return { ok: true, adminUrl: baseUrl, urls, dbNames };
}

export async function dropA2ADatabases(p: A2AProvision): Promise<void> {
  if (!p.ok || !p.adminUrl || !p.dbNames) return;
  const admin = new Client({ connectionString: p.adminUrl });
  await admin.connect();
  try {
    for (const name of p.dbNames) {
      if (FORBIDDEN_DB_NAMES.has(name)) continue;
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

// ── Instance ─────────────────────────────────────────────────────────────────

export interface InstanceIdentity {
  contactHash: string;
  displayName: string;
  /** Ed25519 public key, hex DER (community signing key). */
  publicKey: string;
  /** X25519 public key, hex DER (E2E encryption key). */
  x25519PublicKey: string;
}

export interface ApiResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface A2AInstance {
  name: string;
  db: DatabaseAdapter;
  dbUrl: string;
  baseUrl: string;
  port: number;
  /** The raw Express handler — used by the mesh rung's responder bridge. */
  expressHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  identity: InstanceIdentity;
  /** Call this instance's HTTP API (path starts with /api/…). */
  api(method: string, apiPath: string, body?: unknown): Promise<ApiResult>;
  /** Run one pass of the community message queue (outbound deliveries). */
  pumpQueue(): Promise<{ sent: number; failed: number; local: number }>;
  close(): Promise<void>;
}

function randomContactHash(): string {
  const hex = randomBytes(8).toString('hex').toUpperCase();
  return `ANTON-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/**
 * Boot one in-process instance: PG adapter + Express app with the production
 * route factories + activated community identity (Ed25519 + X25519 generated
 * server-side by the real /community/activate flow).
 */
export async function startInstance(name: string, dbUrl: string): Promise<A2AInstance> {
  // Dynamic imports keep all server-module evaluation AFTER the env setup at
  // the top of this file (credential-vault reads ENCRYPTION_KEY at load).
  const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
  const { default: express } = await import('express');
  const { createCommunityRoutes } = await import('../../server/routes/community.js');
  const { createP2PRoutes } = await import('../../server/routes/p2p.js');
  const { createAgentRoutes } = await import('../../server/routes/agents.js');
  const { createMissionDelegationRoutes } = await import('../../server/routes/mission-delegation.js');
  const { createMessageQueueService } = await import('../../server/services/message-queue-service.js');

  const db: DatabaseAdapter = new PostgresAdapter({ connectionString: dbUrl, maxConnections: 5 });

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', await createCommunityRoutes(db));
  app.use('/api', await createP2PRoutes(db));
  app.use('/api', await createAgentRoutes(db));
  app.use('/api', createMissionDelegationRoutes(db));

  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(method: string, apiPath: string, body?: unknown): Promise<ApiResult> {
    const res = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  }

  // Activate the community identity through the REAL route — this generates
  // and stores the Ed25519 signing keypair and the X25519 E2E keypair
  // (private keys encrypted at rest via credential-vault).
  const contactHash = randomContactHash();
  const displayName = `A2A ${name}`;
  const activate = await api('POST', '/api/community/activate', {
    display_name: displayName,
    contact_hash: contactHash,
    public_key: 'pending-server-generated',
  });
  if (activate.status !== 200 || !activate.body?.ok) {
    throw new Error(`[${name}] identity activation failed: HTTP ${activate.status} ${JSON.stringify(activate.body)}`);
  }
  const status = await api('GET', '/api/community/status');
  const identityRow = status.body?.identity as {
    contact_hash: string; display_name: string; public_key: string; x25519_public_key: string | null;
  } | null;
  if (!identityRow?.public_key || !identityRow.x25519_public_key) {
    throw new Error(`[${name}] identity missing keys after activation: ${JSON.stringify(status.body)}`);
  }

  const queue = await createMessageQueueService(db);

  return {
    name,
    db,
    dbUrl,
    baseUrl,
    port,
    expressHandler: app as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => void,
    identity: {
      contactHash: identityRow.contact_hash,
      displayName: identityRow.display_name,
      publicKey: identityRow.public_key,
      x25519PublicKey: identityRow.x25519_public_key,
    },
    api,
    pumpQueue: () => queue.processQueue(),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

/**
 * Rung 1 helper — exchange contact cards both ways through the production
 * POST /community/connections flow (pubkeys + X25519 keys + HTTP endpoints
 * pointing at each other's ephemeral port). Returns the connection ids.
 */
export async function pairInstances(a: A2AInstance, b: A2AInstance): Promise<{ aToB: string; bToA: string }> {
  const aRes = await a.api('POST', '/api/community/connections', {
    contact_hash: b.identity.contactHash,
    display_name: b.identity.displayName,
    public_key: b.identity.publicKey,
    x25519_public_key: b.identity.x25519PublicKey,
    endpoint: b.baseUrl,
  });
  if (aRes.status !== 200 || !aRes.body?.ok) {
    throw new Error(`pairing ${a.name}→${b.name} failed: ${JSON.stringify(aRes.body)}`);
  }
  const bRes = await b.api('POST', '/api/community/connections', {
    contact_hash: a.identity.contactHash,
    display_name: a.identity.displayName,
    public_key: a.identity.publicKey,
    x25519_public_key: a.identity.x25519PublicKey,
    endpoint: a.baseUrl,
  });
  if (bRes.status !== 200 || !bRes.body?.ok) {
    throw new Error(`pairing ${b.name}→${a.name} failed: ${JSON.stringify(bRes.body)}`);
  }
  return { aToB: String(aRes.body.id), bToA: String(bRes.body.id) };
}

/**
 * Rebuild the exact wire body message-queue-service.deliverMail() POSTs to
 * the peer's /api/p2p/receive for a queued mail. Used by the replay/tamper
 * rungs (the bytes must match what was really delivered) and by the mesh
 * rung (same payload routed over a different transport).
 *
 * Mirrors server/services/message-queue-service.ts deliverMail — if that
 * body shape changes, the replay test failing here is the signal.
 */
export async function buildWireBody(senderDb: DatabaseAdapter, mailId: string): Promise<string> {
  const mail = await senderDb.get<Record<string, unknown>>(
    'SELECT id, from_hash, to_hashes, subject, body, message_type, payload, payload_metadata, thread_id, parent_id FROM community_mail WHERE id = ?',
    mailId,
  );
  if (!mail) throw new Error(`mail not found on sender: ${mailId}`);
  const q = await senderDb.get<{ payload_encrypted: string | null }>(
    'SELECT payload_encrypted FROM community_message_queue WHERE mail_id = ? ORDER BY created_at DESC LIMIT 1',
    mailId,
  );
  const encryptedPayload = q?.payload_encrypted ?? null;
  const hasEncryption = !!encryptedPayload;
  return JSON.stringify({
    mailId: mail.id,
    fromHash: mail.from_hash,
    toHashes: mail.to_hashes,
    subject: hasEncryption ? '[encrypted]' : mail.subject,
    body: hasEncryption ? '[encrypted]' : mail.body,
    messageType: mail.message_type,
    payload: hasEncryption ? null : mail.payload,
    payloadMetadata: hasEncryption ? null : mail.payload_metadata,
    threadId: mail.thread_id,
    parentId: mail.parent_id,
    encryptedPayload: encryptedPayload ?? undefined,
  });
}
