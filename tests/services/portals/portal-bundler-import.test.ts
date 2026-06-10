/**
 * Unit tests for `.anton` portal-bundle import safety (Wave-3 plan 3.7):
 *
 *   - REGRESSION: the documented "fake template" signature bypass — a
 *     manifest with NO bundleKind (old format) crafted to look like a
 *     template MUST still have its descriptor signature verified
 *     (portal-bundler.ts step 3: default bundleKind = 'concrete')
 *   - concrete bundle with a tampered descriptor is rejected
 *   - concrete bundle with a correctly signed descriptor imports
 *   - explicit bundleKind:'template' skips signature verification (the
 *     intended, documented template path)
 *   - zip safety: path traversal entries, absolute paths, oversize bundles,
 *     non-zip input, missing/invalid manifest, wrong bundleType
 *
 * Bundles are real zips built with adm-zip; descriptors are signed with
 * real Ed25519 keys. The DB stub only answers the name-conflict SELECT and
 * the post-insert id SELECT.
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';

import {
  importPortal,
  PORTAL_BUNDLE_FORMAT_VERSION,
  PORTAL_BUNDLE_SCHEMA_VERSION,
  type PortalBundleManifest,
} from '../../../server/services/portals/portal-bundler.js';
import {
  buildDescriptor,
} from '../../../server/services/capability-descriptor/builder.js';
import type { SignedDescriptorEnvelope } from '../../../server/services/capability-descriptor/signer.js';
import { generateAppKeypair } from '../../../server/services/identity.js';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const kp = generateAppKeypair();

function signedEnvelope(): SignedDescriptorEnvelope {
  const built = buildDescriptor({
    portal: {
      name: 'cake-shop',
      namespace: 'futurechain',
      displayTitle: 'The Cake Shop',
      category: 'commerce',
      contactHash: kp.contactHash,
      publicKeyHex: kp.publicKeyHex,
    },
    identity: { humanContact: { available: true } },
    capabilities: [{
      id: 'say-hello', verb: 'contact', title: 'Send a message',
      description: 'Free-form message.', aapEndpoint: 'messages',
    }],
  }, kp.privateKeyPem);
  return built.envelope;
}

function manifest(overrides: Partial<PortalBundleManifest> = {}): PortalBundleManifest {
  const now = new Date().toISOString();
  return {
    bundleType: 'portal',
    bundleVersion: PORTAL_BUNDLE_FORMAT_VERSION,
    schemaVersion: PORTAL_BUNDLE_SCHEMA_VERSION,
    bundleKind: 'concrete',
    name: 'cake-shop',
    namespace: 'futurechain',
    displayTitle: 'The Cake Shop',
    category: 'commerce',
    template: null,
    createdAt: now,
    updatedAt: now,
    author: { contactHash: kp.contactHash, displayName: 'Baker' },
    capabilityDescriptorRef: 'capability-descriptor.json',
    pagesRef: 'pages/',
    assetsRef: 'assets/',
    dataSchemaRef: 'schema.sql',
    dataSeedRef: 'data-seed.sql',
    walkthroughTranscriptRef: 'walkthrough.json',
    adaptationPoints: [],
    dependencies: { minAntonVersion: '0.7.0', requiredModules: [], requiredAreas: [] },
    ...overrides,
  };
}

function buildBundle(opts: {
  manifest?: PortalBundleManifest | Record<string, unknown>;
  envelope?: SignedDescriptorEnvelope | Record<string, unknown> | null;
  extraEntries?: Array<{ name: string; content: string }>;
  omitManifest?: boolean;
} = {}): Buffer {
  const zip = new AdmZip();
  if (!opts.omitManifest) {
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(opts.manifest ?? manifest()), 'utf-8'));
  }
  if (opts.envelope !== null) {
    zip.addFile(
      'capability-descriptor.json',
      Buffer.from(JSON.stringify(opts.envelope ?? signedEnvelope()), 'utf-8'),
    );
  }
  zip.addFile('pages/index.html', Buffer.from('<h1>{{title}}</h1>', 'utf-8'));
  for (const e of opts.extraEntries ?? []) {
    zip.addFile(e.name, Buffer.from(e.content, 'utf-8'));
  }
  return zip.toBuffer();
}

/**
 * adm-zip sanitises entry names on write (collapses `..`, strips leading
 * slashes), so a malicious entry cannot be produced via addFile. Real
 * zip-slip payloads come from other tooling that does NOT sanitise. We
 * reproduce that by byte-patching a placeholder entry name (same length) in
 * the finished buffer — the reader preserves `..` verbatim, exercising the
 * production isSafePath guard. `placeholder` and `malicious` must be equal
 * length so all offsets stay valid.
 */
