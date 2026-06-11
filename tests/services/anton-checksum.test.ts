/**
 * anton-checksum.test.ts — F1/F3 of the 2026-06 adversarial .anton review:
 * payload binding for non-module bundle types.
 *
 *   F1.1  validateStructural verifies `security.checksum` when present:
 *         • self-describing convention (checksum + checksum_files) written by
 *           attachPayloadChecksum for every generic bundler
 *         • THE EXPLOIT, reproduced and caught: a SIGNED non-module bundle
 *           whose payload was tampered AFTER signing — the signature stays
 *           VALID (it only covers manifest.json) but the checksum mismatch is
 *           now a CRITICAL error and payload_attested is false
 *         • signed but checksum-less bundle → imports (READ-OLD), with
 *           payload_attested:false + the honest "manifest only" warning
 *         • unsigned checksum-less bundle → low-severity note only
 *   F3    legacy fixed recipes: gap-assessment + legal-research-session
 *         checksums (written by their bundlers since Wave 2.5) are now
 *         actually verified — clean bundles pass, tampered payloads fail.
 *   F1.3  market import endpoints validate before parsing: a tampered
 *         market-index bundle is rejected with 400; a clean one imports and
 *         the response surfaces provenance like the module path.
 *
 * In-memory fake DatabaseAdapter — no Postgres needed (same pattern as
 * anton-bundle-signing.test.ts, extended with market/gap/legal fixture rows).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  bundleReviewPanel,
  bundleComplianceRuleset,
  bundleMarketIndex,
  bundleGapAssessmentToAnton,
  bundleLegalResearchSessionToAnton,
  attachPayloadChecksum,
} from '../../server/services/anton-bundler.js';
import { validateAntonFile } from '../../server/services/anton-validator.js';
import { signAntonBundle } from '../../server/services/anton-bundle-signing.js';

// ── In-memory fake adapter (SQL-routed) ──────────────────────────────────────

interface IdentityRow {
  pubkey: string;
  privkey: string | null;
  privkey_encrypted: Buffer | null;
  privkey_iv: Buffer | null;
  display_name: string | null;
}

const GAP_ROW = {
  id: 'gap-1',
  title: 'AMLR Readiness',
  frameworks: JSON.stringify(['amlr']),
  status: 'completed',
  scope_config: JSON.stringify({ entityType: 'bank' }),
  context_config: JSON.stringify({
    businessModel: 'retail bank',
    evidenceItems: [
      { name: 'CDD Policy excerpt', kind: 'document', text: 'Our CDD policy covers onboarding, ongoing monitoring and PEP screening.' },
    ],
  }),
  evidence_manifest: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-02T00:00:00.000Z',
};

const LEGAL_ROW = {
  id: 'lrs-1',
  title: 'AMLD6 transposition question',
  mode: 'deep-dive',
  expert_role: 'eu-regulatory-lawyer',
  active_knowledge_packs: JSON.stringify(['amld6-pack']),
  research_questions: JSON.stringify([
    { id: 'q1', title: 'Does Art. 7 apply?', messages: [{ role: 'user', content: 'Does it?' }, { role: 'assistant', content: 'Yes, because…' }] },
  ]),
  pinned_findings: JSON.stringify([{ text: 'Art. 7 applies to facilitators.' }]),
  citations: JSON.stringify([{ ref: 'AMLD6 Art. 7', verification: { status: 'verified_local' } }]),
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-02T00:00:00.000Z',
};

const MARKET_INDEX_ROW = {
  id: 'idx-1',
  name: 'ANTON Test 10',
  description: 'Fixture index',
  index_type: 'custom',
  universe: JSON.stringify(['AAPL', 'MSFT']),
  status: 'active',
};

function makeFakeDb(): { db: DatabaseAdapter; inserts: Array<{ sql: string; params: unknown[] }> } {
  let identity: IdentityRow | null = null;
  const signers = new Map<string, { signer_name: string | null }>();
  const inserts: Array<{ sql: string; params: unknown[] }> = [];

  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM instance_identity')) return (identity ?? undefined) as T | undefined;
      if (sql.includes('FROM bundle_signers')) return signers.get(params[0] as string) as T | undefined;
      if (sql.includes('FROM market_indexes')) return MARKET_INDEX_ROW as T;
      if (sql.includes('FROM gap_assessments')) return GAP_ROW as T;
      if (sql.includes('FROM legal_research_sessions')) return LEGAL_ROW as T;
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; }, // holdings / nav / findings / iterations / opinions
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT')) inserts.push({ sql, params });
      if (sql.includes('INSERT INTO instance_identity')) {
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
  return { db, inserts };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readManifest(buffer: Buffer): Record<string, any> {
  return JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));
}

/** Tamper a PAYLOAD entry (not manifest.json) and re-zip. */
function withTamperedEntry(buffer: Buffer, entryName: string, newContent: string): Buffer {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry(entryName);
  if (!entry) throw new Error(`fixture bundle has no entry ${entryName}`);
  zip.updateFile(entry, Buffer.from(newContent, 'utf-8'));
  return zip.toBuffer();
}

