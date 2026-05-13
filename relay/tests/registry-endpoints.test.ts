/**
 * registry-endpoints.test.ts — Step 8 end-to-end coverage.
 *
 * Requires a running Postgres reachable via RELAY_REGISTRY_TEST_DATABASE_URL.
 * If unset, the entire suite is skipped (vitest reports them as skipped, not
 * failed — same pattern as the Comm App tests when fake-indexeddb isn't
 * available). This keeps the CI matrix flexible: PR jobs that don't
 * provision Postgres still pass.
 *
 * The suite generates a fresh Ed25519 keypair per test so each submission
 * has unique submitter_contact_hash + signing_pubkey_hex, avoiding rows
 * leaking across cases. Names also include a per-test suffix.
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
const sinkStream = new Writable({ write(_c, _e, cb) { cb(); } });

let server: RelayServer;
let port: number;
let pool: Pool;

beforeAll(async () => {
  if (!DB_URL) return;
  process.env.RELAY_REGISTRY_DATABASE_URL = DB_URL;

  pool = new Pool({ connectionString: DB_URL });
  // Wipe + re-migrate so every run starts clean.
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
    port: tempPort,
    host: '127.0.0.1',
    insecure: true,
    drainIntervalMs: 0,
    audit: createAuditLogger(sinkStream),
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

beforeEach(async () => {
  if (!DB_URL) return;
  // Clear per-test state — keep schema_migrations.
  await pool.query('TRUNCATE portals, portal_submissions, kyc_submissions, reserved_names RESTART IDENTITY CASCADE');
});

// ── Helpers ──────────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

function bytesToB64Url(b: Uint8Array): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function freshIdentity(): Promise<{ privHex: string; pubHex: string; hash: string }> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const pubHex = bytesToHex(pub);
  const hash = deriveContactHash(pubHex);
  if (!hash) throw new Error('failed to derive contact hash');
  return { privHex: bytesToHex(priv), pubHex, hash };
}

async function signDescriptor(descriptor: unknown, privHex: string): Promise<string> {
  const canonical = canonify(descriptor);
  if (canonical === undefined) throw new Error('canonical undefined');
  const priv = Uint8Array.from(Buffer.from(privHex, 'hex'));
  const sig = await ed25519.signAsync(new TextEncoder().encode(canonical), priv);
  return bytesToB64Url(sig);
}

interface SubmitOpts {
  name?: string;
  namespace?: string;
  identity?: { privHex: string; pubHex: string; hash: string };
  descriptorOverrides?: Record<string, unknown>;
  kycOverrides?: Record<string, unknown>;
  /** Override the signature to test tamper-rejection. */
  signature?: string;
  /** Override the contact hash to test mismatch rejection. */
  contactHash?: string;
}

async function makeSubmission(opts: SubmitOpts = {}): Promise<{ body: Record<string, unknown>; identity: { privHex: string; pubHex: string; hash: string } }> {
  const identity = opts.identity ?? await freshIdentity();
  const descriptor = {
    name: opts.name ?? 'test-portal',
    namespace: opts.namespace ?? 'global',
    displayTitle: 'Test portal',
    description: 'A portal for the test suite.',
    category: 'personal',
    capabilities: [],
    ...opts.descriptorOverrides,
  };
  const signature = opts.signature ?? await signDescriptor(descriptor, identity.privHex);
  const body = {
    proposedName: opts.name ?? 'test-portal',
    proposedNamespace: opts.namespace ?? 'global',
    signingPubkeyHex: identity.pubHex,
    submitterContactHash: opts.contactHash ?? identity.hash,
    descriptorJson: descriptor,
    descriptorSignature: signature,
    kyc: {
      legalName: 'Test Submitter',
      idDocumentType: 'national_id',
      idDocumentNumber: 'TEST-' + bytesToHex(ed25519.utils.randomPrivateKey()).slice(0, 12),
      idDocumentCountry: 'SE',
      contactEmail: 'test@example.com',
      addressCountry: 'SE',
      addressCity: 'Stockholm',
      addressStreet: 'Testgatan 1',
      ...opts.kycOverrides,
    },
  };
  return { body, identity };
}