function bundleWithRawEntryName(placeholder: string, malicious: string): Buffer {
  if (placeholder.length !== malicious.length) {
    throw new Error('placeholder and malicious names must be equal length');
  }
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest()), 'utf-8'));
  zip.addFile('capability-descriptor.json', Buffer.from(JSON.stringify(signedEnvelope()), 'utf-8'));
  zip.addFile(placeholder, Buffer.from('x', 'utf-8'));
  const buf = zip.toBuffer();
  const from = Buffer.from(placeholder, 'utf-8');
  const to = Buffer.from(malicious, 'utf-8');
  let idx = buf.indexOf(from);
  while (idx !== -1) {
    to.copy(buf, idx);
    idx = buf.indexOf(from, idx + from.length);
  }
  return buf;
}

/** DB stub: no name conflict on first SELECT, returns the new id afterwards. */
function stubDb(): DatabaseAdapter {
  const ok: RunResult = { changes: 1, lastInsertRowid: 0 };
  let portalInserted = false;
  return {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('SELECT id FROM portals')) {
        return portalInserted ? ({ id: 'imported-portal-1' } as T) : undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string): Promise<RunResult> {
      if (sql.includes('INSERT INTO portals')) portalInserted = true;
      return ok;
    },
    async exec(): Promise<void> { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> { /* noop */ },
  };
}

// ── Signature enforcement ───────────────────────────────────────────────────

describe('importPortal — descriptor signature enforcement', () => {
  it('imports a concrete bundle with a correctly signed descriptor', async () => {
    const r = await importPortal(stubDb(), buildBundle());
    expect(r.errors).toEqual([]);
    expect(r.success).toBe(true);
    expect(r.isTemplate).toBe(false);
    expect(r.portalId).toBe('imported-portal-1');
  });

  it('rejects a concrete bundle whose descriptor was tampered after signing', async () => {
    const envelope = signedEnvelope();
    const tampered = JSON.parse(JSON.stringify(envelope)) as SignedDescriptorEnvelope;
    (tampered.descriptor.portal as { displayTitle: string }).displayTitle = 'Evil Twin';
    const r = await importPortal(stubDb(), buildBundle({ envelope: tampered }));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('Descriptor signature failed');
  });

  it('REGRESSION (fake-template bypass): a manifest with NO bundleKind defaults to concrete — tampered descriptor still rejected', async () => {
    // Reproduce the historical attack shape: old-format manifest (no
    // bundleKind), template-looking adaptationPoints with null values and a
    // placeholder author hash — paired with a forged/tampered descriptor.
    const m = manifest({
      author: { contactHash: 'ANTON-TMPL-TMPL-TMPL-TMPL', displayName: null },
      adaptationPoints: [
        { id: 'owner-name', label: 'Owner', currentValue: null, type: 'string', required: true },
      ],
    }) as unknown as Record<string, unknown>;
    delete m.bundleKind;

    const envelope = signedEnvelope();
    const forged = JSON.parse(JSON.stringify(envelope)) as SignedDescriptorEnvelope;
    (forged.descriptor as Record<string, unknown>).extensions = { 'x-injected': { backdoor: true } };

    const r = await importPortal(stubDb(), buildBundle({ manifest: m, envelope: forged }));
    expect(r.isTemplate).toBe(false); // missing bundleKind must NOT read as template
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('Descriptor signature failed');
  });

  it("explicit bundleKind:'template' skips signature verification (intended template path)", async () => {
    const envelope = signedEnvelope();
    const unsigned = { ...envelope, signature: 'AAAA' };
    const r = await importPortal(
      stubDb(),
      buildBundle({ manifest: manifest({ bundleKind: 'template' }), envelope: unsigned }),
    );
    expect(r.success).toBe(true);
    expect(r.isTemplate).toBe(true);
  });

  it('rejects a descriptor file that is not valid JSON', async () => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest()), 'utf-8'));
    zip.addFile('capability-descriptor.json', Buffer.from('{not json', 'utf-8'));
    const r = await importPortal(stubDb(), zip.toBuffer());
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('not valid JSON');
  });
});