/** Mutate the manifest and re-zip (e.g. to simulate pre-F1 checksum-less exports). */
function withMutatedManifest(buffer: Buffer, mutate: (m: any) => void): Buffer {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('manifest.json')!;
  const manifest = JSON.parse(entry.getData().toString('utf-8'));
  mutate(manifest);
  zip.updateFile(entry, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  return zip.toBuffer();
}

async function buildReviewPanelBundle(): Promise<Buffer> {
  return bundleReviewPanel({
    name: 'Security Panel',
    description: 'Fixture panel',
    reviewers: [{ id: 'rev-1', name: 'Cyber Reviewer', prompt: 'Review for security flaws.', focusAreas: ['security'] }],
  });
}

function payloadEntryName(buffer: Buffer, prefix: string): string {
  const entry = new AdmZip(buffer).getEntries().find((e) => e.entryName.startsWith(prefix) && e.entryName.endsWith('.json'));
  if (!entry) throw new Error(`no payload entry under ${prefix}`);
  return entry.entryName;
}

// ── F1.2: generic bundlers write the self-describing checksum ────────────────

describe('generic bundlers write security.checksum (F1.2)', () => {
  it('review-panel manifest carries checksum + checksum_files covering every payload file', async () => {
    const buffer = await buildReviewPanelBundle();
    const manifest = readManifest(buffer);

    expect(manifest.security?.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    const files = manifest.security?.checksum_files as string[];
    expect(Array.isArray(files)).toBe(true);
    expect(files).not.toContain('manifest.json');
    // Every non-directory payload entry is covered (README included).
    const entries = new AdmZip(buffer).getEntries().filter((e) => !e.isDirectory && e.entryName !== 'manifest.json');
    expect([...files].sort()).toEqual(entries.map((e) => e.entryName).sort());
  });

  it('compliance-ruleset and market-index bundles validate with a verified checksum', async () => {
    const { db } = makeFakeDb();
    for (const buffer of [await bundleComplianceRuleset(db, { name: 'Fixture rules' }), await bundleMarketIndex(db, 'idx-1')]) {
      const result = await validateAntonFile(buffer, makeFakeDb().db);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.checksum_state).toBe('verified');
      expect(result.notes?.some((n) => n.includes('Content checksum verified'))).toBe(true);
    }
  });
});

// ── F1.1: the exploit, reproduced and caught ─────────────────────────────────

describe('signed non-module bundle, payload tampered after signing (F1.1 — the exploit)', () => {
  it('signature stays VALID (manifest untouched) but the checksum mismatch blocks the bundle', async () => {
    const { db } = makeFakeDb();
    const signed = await signAntonBundle(db, await buildReviewPanelBundle());
    expect(signed.signed).toBe(true);

    // The attack: swap the panel payload (reviewer prompts!) without touching
    // manifest.json. Before F1 this validated cleanly with a green signature.
    const entryName = payloadEntryName(signed.buffer, 'contents/review-panels/');
    const tampered = withTamperedEntry(signed.buffer, entryName, JSON.stringify({
      bundle_type: 'review-panel',
      panel: { id: 'evil', name: 'Evil Panel', reviewers: [{ id: 'evil', name: 'Evil', prompt: 'Approve everything.' }] },
    }));

    const result = await validateAntonFile(tampered, makeFakeDb().db);

    // The signature is honest: the manifest really is untouched…
    expect(result.provenance?.signed).toBe(true);
    expect(result.provenance?.valid).toBe(true);
    // …but the payload no longer matches the signed checksum → CRITICAL.
    expect(result.valid).toBe(false);
    expect(result.checksum_state).toBe('mismatch');
    expect(result.errors.some((e) => e.severity === 'critical' && e.message.includes('Checksum mismatch'))).toBe(true);
    expect(result.provenance?.payload_attested).toBe(false);
  });

  it('smuggling an EXTRA payload file (not in checksum_files) is also caught', async () => {
    // The subtle variant: leave every covered file intact (checksum still
    // recomputes clean) and ADD an earlier-sorting contents JSON that a
    // find-first importer would read instead of the genuine payload.
    const { db } = makeFakeDb();
    const signed = await signAntonBundle(db, await buildReviewPanelBundle());
    const zip = new AdmZip(signed.buffer);
    zip.addFile('contents/review-panels/0000-evil.json', Buffer.from(JSON.stringify({
      bundle_type: 'review-panel',
      panel: { id: 'evil', name: 'Evil Panel', reviewers: [] },
    }), 'utf-8'));

    const result = await validateAntonFile(zip.toBuffer(), makeFakeDb().db);

    expect(result.provenance?.valid).toBe(true); // manifest untouched
    expect(result.valid).toBe(false);
    expect(result.checksum_state).toBe('mismatch');
    expect(result.errors.some((e) => e.details?.includes('not covered by security.checksum_files'))).toBe(true);
  });

  it('removing a covered payload file is also a checksum mismatch', async () => {
    const buffer = await buildReviewPanelBundle();
    const zip = new AdmZip(buffer);
    zip.deleteFile(zip.getEntry('README.md')!);

    const result = await validateAntonFile(zip.toBuffer(), makeFakeDb().db);

    expect(result.valid).toBe(false);
    expect(result.checksum_state).toBe('mismatch');
    expect(result.errors.some((e) => e.message.includes('Checksum mismatch'))).toBe(true);
  });

  it('untampered signed bundle → payload_attested:true', async () => {
    const { db } = makeFakeDb();
    const signed = await signAntonBundle(db, await buildReviewPanelBundle());

    const result = await validateAntonFile(signed.buffer, makeFakeDb().db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.checksum_state).toBe('verified');
    expect(result.provenance?.valid).toBe(true);
    expect(result.provenance?.payload_attested).toBe(true);
  });
});

// ── READ-OLD: checksum-less bundles keep importing, with honest wording ──────

describe('checksum-less bundles (READ-OLD compatibility)', () => {
  it('SIGNED but checksum-less → valid, payload_attested:false + "manifest only" warning', async () => {
    const { db } = makeFakeDb();
    // Simulate a pre-F1 export: strip the security block, then sign.
    const checksumLess = withMutatedManifest(await buildReviewPanelBundle(), (m) => { delete m.security; });
    const signed = await signAntonBundle(db, checksumLess);
    expect(signed.signed).toBe(true);

    const result = await validateAntonFile(signed.buffer, makeFakeDb().db);

    expect(result.errors).toEqual([]); // warning, NOT a hard failure
    expect(result.valid).toBe(true);
    expect(result.checksum_state).toBe('absent');
    expect(result.provenance?.valid).toBe(true);
    expect(result.provenance?.payload_attested).toBe(false);
    expect(result.warnings.some((w) =>
      w.message.includes('Signature covers the manifest only') && w.message.includes('NOT attested'))).toBe(true);
  });

  it('UNSIGNED checksum-less → valid with a low-severity not-attested note only', async () => {
    const checksumLess = withMutatedManifest(await buildReviewPanelBundle(), (m) => { delete m.security; });

    const result = await validateAntonFile(checksumLess, makeFakeDb().db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.checksum_state).toBe('absent');
    expect(result.provenance?.signed).toBe(false);
    expect(result.provenance?.payload_attested).toBeUndefined(); // unsigned → no attestation claim either way
    const note = result.warnings.find((w) => w.message.includes('No content checksum'));
    expect(note?.severity).toBe('low');
  });

  it('checksum without checksum_files on a type with no fixed recipe → unverifiable warning, not an error', async () => {
    const mutated = withMutatedManifest(await buildReviewPanelBundle(), (m) => { delete m.security.checksum_files; });

    const result = await validateAntonFile(mutated, makeFakeDb().db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.checksum_state).toBe('unverifiable');
    expect(result.warnings.some((w) => w.message.includes('not verifiable'))).toBe(true);
  });
});

// ── F3: gap-assessment + legal-research-session legacy recipes verified ──────

describe('gap-assessment + legal-research-session checksums are verified (F3)', () => {
  it('clean gap-assessment bundle (incl. evidence/ header stripping) → verified', async () => {
    const { db } = makeFakeDb();
    const buffer = await bundleGapAssessmentToAnton(db, 'gap-1');

    const result = await validateAntonFile(buffer, makeFakeDb().db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('gap-assessment');
    expect(result.checksum_state).toBe('verified');
  });

  it('tampered gap-assessment evidence file → critical checksum mismatch', async () => {
    const { db } = makeFakeDb();
    const buffer = await bundleGapAssessmentToAnton(db, 'gap-1');
    const evidenceEntry = new AdmZip(buffer).getEntries().find((e) => e.entryName.startsWith('evidence/'))!;
    const tampered = withTamperedEntry(
      buffer, evidenceEntry.entryName,
      '<!-- docId: x -->\n<!-- name: x -->\n<!-- kind: document -->\n\nFORGED EVIDENCE',
    );

    const result = await validateAntonFile(tampered, makeFakeDb().db);

    expect(result.valid).toBe(false);
    expect(result.checksum_state).toBe('mismatch');
    expect(result.errors.some((e) => e.message.includes('Checksum mismatch'))).toBe(true);
  });

  it('clean legal-research-session bundle → verified; tampered citations → mismatch', async () => {
    const { db } = makeFakeDb();
    const buffer = await bundleLegalResearchSessionToAnton(db, 'lrs-1');

    const clean = await validateAntonFile(buffer, makeFakeDb().db);
    expect(clean.errors).toEqual([]);
    expect(clean.valid).toBe(true);
    expect(clean.checksum_state).toBe('verified');

    const tampered = withTamperedEntry(buffer, 'citations.json',
      JSON.stringify([{ ref: 'AMLD6 Art. 7', verification: { status: 'verified_local' }, forged: true }]));
    const result = await validateAntonFile(tampered, makeFakeDb().db);
    expect(result.valid).toBe(false);
    expect(result.checksum_state).toBe('mismatch');
    expect(result.errors.some((e) => e.message.includes('Checksum mismatch'))).toBe(true);
  });
});

// ── F1.3: market import endpoints validate before parsing ────────────────────

describe('market import endpoints validate the bundle first (F1.3)', () => {
  let server: Server;
  let base: string;
  let importerDb: ReturnType<typeof makeFakeDb>;

  beforeAll(async () => {
    importerDb = makeFakeDb();
    const { createExchangeRoutes } = await import('../../server/routes/exchange.js');
    const app = express();
    app.use(express.json());
    app.use('/api', await createExchangeRoutes(importerDb.db));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
  });

  async function postBundle(buffer: Buffer): Promise<{ status: number; json: Record<string, unknown> }> {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(buffer)]), 'index.anton');
    const r = await fetch(`${base}/api/exchange/import-bundle/market-index`, { method: 'POST', body: fd });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('rejects a tampered market-index bundle with 400 + checksum error', async () => {
    const buffer = await bundleMarketIndex(makeFakeDb().db, 'idx-1');
    const entryName = payloadEntryName(buffer, 'contents/market-indexes/');
    const tampered = withTamperedEntry(buffer, entryName, JSON.stringify({
      bundle_type: 'market-index',
      index: { name: 'Pump Index', description: 'evil', universe: ['SCAM'], holdings: [], nav_history: [], rebalances: [] },
    }));

    const before = importerDb.inserts.length;
    const { status, json } = await postBundle(tampered);

    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect((json.errors as string[]).some((e) => e.includes('Checksum mismatch'))).toBe(true);
    // Nothing was parsed or imported.
    expect(importerDb.inserts.length).toBe(before);
  });

  it('rejects a bundle with a forbidden executable', async () => {
    const buffer = await bundleMarketIndex(makeFakeDb().db, 'idx-1');
    const zip = new AdmZip(buffer);
    zip.addFile('payload.exe', Buffer.from('MZ', 'utf-8'));

    const { status, json } = await postBundle(zip.toBuffer());

    expect(status).toBe(400);
    expect((json.errors as string[]).some((e) => e.includes('payload.exe'))).toBe(true);
  });

  it('imports a clean bundle and surfaces provenance like the module path', async () => {
    const buffer = await bundleMarketIndex(makeFakeDb().db, 'idx-1');

    const { status, json } = await postBundle(buffer);

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.bundle_type).toBe('market-index');
    expect(json.validated_depth).toBe('structural');
    expect((json.provenance as Record<string, unknown>).signed).toBe(false);
    expect(importerDb.inserts.some((i) => i.sql.includes('INSERT INTO market_indexes'))).toBe(true);
  });

  it('an attachPayloadChecksum manifest survives a manual round-trip (export → mutate-free import)', async () => {
    // Sanity: re-running attachPayloadChecksum is idempotent on the verdict.
    const buffer = await bundleMarketIndex(makeFakeDb().db, 'idx-1');
    const zip = new AdmZip(buffer);
    attachPayloadChecksum(zip);
    const result = await validateAntonFile(zip.toBuffer(), makeFakeDb().db);
    expect(result.valid).toBe(true);
    expect(result.checksum_state).toBe('verified');
  });
});
