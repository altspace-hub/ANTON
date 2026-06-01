/**
 * terminals-endpoints.test.ts — POST /v1/terminals/publish + GET
 * /v1/terminals/:companyAddr round-trip against a real RelayServer + Postgres.
 *
 * Skips when RELAY_REGISTRY_TEST_DATABASE_URL is unset (same pattern as
 * registry-endpoints.test.ts) so CI without a provisioned DB still passes.
 * Run locally with a DEDICATED database — the beforeAll drops the relay's
 * registry tables, so NEVER point this at the ANTON app DB:
 *
 *   RELAY_REGISTRY_TEST_DATABASE_URL=postgres://anton:anton_dev@localhost:5432/relay_reg_test \
 *     npx vitest run --config vitest.config.ts tests/terminals-endpoints.test.ts
 *
 * This proves migration 002_terminal_certs.sql + the terminals handlers work
 * end-to-end BEFORE the relay is deployed to Bahnhof.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import { Pool } from 'pg';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { RelayServer } from '../src/server.js';
import { createAuditLogger } from '../src/audit.js';
import { runMigrations } from '../src/registry/migrate.js';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

const DB_URL = process.env.RELAY_REGISTRY_TEST_DATABASE_URL;
const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

function hex(b: Uint8Array): string { let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return s; }

/** Mirror of the app's certDigest (sorted-keys JSON + domain tag + sha256). */
function certDigest(unsigned: Record<string, unknown>): Uint8Array {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(unsigned).sort()) sorted[k] = unsigned[k];
  return sha256(new TextEncoder().encode('anton-terminal-cert|v1|' + JSON.stringify(sorted)));
}

/** Build + sign a cert the way ANTON Business signs it. */
function signCert(priv: Uint8Array, over: Record<string, unknown> = {}) {
  const unsigned = {
    v: 1,
    companyPub: hex(ed25519.getPublicKey(priv)),
    companyAddr: 'fc_Company11111111111111111111111',
    terminalPub: 'aa'.repeat(32),
    label: 'Till 1',
    issuedAt: 1_700_000_000_000,
    ...over,
  };
  return { ...unsigned, sig: hex(ed25519.sign(certDigest(unsigned), priv)) };
}

let server: RelayServer;
let port: number;
let pool: Pool;

beforeAll(async () => {
  if (!DB_URL) return;
  process.env.RELAY_REGISTRY_DATABASE_URL = DB_URL;
  pool = new Pool({ connectionString: DB_URL });
  // Start clean: drop the relay registry tables (incl. terminal_certs) only.
  await pool.query(
    'DROP TABLE IF EXISTS terminal_certs, portals, portal_submissions, kyc_submissions, reserved_names, schema_migrations CASCADE',
  );
  await runMigrations({ databaseUrl: DB_URL });
  server = new RelayServer({
    ownUrl: 'ws://127.0.0.1:1', port: 0, host: '127.0.0.1', insecure: true,
    drainIntervalMs: 0, audit: createAuditLogger(sinkStream),
  });
  await server.start();
  port = server.actualPort();
}, 30_000);

afterAll(async () => {
  if (!DB_URL) return;
  await server?.stop();
  await pool?.end();
  delete process.env.RELAY_REGISTRY_DATABASE_URL;
});

const base = () => `http://127.0.0.1:${port}`;
async function publish(cert: unknown) {
  return fetch(`${base()}/v1/terminals/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cert }),
  });
}
async function list(addr: string) {
  return fetch(`${base()}/v1/terminals/${encodeURIComponent(addr)}`);
}

const maybe = DB_URL ? describe : describe.skip;

maybe('relay /v1/terminals round-trip', () => {
  it('publishes a signed cert and lists it back', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const companyAddr = 'fc_RoundTrip1111111111111111111111';
    const cert = signCert(priv, { companyAddr, terminalPub: 'aa'.repeat(32), label: 'Main bar till' });

    const pub = await publish(cert);
    expect(pub.status).toBe(201);
    const pubBody = await pub.json();
    expect(pubBody.ok).toBe(true);
    expect(pubBody.companyAddr).toBe(companyAddr);

    const res = await list(companyAddr);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companyAddr).toBe(companyAddr);
    expect(body.terminals).toHaveLength(1);
    expect(body.terminals[0].terminalPub).toBe('aa'.repeat(32));
    expect(body.terminals[0].sig).toBe(cert.sig); // stored cert round-trips byte-for-byte
  });

  it('upserts on the same (company, terminal) — relabel, no dupe', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const companyAddr = 'fc_Upsert111111111111111111111111';
    expect((await publish(signCert(priv, { companyAddr, terminalPub: 'cc'.repeat(32), label: 'Old name' }))).status).toBe(201);
    expect((await publish(signCert(priv, { companyAddr, terminalPub: 'cc'.repeat(32), label: 'New name' }))).status).toBe(201);
    const body = await (await list(companyAddr)).json();
    expect(body.terminals).toHaveLength(1);
    expect(body.terminals[0].label).toBe('New name');
  });

  it('rejects a tampered cert with 400 invalid_signature', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const cert = signCert(priv, { companyAddr: 'fc_Tamper11111111111111111111111' });
    const tampered = { ...cert, label: 'Hacked label' }; // sig no longer matches the digest
    const res = await publish(tampered);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_signature');
  });

  it('returns [] for a company with no tills', async () => {
    const res = await list('fc_Empty11111111111111111111111111');
    expect(res.status).toBe(200);
    expect((await res.json()).terminals).toEqual([]);
  });
});