// ── Zip safety ──────────────────────────────────────────────────────────────

describe('importPortal — zip safety', () => {
  it('rejects entries with path traversal (raw zip-slip from non-sanitising tooling)', async () => {
    // Both names 14 chars: 'inner/file.txt' → '../../evil.txt'.
    const r = await importPortal(stubDb(), bundleWithRawEntryName('inner/file.txt', '../../evil.txt'));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('Unsafe path');
  });

  it('rejects entries with absolute paths', async () => {
    // Both names 12 chars: 'safe/ok.html' → '/etc/passwd2'.
    const r = await importPortal(stubDb(), bundleWithRawEntryName('safe/ok.html', '/etc/passwd2'));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('Unsafe path');
  });

  it('rejects entries with Windows drive-letter paths', async () => {
    const r = await importPortal(stubDb(), buildBundle({
      extraEntries: [{ name: 'C:/Windows/evil.dll', content: 'x' }],
    }));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('Unsafe path');
  });

  it('rejects a buffer that is not a zip', async () => {
    const r = await importPortal(stubDb(), Buffer.from('definitely not a zip archive'));
    expect(r.success).toBe(false);
    expect(r.errors).toContain('Invalid zip archive');
  });

  it('rejects an oversize bundle before unzipping', async () => {
    const huge = Buffer.alloc(25 * 1024 * 1024 + 1);
    const r = await importPortal(stubDb(), huge);
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('Bundle too large');
  });
});

// ── Manifest validation ─────────────────────────────────────────────────────

describe('importPortal — manifest validation', () => {
  it('rejects a bundle without manifest.json', async () => {
    const r = await importPortal(stubDb(), buildBundle({ omitManifest: true }));
    expect(r.success).toBe(false);
    expect(r.errors).toContain('Missing manifest.json');
  });

  it('rejects a non-portal bundleType', async () => {
    const r = await importPortal(stubDb(), buildBundle({
      manifest: { ...manifest(), bundleType: 'knowledge-pack' },
    }));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('not a portal');
  });

  it('warns (but proceeds) on an unexpected schemaVersion', async () => {
    const r = await importPortal(stubDb(), buildBundle({
      manifest: { ...manifest(), schemaVersion: 'portal-0.9.0' },
    }));
    expect(r.warnings.join(' ')).toContain('portal-0.9.0');
    expect(r.success).toBe(true);
  });

  it('rejects when a portal with the same name already exists locally', async () => {
    const db = stubDb();
    // Pre-existing portal: make the conflict SELECT return a row.
    const conflictDb: DatabaseAdapter = {
      ...db,
      async get<T>(sql: string): Promise<T | undefined> {
        if (sql.includes('SELECT id FROM portals')) return { id: 'existing-1' } as T;
        return undefined;
      },
    };
    const r = await importPortal(conflictDb, buildBundle());
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toContain('already exists');
  });
});
