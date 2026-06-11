/**
 * anton-bundle-signing.test.ts — Ed25519 provenance for .anton bundles
 * (Wave 2.4 of CORE_EXPERIENCE_REVIEW_2026-06).
 *
 * Covers:
 *   • sign → validate: provenance { signed: true, valid: true } + signer pubkey
 *   • tamper ANY manifest field after signing → signature INVALID, critical
 *     error, import blocked (envelope field, bespoke/legacy field, the
 *     signature block's own signed_at / signer_name)
 *   • unsigned bundles import exactly as before with { signed: false } —
 *     READ-OLD compatibility is sacred
 *   • TOFU: first sight → known=false (signer recorded); second sight →
 *     known=true; name change on a known key → warning, first_seen_name pinned
 *   • no signing identity available → signAntonBundle degrades to the
 *     untouched buffer, export proceeds unsigned
 *   • content tamper on a signed module bundle is still caught (checksum,
 *     which the signature covers transitively via the manifest)
 *
 * In-memory fake DatabaseAdapter — no Postgres needed (same pattern as
 * anton-module-roundtrip.test.ts), extended with an instance_identity +
 * bundle_signers store so the real signer/TOFU code paths run.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { bundleBuiltinModuleToAnton } from '../../server/services/anton-bundler.js';
import { validateAntonFile } from '../../server/services/anton-validator.js';
import { importAntonFile } from '../../server/services/anton-importer.js';
import {
  signAntonBundle,
  verifyManifestSignature,
  extractSignatureBlock,
  getSigningIdentityStatus,
} from '../../server/services/anton-bundle-signing.js';

const BUILTIN_MODULE_ID = 'gap-analysis';

// ── In-memory fake adapter with identity + TOFU stores ──────────────────────

interface IdentityRow {
  pubkey: string;
  privkey: string | null;
  privkey_encrypted: Buffer | null;
  privkey_iv: Buffer | null;
  display_name: string | null;
}

interface SignerRow { signer_name: string | null }

function makeFakeDb(options: { identityBroken?: boolean } = {}): {
  db: DatabaseAdapter;
  signers: Map<string, SignerRow>;
  inserts: Array<{ sql: string; params: unknown[] }>;
} {
  let identity: IdentityRow | null = null;
  const signers = new Map<string, SignerRow>();
  const inserts: Array<{ sql: string; params: unknown[] }> = [];

  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM instance_identity')) {
        if (options.identityBroken) throw new Error('relation "instance_identity" does not exist');
        return (identity ?? undefined) as T | undefined;
      }
      if (sql.includes('FROM bundle_signers')) {
        return signers.get(params[0] as string) as T | undefined;
      }
      return undefined; // custom_modules / skills / personas lookups
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT')) inserts.push({ sql, params });
      if (sql.includes('INSERT INTO instance_identity')) {
        if (options.identityBroken) throw new Error('relation "instance_identity" does not exist');
        identity = {
          pubkey: params[0] as string,
          privkey: params[1] as string | null,
          privkey_encrypted: params[2] as Buffer | null,
          privkey_iv: params[3] as Buffer | null,
          display_name: params[4] as string | null,
        };
      }
      if (sql.includes('INSERT INTO bundle_signers')) {
        const pubkey = params[0] as string;
        if (!signers.has(pubkey)) signers.set(pubkey, { signer_name: params[1] as string | null });
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, signers, inserts };
}

/** Mutate the manifest of a (possibly signed) bundle and re-zip. */
function withMutatedManifest(buffer: Buffer, mutate: (m: any) => void): Buffer {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('manifest.json');
  if (!entry) throw new Error('fixture bundle has no manifest');
  const manifest = JSON.parse(entry.getData().toString('utf-8'));
  mutate(manifest);
  zip.updateFile(entry, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  return zip.toBuffer();
}

async function makeSignedBundle(db: DatabaseAdapter): Promise<Buffer> {
  const unsigned = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
  const result = await signAntonBundle(db, unsigned);
  expect(result.signed).toBe(true);
  return result.buffer;
}

// ── Sign → validate ──────────────────────────────────────────────────────────

describe('sign → validate (Wave 2.4)', () => {
  it('signs a module bundle and the validator verifies it', async () => {
    const { db } = makeFakeDb();
    const buffer = await makeSignedBundle(db);

    const result = await validateAntonFile(buffer, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.provenance?.signed).toBe(true);
    expect(result.provenance?.valid).toBe(true);
    expect(result.provenance?.signer_pubkey).toMatch(/^[0-9a-f]+$/);
    expect(typeof result.provenance?.signed_at).toBe('string');
    // The user is told who signed it
    expect(result.warnings.some((w) => w.message.startsWith('Signed by'))).toBe(true);
  });

  it('embeds the documented signature envelope shape', async () => {
    const { db } = makeFakeDb();
    const buffer = await makeSignedBundle(db);
    const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));

    const block = extractSignatureBlock(manifest);
    expect(block).not.toBeNull();
    expect(block!.alg).toBe('ed25519');
    expect(block!.sig_base64.length).toBeGreaterThan(0);
    expect(block!.signer_pubkey.length).toBeGreaterThan(0);
    expect(block!.signed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('a signed module bundle imports through the real importer', async () => {
    const { db } = makeFakeDb();
    const buffer = await makeSignedBundle(db);

    const importDb = makeFakeDb();
    const result = await importAntonFile(buffer, importDb.db);

    expect(result.success).toBe(true);
    expect(result.validation.provenance?.valid).toBe(true);
  });
});

// ── Tampering ────────────────────────────────────────────────────────────────

describe('tampering with a signed bundle', () => {
  it.each([
    ['envelope field (package.name)', (m: any) => { m.package.name = 'Totally Legit Module'; }],
    ['legacy field (meta.author)', (m: any) => { m.meta.author = 'Mallory'; }],
    ['content checksum (security.checksum)', (m: any) => { m.security.checksum = 'sha256:' + '0'.repeat(64); }],
    ['signature signed_at', (m: any) => { m.signature.signed_at = '2020-01-01T00:00:00.000Z'; }],
    ['signature signer_name', (m: any) => { m.signature.signer_name = 'Someone Else'; }],
    ['added top-level field', (m: any) => { m.totally_new_field = 'injected'; }],
  ])('mutating %s → signature INVALID + import blocked', async (_label, mutate) => {
    const { db } = makeFakeDb();
    const tampered = withMutatedManifest(await makeSignedBundle(db), mutate);

    const checkDb = makeFakeDb();
    const result = await validateAntonFile(tampered, checkDb.db);

    expect(result.valid).toBe(false);
    expect(result.provenance?.signed).toBe(true);
    expect(result.provenance?.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Signature INVALID'))).toBe(true);

    const importResult = await importAntonFile(tampered, makeFakeDb().db);
    expect(importResult.success).toBe(false);
  });

  it('swapping the signer pubkey does not validate (the key is covered too)', async () => {
    const { db } = makeFakeDb();
    const other = makeFakeDb();
    // Generate a second identity to steal its pubkey
    const otherStatus = await getSigningIdentityStatus(other.db);
    const tampered = withMutatedManifest(await makeSignedBundle(db), (m) => {
      m.signature.signer_pubkey = otherStatus.signer_pubkey;
    });

    const result = await validateAntonFile(tampered, makeFakeDb().db);
    expect(result.provenance?.valid).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('content tamper on a signed bundle is still caught via the signed checksum', async () => {
    const { db } = makeFakeDb();
    const buffer = await makeSignedBundle(db);
    const zip = new AdmZip(buffer);
    zip.updateFile(zip.getEntry('system-prompt.md')!, Buffer.from('EVIL PROMPT', 'utf-8'));

    const result = await validateAntonFile(zip.toBuffer(), makeFakeDb().db);

    // The manifest itself is untouched → signature stays valid…
    expect(result.provenance?.valid).toBe(true);
    // …but the signed checksum no longer matches the content → invalid bundle.
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Checksum mismatch'))).toBe(true);
  });
});

// ── READ-OLD: unsigned bundles ───────────────────────────────────────────────

describe('unsigned bundles (READ-OLD compatibility)', () => {
  it('imports exactly as before with provenance { signed: false }', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const { db, inserts } = makeFakeDb();

    const validation = await validateAntonFile(buffer, db);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.provenance).toEqual({ signed: false, valid: false, known: false });
    // No signature-related warnings on unsigned bundles
    expect(validation.warnings.some((w) => w.message.startsWith('Signed by'))).toBe(false);
    expect(validation.errors.some((e) => e.message.includes('Signature'))).toBe(false);

    const result = await importAntonFile(buffer, db);
    expect(result.success).toBe(true);
    expect(inserts.some((i) => i.sql.includes('INSERT INTO custom_modules'))).toBe(true);
  });

  it('a foreign signature shape (evidence-pack string) is treated as unsigned', () => {
    const verdict = verifyManifestSignature({
      packId: 'pack-1',
      manifestHash: 'sha256:abc',
      signature: 'ed25519:c29tZXNpZw',
      signerPublicKey: 'deadbeef',
    });
    expect(verdict.signed).toBe(false);
  });
});

// ── TOFU ─────────────────────────────────────────────────────────────────────

describe('TOFU signer registry', () => {
  it('first sight → known=false and the signer is recorded; second sight → known=true', async () => {
    const signerDb = makeFakeDb();
    const buffer = await makeSignedBundle(signerDb.db);

    const receiver = makeFakeDb();
    const first = await validateAntonFile(buffer, receiver.db);
    expect(first.provenance?.valid).toBe(true);
    expect(first.provenance?.known).toBe(false);
    expect(receiver.signers.size).toBe(1);

    const second = await validateAntonFile(buffer, receiver.db);
    expect(second.provenance?.valid).toBe(true);
    expect(second.provenance?.known).toBe(true);
  });

  it('a known key claiming a new name → warning + first_seen_name pinned', async () => {
    const signerDb = makeFakeDb();
    const buffer = await makeSignedBundle(signerDb.db);
    const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));

    const receiver = makeFakeDb();
    // Pre-pin the signer under a different first-seen name
    receiver.signers.set(manifest.signature.signer_pubkey, { signer_name: 'Original Name' });

    const result = await validateAntonFile(buffer, receiver.db);

    expect(result.provenance?.valid).toBe(true);
    expect(result.provenance?.known).toBe(true);
    expect(result.provenance?.first_seen_name).toBe('Original Name');
    expect(result.warnings.some((w) => w.message.includes('Signer name changed'))).toBe(true);
  });
});

// ── No identity available ────────────────────────────────────────────────────

describe('no signing identity available', () => {
  it('signAntonBundle degrades to the untouched buffer — export proceeds unsigned', async () => {
    const { db } = makeFakeDb({ identityBroken: true });
    const unsigned = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);

    const result = await signAntonBundle(db, unsigned);

    expect(result.signed).toBe(false);
    expect(result.buffer).toBe(unsigned);
    // The unsigned export still validates + imports
    const validation = await validateAntonFile(result.buffer, makeFakeDb().db);
    expect(validation.valid).toBe(true);
    expect(validation.provenance?.signed).toBe(false);
  });

  it('getSigningIdentityStatus reports unavailable', async () => {
    const { db } = makeFakeDb({ identityBroken: true });
    expect(await getSigningIdentityStatus(db)).toEqual({ available: false });
  });

  it('an existing signature field is never overwritten', async () => {
    const { db } = makeFakeDb();
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ packId: 'p', manifestHash: 'h', signature: 'ed25519:abc' }), 'utf-8'));

    const result = await signAntonBundle(db, zip.toBuffer());

    expect(result.signed).toBe(false);
    expect(result.reason).toContain('already carries a signature');
  });
});