async function POST(path: string, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function GET(path: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe.skipIf(!DB_URL)('POST /v1/portals/submit', () => {
  it('accepts a valid submission and returns submissionId + pending status', async () => {
    const { body } = await makeSubmission();
    const res = await POST('/v1/portals/submit', body);
    expect(res.status).toBe(201);
    const json = await res.json() as { submissionId: string; status: string; tier: string };
    expect(json.status).toBe('pending');
    expect(json.tier).toBe('tier3_selfservice');
    expect(json.submissionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects when descriptorSignature does not verify', async () => {
    const { body } = await makeSubmission({ signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    const res = await POST('/v1/portals/submit', body);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('rejects when submitterContactHash does not match the signing pubkey', async () => {
    const { body } = await makeSubmission({ contactHash: 'ANTON-AAAA-AAAA-AAAA-AAAA' });
    const res = await POST('/v1/portals/submit', body);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('contact_hash_mismatch');
  });

  it('rejects when proposed name is reserved (claimable=false)', async () => {
    await pool.query(
      `INSERT INTO reserved_names (name, namespace, basis, claimable) VALUES ($1, 'global', 'system_term', false)`,
      ['admin'],
    );
    const { body } = await makeSubmission({ name: 'admin' });
    const res = await POST('/v1/portals/submit', body);
    expect(res.status).toBe(409);
    const json = await res.json() as { error: string; claimable: boolean };
    expect(json.error).toBe('name_reserved');
    expect(json.claimable).toBe(false);
  });

  it('rejects a second pending submission for the same name (race protection)', async () => {
    const { body: body1 } = await makeSubmission({ name: 'colliding-name' });
    const r1 = await POST('/v1/portals/submit', body1);
    expect(r1.status).toBe(201);

    const { body: body2 } = await makeSubmission({ name: 'colliding-name' });
    const r2 = await POST('/v1/portals/submit', body2);
    expect(r2.status).toBe(409);
    const json = await r2.json() as { error: string };
    expect(json.error).toBe('name_collision');
  });

  it('rejects malformed body shape (e.g. missing kyc.legalName)', async () => {
    const { body } = await makeSubmission({ kycOverrides: { legalName: '' } });
    const res = await POST('/v1/portals/submit', body);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string; field: string };
    expect(json.error).toBe('invalid_body');
    expect(json.field).toBe('kyc.legalName');
  });

  it('hashes idDocumentNumber server-side (plaintext never persisted)', async () => {
    const docNumber = 'PASSPORT-12345';
    const { body } = await makeSubmission({ kycOverrides: { idDocumentNumber: docNumber } });
    const res = await POST('/v1/portals/submit', body);
    expect(res.status).toBe(201);
    const stored = await pool.query<{ id_document_number_hash: string }>(
      'SELECT id_document_number_hash FROM kyc_submissions',
    );
    expect(stored.rows.length).toBe(1);
    expect(stored.rows[0]!.id_document_number_hash).not.toBe(docNumber);
    expect(stored.rows[0]!.id_document_number_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.skipIf(!DB_URL)('GET /v1/portals/submissions/:id/status', () => {
  it('returns the submission status to anyone who knows the UUID', async () => {
    const { body } = await makeSubmission();
    const submit = await POST('/v1/portals/submit', body);
    const { submissionId } = await submit.json() as { submissionId: string };

    const res = await GET(`/v1/portals/submissions/${submissionId}/status`);
    expect(res.status).toBe(200);
    const json = await res.json() as { status: string; tier: string };
    expect(json.status).toBe('pending');
    expect(json.tier).toBe('tier3_selfservice');
  });

  it('returns 404 for an unknown UUID', async () => {
    const res = await GET(`/v1/portals/submissions/00000000-0000-4000-8000-000000000000/status`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id (defensive)', async () => {
    const res = await GET('/v1/portals/submissions/not-a-uuid/status');
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_submission_id');
  });
});

describe.skipIf(!DB_URL)('GET /v1/portals/search', () => {
  async function seedApprovedPortal(name: string, descriptor: Record<string, unknown>, summary: Record<string, unknown> = {}): Promise<void> {
    const id = await freshIdentity();
    const sub = await pool.query<{ id: string }>(
      `INSERT INTO portal_submissions (submitter_contact_hash, signing_pubkey_hex, proposed_name, proposed_namespace,
        descriptor_json, descriptor_signature, status, tier)
       VALUES ($1, $2, $3, 'global', $4, 'sig', 'approved', 'tier3_selfservice') RETURNING id`,
      [id.hash, id.pubHex, name, descriptor],
    );
    await pool.query(
      `INSERT INTO portals (submission_id, name, namespace, contact_hash, signing_pubkey_hex,
        descriptor_json, capability_summary, tier)
       VALUES ($1, $2, 'global', $3, $4, $5, $6, 'tier3_selfservice')`,
      [sub.rows[0]!.id, name, id.hash, id.pubHex, descriptor, summary],
    );
  }

  it('returns empty results when nothing is indexed', async () => {
    const res = await GET('/v1/portals/search');
    expect(res.status).toBe(200);
    const json = await res.json() as { results: unknown[]; total: number };
    expect(json.results).toEqual([]);
    expect(json.total).toBe(0);
  });

  it('full-text matches name + displayTitle + description', async () => {
    await seedApprovedPortal('dog-sitter-sthlm', {
      displayTitle: 'Dog Sitter Stockholm',
      description: 'Watching your dog while you travel.',
    });
    await seedApprovedPortal('cat-cafe', {
      displayTitle: 'Cat Cafe Gothenburg',
      description: 'Coffee with cats.',
    });
    const res = await GET('/v1/portals/search?text=dog');
    const json = await res.json() as { results: Array<{ portalAddress: string }>; total: number };
    expect(json.total).toBe(1);
    expect(json.results[0]!.portalAddress).toBe('dog-sitter-sthlm.global');
  });

  it('filters by capability verb', async () => {
    await seedApprovedPortal('booking-portal', { displayTitle: 'Booking portal' }, { verbs: ['book', 'pay'] });
    await seedApprovedPortal('inquiry-portal', { displayTitle: 'Inquiry portal' }, { verbs: ['inquire'] });
    const res = await GET('/v1/portals/search?verbs=book');
    const json = await res.json() as { results: Array<{ portalAddress: string }>; total: number };
    expect(json.total).toBe(1);
    expect(json.results[0]!.portalAddress).toBe('booking-portal.global');
  });

  it('honours limit + offset', async () => {
    for (let i = 0; i < 5; i++) {
      await seedApprovedPortal(`portal-${i}`, { displayTitle: `Portal ${i}` });
    }
    const res = await GET('/v1/portals/search?limit=2&offset=2');
    const json = await res.json() as { results: unknown[]; total: number };
    expect(json.total).toBe(5);
    expect(json.results.length).toBe(2);
  });
});

describe.skipIf(!DB_URL)('GET /v1/portals/resolve/:address', () => {
  async function seedApprovedPortal(name: string, displayTitle: string): Promise<{ hash: string; pubHex: string }> {
    const id = await freshIdentity();
    const sub = await pool.query<{ id: string }>(
      `INSERT INTO portal_submissions (submitter_contact_hash, signing_pubkey_hex, proposed_name, proposed_namespace,
        descriptor_json, descriptor_signature, status, tier)
       VALUES ($1, $2, $3, 'global', $4, 'sig', 'approved', 'tier3_selfservice') RETURNING id`,
      [id.hash, id.pubHex, name, { displayTitle }],
    );
    await pool.query(
      `INSERT INTO portals (submission_id, name, namespace, contact_hash, signing_pubkey_hex,
        descriptor_json, capability_summary, tier)
       VALUES ($1, $2, 'global', $3, $4, $5, '{}', 'tier3_selfservice')`,
      [sub.rows[0]!.id, name, id.hash, id.pubHex, { displayTitle }],
    );
    return { hash: id.hash, pubHex: id.pubHex };
  }

  it('returns the canonical record for an existing name', async () => {
    const seeded = await seedApprovedPortal('my-portal', 'My Portal');
    const res = await GET('/v1/portals/resolve/my-portal.global');
    expect(res.status).toBe(200);
    const json = await res.json() as { found: boolean; contactHash: string; signingPubkeyHex: string };
    expect(json.found).toBe(true);
    expect(json.contactHash).toBe(seeded.hash);
    expect(json.signingPubkeyHex).toBe(seeded.pubHex);
  });

  it('returns 404 with found:false for an unknown name', async () => {
    const res = await GET('/v1/portals/resolve/does-not-exist.global');
    expect(res.status).toBe(404);
    const json = await res.json() as { found: boolean };
    expect(json.found).toBe(false);
  });

  it('treats name-only as namespace=global', async () => {
    await seedApprovedPortal('shortform', 'Shortform');
    const res = await GET('/v1/portals/resolve/shortform');
    expect(res.status).toBe(200);
    const json = await res.json() as { found: boolean };
    expect(json.found).toBe(true);
  });
});
