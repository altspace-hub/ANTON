/**
 * registry-admin.test.ts — Step 9 end-to-end coverage of the operator
 * endpoints. Covers JWT auth + list/detail/approve/reject + the
 * descriptor → search-index pipeline (an approval must immediately
 * make the portal findable via the public search endpoint).
 *
 * Same skip-if-no-DB pattern as registry-endpoints.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { Pool } from 'pg';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { canonify } from '@truestamp/canonify';
import { RelayServer } from '../src/server.js';
import { createAuditLogger } from '../src/audit.js';
import { runMigrations } from '../src/registry/migrate.js';
import { deriveContactHash } from '../src/registry/verify.js';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

const DB_URL = process.env.RELAY_REGISTRY_TEST_DATABASE_URL;
const TEST_PASSWORD = 'test-operator-password-12345';
const TEST_SECRET = 'test-jwt-signing-secret-bytes-32xx';

const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });
let server: RelayServer;
let port: number;
let pool: Pool;

beforeAll(async () => {
  if (!DB_URL) return;
  process.env.RELAY_REGISTRY_DATABASE_URL = DB_URL;
  process.env.RELAY_OPERATOR_PASSWORD = TEST_PASSWORD;
  process.env.RELAY_OPERATOR_JWT_SECRET = TEST_SECRET;

  pool = new Pool({ connectionString: DB_URL });
  await pool.query('DROP TABLE IF EXISTS portals, portal_submissions, kyc_submissions, reserved_names, schema_migrations CASCADE');
  await runMigrations({ databaseUrl: DB_URL });

  let tempPort: number;
  {
    const t = new RelayServer({
      ownUrl: 'ws://127.0.0.1:1', port: 0, host: '127.0.0.1', insecure: true,
      drainIntervalMs: 0, audit: createAuditLogger(sinkStream),
    });
    await t.start();
    tempPort = t.actualPort();
    await t.stop();
  }
  server = new RelayServer({
    ownUrl: `ws://127.0.0.1:${tempPort}`,
    port: tempPort, host: '127.0.0.1', insecure: true,
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
  delete process.env.RELAY_OPERATOR_PASSWORD;
  delete process.env.RELAY_OPERATOR_JWT_SECRET;
});

beforeEach(async () => {
  if (!DB_URL) return;
  await pool.query('TRUNCATE portals, portal_submissions, kyc_submissions, reserved_names RESTART IDENTITY CASCADE');
});

// ── Helpers ──────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  let s = ''; for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0'); return s;
}
function bytesToB64Url(b: Uint8Array): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function freshIdentity(): Promise<{ privHex: string; pubHex: string; hash: string }> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const pubHex = bytesToHex(pub);
  const hash = deriveContactHash(pubHex);
  if (!hash) throw new Error('hash null');
  return { privHex: bytesToHex(priv), pubHex, hash };
}
async function signDescriptor(d: unknown, privHex: string): Promise<string> {
  const canonical = canonify(d);
  if (!canonical) throw new Error('canonical null');
  const sig = await ed25519.signAsync(new TextEncoder().encode(canonical),
    Uint8Array.from(Buffer.from(privHex, 'hex')));
  return bytesToB64Url(sig);
}
async function submitOnce(name: string, descriptorOverrides: Record<string, unknown> = {}): Promise<string> {
  const id = await freshIdentity();
  const descriptor = {
    name, namespace: 'global',
    displayTitle: `Title for ${name}`,
    description: 'A test portal.',
    category: 'personal',
    capabilities: [{ verb: 'contact', tags: ['test'] }],
    ...descriptorOverrides,
  };
  const sig = await signDescriptor(descriptor, id.privHex);
  const res = await fetch(`http://127.0.0.1:${port}/v1/portals/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      proposedName: name, proposedNamespace: 'global',
      signingPubkeyHex: id.pubHex, submitterContactHash: id.hash,
      descriptorJson: descriptor, descriptorSignature: sig,
      kyc: {
        legalName: 'Test', idDocumentType: 'national_id',
        idDocumentNumber: 'DOC-' + name, idDocumentCountry: 'SE',
        contactEmail: 't@example.com',
        addressCountry: 'SE', addressCity: 'Stockholm', addressStreet: '1',
      },
    }),
  });
  expect(res.status).toBe(201);
  const j = await res.json() as { submissionId: string };
  return j.submissionId;
}

async function login(operatorId = 'op-tester'): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/v1/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: TEST_PASSWORD, operatorId }),
  });
  expect(res.status).toBe(200);
  const j = await res.json() as { token: string };
  return j.token;
}

async function adminGet(path: string, token: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: `Bearer ${token}` } });
}
async function adminPost(path: string, token: string, body: unknown = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe.skipIf(!DB_URL)('POST /v1/admin/login', () => {
  it('returns a token on correct password', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD, operatorId: 'op-test' }),
    });
    expect(res.status).toBe(200);
    const j = await res.json() as { token: string; expiresAt: string };
    expect(j.token.split('.').length).toBe(3);
    expect(new Date(j.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('401s on wrong password', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/admin/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'WRONG', operatorId: 'op-test' }),
    });
    expect(res.status).toBe(401);
  });

  it('400s on missing/malformed operatorId', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/admin/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD, operatorId: 'Bad ID!' }),
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!DB_URL)('admin auth gate', () => {
  it('401s on /v1/admin/submissions without a token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/admin/submissions`);
    expect(res.status).toBe(401);
  });
  it('401s on a tampered token', async () => {
    const token = await login();
    const tampered = token.slice(0, -3) + 'AAA';
    const res = await adminGet('/v1/admin/submissions', tampered);
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!DB_URL)('GET /v1/admin/submissions', () => {
  it('lists pending submissions with total count', async () => {
    await submitOnce('portal-a');
    await submitOnce('portal-b');
    const token = await login();
    const res = await adminGet('/v1/admin/submissions?status=pending', token);
    expect(res.status).toBe(200);
    const j = await res.json() as { submissions: { proposedName: string }[]; total: number };
    expect(j.total).toBe(2);
    expect(j.submissions.map((s) => s.proposedName).sort()).toEqual(['portal-a', 'portal-b']);
  });

  it('honours limit + offset', async () => {
    // Names must be ≥3 chars per the validator regex, so use a longer prefix.
    for (let i = 0; i < 5; i++) await submitOnce(`portal-${i}`);
    const token = await login();
    const res = await adminGet('/v1/admin/submissions?limit=2&offset=2', token);
    const j = await res.json() as { submissions: unknown[]; total: number };
    expect(j.total).toBe(5);
    expect(j.submissions.length).toBe(2);
  });

  it('rejects invalid status filter with 400', async () => {
    const token = await login();
    const res = await adminGet('/v1/admin/submissions?status=invalid', token);
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!DB_URL)('GET /v1/admin/submissions/:id', () => {
  it('returns the full record including KYC fields', async () => {
    const subId = await submitOnce('with-kyc');
    const token = await login();
    const res = await adminGet(`/v1/admin/submissions/${subId}`, token);
    expect(res.status).toBe(200);
    const j = await res.json() as { kyc: { legalName: string } | null; descriptor: { name: string } };
    expect(j.kyc?.legalName).toBe('Test');
    expect(j.descriptor.name).toBe('with-kyc');
  });
});

describe.skipIf(!DB_URL)('POST /v1/admin/submissions/:id/approve', () => {
  it('moves pending → approved and makes the portal searchable', async () => {
    const subId = await submitOnce('to-approve', {
      displayTitle: 'Approvable Portal', description: 'Fixed string for search.',
      capabilities: [{ verb: 'book', tags: ['service'] }],
    });
    const token = await login();
    const approveRes = await adminPost(`/v1/admin/submissions/${subId}/approve`, token, { internalNotes: 'lgtm' });
    expect(approveRes.status).toBe(200);
    const j = await approveRes.json() as { approved: boolean; portalAddress: string; approvedBy: string };
    expect(j.approved).toBe(true);
    expect(j.portalAddress).toBe('to-approve.global');
    expect(j.approvedBy).toBe('op-tester');

    // Verify search picks it up.
    const searchRes = await fetch(`http://127.0.0.1:${port}/v1/portals/search?text=approvable`);
    const sJson = await searchRes.json() as { results: { portalAddress: string }[]; total: number };
    expect(sJson.total).toBe(1);
    expect(sJson.results[0]!.portalAddress).toBe('to-approve.global');

    // Verify capability_summary was extracted from the descriptor.
    const verbsRes = await fetch(`http://127.0.0.1:${port}/v1/portals/search?verbs=book`);
    const vJson = await verbsRes.json() as { total: number };
    expect(vJson.total).toBe(1);

    // Verify submission status now reports approved + portalAddress.
    const statusRes = await fetch(`http://127.0.0.1:${port}/v1/portals/submissions/${subId}/status`);
    const stJson = await statusRes.json() as { status: string; portalAddress: string | null };
    expect(stJson.status).toBe('approved');
    expect(stJson.portalAddress).toBe('to-approve.global');
  });

  it('refuses to approve twice (status is already approved)', async () => {
    const subId = await submitOnce('once-only');
    const token = await login();
    const first = await adminPost(`/v1/admin/submissions/${subId}/approve`, token);
    expect(first.status).toBe(200);
    const second = await adminPost(`/v1/admin/submissions/${subId}/approve`, token);
    expect(second.status).toBe(409);
    const j = await second.json() as { error: string; current: string };
    expect(j.error).toBe('wrong_status');
    expect(j.current).toBe('approved');
  });

  it('404s on an unknown submission id', async () => {
    const token = await login();
    const res = await adminPost(`/v1/admin/submissions/00000000-0000-4000-8000-000000000000/approve`, token);
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!DB_URL)('POST /v1/admin/submissions/:id/reject', () => {
  it('moves pending → rejected with a visible reason', async () => {
    const subId = await submitOnce('to-reject');
    const token = await login();
    const res = await adminPost(`/v1/admin/submissions/${subId}/reject`, token, {
      reason: 'Does not match our content policy.',
      internalNotes: 'Operator: clearly spam',
    });
    expect(res.status).toBe(200);

    const statusRes = await fetch(`http://127.0.0.1:${port}/v1/portals/submissions/${subId}/status`);
    const j = await statusRes.json() as { status: string; rejectionReason: string };
    expect(j.status).toBe('rejected');
    expect(j.rejectionReason).toBe('Does not match our content policy.');

    // Rejected portals do NOT appear in search.
    const search = await fetch(`http://127.0.0.1:${port}/v1/portals/search?text=reject`);
    const sJson = await search.json() as { total: number };
    expect(sJson.total).toBe(0);
  });

  it('400s when reason is missing', async () => {
    const subId = await submitOnce('reject-no-reason');
    const token = await login();
    const res = await adminPost(`/v1/admin/submissions/${subId}/reject`, token, {});
    expect(res.status).toBe(400);
  });

  it('409s when rejecting an already-approved submission', async () => {
    const subId = await submitOnce('cant-reject-after-approve');
    const token = await login();
    await adminPost(`/v1/admin/submissions/${subId}/approve`, token);
    const res = await adminPost(`/v1/admin/submissions/${subId}/reject`, token, { reason: 'too late' });
    expect(res.status).toBe(409);
  });
});

describe.skipIf(!DB_URL)('end-to-end submit → approve → search → resolve', () => {
  it('a full happy-path flow', async () => {
    // 1. Submit
    const subId = await submitOnce('end-to-end-portal', {
      displayTitle: 'End to End Portal', description: 'Smoke-test of the full pipeline.',
      capabilities: [{ verb: 'contact', tags: [] }, { verb: 'inquire', tags: ['hello'] }],
      tags: ['e2e','demo'], serviceAreas: ['SE'], languages: ['en','sv'],
    });

    // 2. Operator approves
    const token = await login('op-e2e');
    const approve = await adminPost(`/v1/admin/submissions/${subId}/approve`, token);
    expect(approve.status).toBe(200);

    // 3. Public search finds it by verb + tag
    const byVerb = await fetch(`http://127.0.0.1:${port}/v1/portals/search?verbs=inquire`);
    const byVerbJson = await byVerb.json() as { results: { tags: string[]; portalAddress: string }[]; total: number };
    expect(byVerbJson.total).toBe(1);
    expect(byVerbJson.results[0]!.portalAddress).toBe('end-to-end-portal.global');
    expect(byVerbJson.results[0]!.tags.sort()).toEqual(['demo','e2e','hello']);

    // 4. Resolve by exact name returns the canonical record
    const resolveRes = await fetch(`http://127.0.0.1:${port}/v1/portals/resolve/end-to-end-portal.global`);
    const rJson = await resolveRes.json() as { found: boolean; tier: string };
    expect(rJson.found).toBe(true);
    expect(rJson.tier).toBe('tier3_selfservice');
  });
});
