/**
 * anton-run-bundles.test.ts — Wave 2.2 + 2.5 (.anton reproducibility records):
 *
 *   2.2  `module-run` bundle
 *        • export shape: run.json / config-snapshot.json / input.md / output.md /
 *          composed-prompt.md / source-manifest.json (+ structured/quality when cached)
 *        • honesty: truncated-prompt flag carried, structured payload ONLY when
 *          hash-proven, no fabricated prompt for pre-223 runs
 *        • structural validation via the dispatching validator + import-run note
 *        • signed variant → provenance { signed: true, valid: true }
 *        • import-run creates a session: config_snapshot VERBATIM, provenance
 *          note, module-missing fallback to 'imported-run', run-artifact re-pin
 *        • REPRODUCE: the imported assistant message's config_snapshot
 *          rehydrates through the EXISTING rerun pipeline (rehydrateClaudeBody
 *          + the real /api/claude/message zod schema — the LLM seam the rerun
 *          route mocks in tests/routes/rerun.test.ts)
 *        • checksum tamper on the payload blocks import
 *
 *   2.5  `gap-assessment` + `legal-research-session` export shapes +
 *        structural validation (export-only records).
 *
 * In-memory fake DatabaseAdapter — no Postgres needed (same pattern as
 * anton-validator-dispatch.test.ts / anton-bundle-signing.test.ts).
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  bundleModuleRunToAnton,
  bundleGapAssessmentToAnton,
  bundleLegalResearchSessionToAnton,
  resolveModuleRef,
} from '../../server/services/anton-bundler.js';
import { validateAntonFile } from '../../server/services/anton-validator.js';
import { importModuleRunBundle } from '../../server/services/anton-run-importer.js';
import { signAntonBundle } from '../../server/services/anton-bundle-signing.js';
import { structuredContentHash, safeContentType } from '../../server/services/structured-extractor.js';
import { rehydrateClaudeBody } from '../../server/routes/rerun.js';

// ── In-memory fake adapter (SQL-routed) ─────────────────────────────────────

interface FakeDbOptions {
  sessionRow?: Record<string, unknown>;
  /** Latest assistant message (and the by-id lookup target). */
  assistantRow?: Record<string, unknown>;
  /** Preceding user message. */
  userRow?: Record<string, unknown>;
  artifactRow?: Record<string, unknown>;
  qualityRow?: Record<string, unknown>;
  customModuleRow?: Record<string, unknown>;
  gapAssessmentRow?: Record<string, unknown>;
  gapFindingRows?: Array<Record<string, unknown>>;
  gapIterationRows?: Array<Record<string, unknown>>;
  gapOpinionRows?: Array<Record<string, unknown>>;
  legalSessionRow?: Record<string, unknown>;
  /** Enable the instance_identity store for signing tests. */
  withIdentity?: boolean;
}

function makeFakeDb(options: FakeDbOptions = {}): {
  db: DatabaseAdapter;
  inserts: Array<{ sql: string; params: unknown[] }>;
} {
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  let identity: Record<string, unknown> | null = null;

  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM instance_identity')) {
        return (identity ?? undefined) as T | undefined;
      }
      if (sql.includes('FROM bundle_signers')) return undefined;
      if (sql.includes('FROM custom_modules')) {
        const id = params[0] as string;
        return options.customModuleRow && options.customModuleRow.id === id
          ? (options.customModuleRow as T)
          : undefined;
      }
      if (sql.includes('FROM legal_research_sessions')) return options.legalSessionRow as T | undefined;
      if (sql.includes('FROM gap_assessments')) return options.gapAssessmentRow as T | undefined;
      if (sql.includes('FROM sessions WHERE id')) return options.sessionRow as T | undefined;
      if (sql.includes("role = 'user' AND created_at <=")) return options.userRow as T | undefined;
      if (sql.includes('FROM messages WHERE id = ? AND session_id')) {
        const id = params[0] as string;
        return options.assistantRow && options.assistantRow.id === id
          ? (options.assistantRow as T)
          : undefined;
      }
      if (sql.includes("FROM messages WHERE session_id = ? AND role = 'assistant'")) {
        return options.assistantRow as T | undefined;
      }
      if (sql.includes('FROM run_artifacts')) return options.artifactRow as T | undefined;
      if (sql.includes('FROM quality_scores')) return options.qualityRow as T | undefined;
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM gap_findings')) return (options.gapFindingRows ?? []) as T[];
      if (sql.includes('FROM gap_iterations')) return (options.gapIterationRows ?? []) as T[];
      if (sql.includes('FROM gap_finding_opinions')) return (options.gapOpinionRows ?? []) as T[];
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT')) inserts.push({ sql, params });
      if (options.withIdentity && sql.includes('INSERT INTO instance_identity')) {
        identity = {
          pubkey: params[0],
          privkey: params[1],
          privkey_encrypted: params[2],
          privkey_iv: params[3],
          display_name: params[4],
        };
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, inserts };
}

function readZipEntry(buffer: Buffer, name: string): string | null {
  const entry = new AdmZip(buffer).getEntry(name);
  return entry ? entry.getData().toString('utf-8') : null;
}

function readZipJson(buffer: Buffer, name: string): any {
  const raw = readZipEntry(buffer, name);
  if (raw === null) throw new Error(`zip entry missing: ${name}`);
  return JSON.parse(raw);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'sess-run-1';
const MESSAGE_ID = 'msg-assistant-1';
const OUTPUT_MD = '# Findings\n\nAMLR Article 16 readiness is amber.\n';

const CONFIG_SNAPSHOT = {
  model: 'claude-opus-4-8',
  thinking: 'think_hard',
  creativity: 'balanced',
  transparencyLevel: 1,
  selectedOutputFormats: ['executive-summary'],
  selectedPersonas: ['aml-expert'],
  selectedSkills: [],
  knowledgeSources: { modes: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } },
  plainTextMode: false,
  writingTone: 'professional',
  systemPrompt: null,
  metaCognitiveEnabled: false,
  multiPerspective: false,
  emojiEnabled: false,
  nativeReasoningEnabled: false,
  structureReference: null,
};

const SOURCE_MANIFEST = [
  { type: 'url', name: 'https://eur-lex.example/amlr', sha256: 'aaa111', charCount: 1000, contentHashed: true },
  { type: 'uploaded', name: 'policy.pdf', sha256: 'bbb222', charCount: 500, contentHashed: true },
  { type: 'builtin', name: 'Claude built-in knowledge', contentHashed: false },
];

function runFixture(overrides: Partial<FakeDbOptions> = {}): FakeDbOptions {
  return {
    sessionRow: {
      id: SESSION_ID,
      module_id: 'gap-analysis', // real built-in module in this repo
      title: 'AMLR readiness check',
      config: '{}',
      content_type: 'analytic_report',
      // hash-proven structured cache for THIS output
      output_structured: JSON.stringify({ title: 'Findings', sections: [] }),
      structured_status: 'extracted',
      structured_hash: structuredContentHash(OUTPUT_MD, safeContentType('analytic_report')),
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:10:00.000Z',
    },
    assistantRow: {
      id: MESSAGE_ID,
      session_id: SESSION_ID,
      role: 'assistant',
      content: OUTPUT_MD,
      token_count: 1234,
      cost: 0.42,
      model_id: 'claude-opus-4-8',
      config_snapshot: JSON.stringify(CONFIG_SNAPSHOT),
      rerun_of: null,
      created_at: '2026-06-01T00:05:00.000Z',
    },
    userRow: {
      id: 'msg-user-1',
      session_id: SESSION_ID,
      role: 'user',
      content: 'Assess our AMLR Article 16 readiness please.',
      created_at: '2026-06-01T00:04:00.000Z',
    },
    artifactRow: {
      id: 'art-1',
      message_id: MESSAGE_ID,
      session_id: SESSION_ID,
      composed_prompt: 'COMPOSED SYSTEM PROMPT — all 7 layers',
      prompt_sha256: 'cafebabe'.repeat(8),
      prompt_chars: 38,
      truncated: false,
      layer_summary: JSON.stringify([{ layer: 'module', chars: 38, sha256: 'cafebabe' }]),
      source_manifest: JSON.stringify(SOURCE_MANIFEST),
    },
    qualityRow: {
      score_overall: 8.4,
      score_completeness: 9.0,
      score_accuracy: 8.0,
      score_structure: 8.5,
      score_actionability: 8.0,
      score_citations: 7.5,
      scored_at: '2026-06-01T00:06:00.000Z',
      model_used: 'claude-haiku-4-5',
    },
    ...overrides,
  };
}

// ── 2.2: module-run export shape ─────────────────────────────────────────────

describe('module-run export (Wave 2.2)', () => {
  it('packages run.json + config snapshot + prompt + manifest + input/output + structured + quality', async () => {
    const { db } = makeFakeDb(runFixture());
    const buffer = await bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID, { author: 'Tester' });

    const manifest = readZipJson(buffer, 'manifest.json');
    expect(manifest.format_version).toBe('1.0.0');
    expect(manifest.bundle_type).toBe('module-run');
    expect(manifest.generator).toMatch(/^openexpert\//);
    expect(manifest.contents.module_runs).toBe(1);
    expect(manifest.security.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Claude model pins the provider honestly
    expect(manifest.compatibility.llm_providers).toEqual(['anthropic']);

    const run = readZipJson(buffer, 'run.json').run;
    expect(run.session_id).toBe(SESSION_ID);
    expect(run.message_id).toBe(MESSAGE_ID);
    expect(run.module).toMatchObject({ id: 'gap-analysis', kind: 'builtin' });
    expect(run.model_id).toBe('claude-opus-4-8');
    expect(run.thinking).toBe('think_hard');
    expect(run.seed).toBeNull(); // honesty: no seeds in ANTON runs today
    expect(run.cost).toBe(0.42);
    expect(run.output_tokens).toBe(1234);
    expect(run.prompt).toMatchObject({ included: true, truncated: false, chars: 38 });
    expect(run.quality.overall).toBe(8.4);
    expect(run.structured_payload_included).toBe(true);
    expect(run.input_included).toBe(true);

    // Payload files, verbatim
    expect(readZipJson(buffer, 'config-snapshot.json')).toEqual(CONFIG_SNAPSHOT);
    expect(readZipEntry(buffer, 'input.md')).toBe('Assess our AMLR Article 16 readiness please.');
    expect(readZipEntry(buffer, 'output.md')).toBe(OUTPUT_MD);
    expect(readZipEntry(buffer, 'composed-prompt.md')).toBe('COMPOSED SYSTEM PROMPT — all 7 layers');
    expect(readZipJson(buffer, 'source-manifest.json')).toEqual(SOURCE_MANIFEST);
    expect(readZipJson(buffer, 'structured-payload.json')).toEqual({ title: 'Findings', sections: [] });
    expect(readZipJson(buffer, 'quality.json').overall).toBe(8.4);
    expect(readZipEntry(buffer, 'README.md')).toContain('What does NOT travel');
  });

  it('omits the structured payload when the cached hash belongs to ANOTHER output (honesty)', async () => {
    const fixture = runFixture();
    (fixture.sessionRow as Record<string, unknown>).structured_hash = 'stale-hash-from-an-earlier-turn';
    const { db } = makeFakeDb(fixture);
    const buffer = await bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID);

    expect(readZipEntry(buffer, 'structured-payload.json')).toBeNull();
    expect(readZipJson(buffer, 'run.json').run.structured_payload_included).toBe(false);
  });

  it('declares (never fabricates) a missing prompt for runs that predate artifact capture', async () => {
    const { db } = makeFakeDb(runFixture({ artifactRow: undefined, qualityRow: undefined }));
    const buffer = await bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID);

    expect(readZipEntry(buffer, 'composed-prompt.md')).toBeNull();
    expect(readZipEntry(buffer, 'quality.json')).toBeNull();
    const run = readZipJson(buffer, 'run.json').run;
    expect(run.prompt.included).toBe(false);
    expect(String(run.prompt.reason)).toMatch(/predates/i);
    // source-manifest.json still exists (empty) so readers have a stable shape
    expect(readZipJson(buffer, 'source-manifest.json')).toEqual([]);
  });

  it('carries the truncation flag honestly with the full-prompt sha256 alongside', async () => {
    const fixture = runFixture();
    (fixture.artifactRow as Record<string, unknown>).truncated = true;
    (fixture.artifactRow as Record<string, unknown>).prompt_chars = 5_000_000;
    const { db } = makeFakeDb(fixture);
    const buffer = await bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID);

    const run = readZipJson(buffer, 'run.json').run;
    expect(run.prompt.truncated).toBe(true);
    expect(run.prompt.sha256).toBe('cafebabe'.repeat(8));
    expect(readZipEntry(buffer, 'composed-prompt.md')).toContain('TRUNCATED');
  });

  it('passes the dispatching validator structurally with the import-run note', async () => {
    const { db } = makeFakeDb(runFixture());
    const buffer = await bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID);

    const result = await validateAntonFile(buffer, db);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('module-run');
    expect(result.validated_depth).toBe('structural');
    expect(result.notes?.some((n) => n.includes('/api/exchange/import-run'))).toBe(true);
  });

  it('signed variant: signAntonBundle → provenance { signed: true, valid: true }', async () => {
    const { db } = makeFakeDb(runFixture({ withIdentity: true }));
    const unsigned = await bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID);
    const signed = await signAntonBundle(db, unsigned);
    expect(signed.signed).toBe(true);

    const result = await validateAntonFile(signed.buffer, db);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.provenance?.signed).toBe(true);
    expect(result.provenance?.valid).toBe(true);
    expect(result.provenance?.signer_pubkey).toBe(signed.signer_pubkey);
  });

  it('throws on unknown session / message', async () => {
    const { db } = makeFakeDb({});
    await expect(bundleModuleRunToAnton(db, 'nope', null)).rejects.toThrow(/Session not found/);
    const { db: db2 } = makeFakeDb({ sessionRow: runFixture().sessionRow });
    await expect(bundleModuleRunToAnton(db2, SESSION_ID, 'wrong-id')).rejects.toThrow(/message not found/i);
  });
});

// ── 2.2: import-run (the read-only run viewer) ───────────────────────────────

describe('import-run creates a viewer session (Wave 2.2)', () => {
  async function exportFixtureBundle(): Promise<Buffer> {
    const { db } = makeFakeDb(runFixture());
    return bundleModuleRunToAnton(db, SESSION_ID, MESSAGE_ID);
  }

  it('creates a session with config_snapshot VERBATIM + provenance note + artifact re-pin', async () => {
    const buffer = await exportFixtureBundle();
    const importDb = makeFakeDb({}); // no modules installed here

    const result = await importModuleRunBundle(buffer, importDb.db, 'user-7');

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeTruthy();
    // gap-analysis IS a built-in module in this repo → resolved locally
    expect(result.moduleExists).toBe(true);
    expect(result.localModuleId).toBe('gap-analysis');
    expect(result.reproducible.locally).toBe(true);
    expect(result.reproducible.missingModule).toBeUndefined();
    // Hash-declared sources whose content did not travel are surfaced
    expect(result.sourcesNotIncluded.map((s) => s.name)).toEqual([
      'https://eur-lex.example/amlr',
      'policy.pdf',
    ]);
    expect(result.reproducible.notes.some((n) => n.includes('declared by hash'))).toBe(true);

    const sessionInsert = importDb.inserts.find((i) => i.sql.includes('INSERT INTO sessions'));
    expect(sessionInsert).toBeTruthy();
    // (id, module_id, title, summary, config, note, user_id, …)
    expect(sessionInsert!.params[1]).toBe('gap-analysis');
    expect(String(sessionInsert!.params[2])).toContain('Imported run');
    const note = String(sessionInsert!.params[5]);
    expect(note).toContain(`session ${SESSION_ID}`);
    expect(note).toContain('unsigned');
    expect(sessionInsert!.params[6]).toBe('user-7');

    const messageInserts = importDb.inserts.filter((i) => i.sql.includes('INSERT INTO messages'));
    expect(messageInserts.length).toBe(2);
    const userInsert = messageInserts.find((i) => i.sql.includes("'user'"))!;
    expect(userInsert.params[2]).toBe('Assess our AMLR Article 16 readiness please.');
    const assistantInsert = messageInserts.find((i) => i.sql.includes("'assistant'"))!;
    expect(assistantInsert.params[2]).toBe(OUTPUT_MD);
    expect(assistantInsert.params[5]).toBe('claude-opus-4-8'); // model_id
    expect(JSON.parse(String(assistantInsert.params[6]))).toEqual(CONFIG_SNAPSHOT); // VERBATIM

    const artifactInsert = importDb.inserts.find((i) => i.sql.includes('INSERT INTO run_artifacts'));
    expect(artifactInsert).toBeTruthy();
    expect(artifactInsert!.params[4]).toBe('cafebabe'.repeat(8)); // prompt_sha256 re-pinned
    expect(JSON.parse(String(artifactInsert!.params[8]))).toEqual(SOURCE_MANIFEST);
  });

  it('records the signer in the provenance note for a signed bundle', async () => {
    const exportSide = makeFakeDb(runFixture({ withIdentity: true }));
    const unsigned = await bundleModuleRunToAnton(exportSide.db, SESSION_ID, MESSAGE_ID);
    const { buffer } = await signAntonBundle(exportSide.db, unsigned);

    const importDb = makeFakeDb({});
    const result = await importModuleRunBundle(buffer, importDb.db);
    expect(result.success).toBe(true);
    const sessionInsert = importDb.inserts.find((i) => i.sql.includes('INSERT INTO sessions'))!;
    expect(String(sessionInsert.params[5])).toMatch(/signed by .*signature valid/);
  });

  it("falls back to 'imported-run' + missingModule hint when the module is unknown here", async () => {
    // Export a run from a CUSTOM module that the importing instance lacks.
    const fixture = runFixture();
    (fixture.sessionRow as Record<string, unknown>).module_id = 'custom-deadbeef';
    fixture.customModuleRow = {
      id: 'custom-deadbeef',
      name: 'Bespoke Analyzer',
      config: JSON.stringify({ version: '2.0.0' }),
    };
    const exportDb = makeFakeDb(fixture);
    const buffer = await bundleModuleRunToAnton(exportDb.db, SESSION_ID, MESSAGE_ID);
    expect(readZipJson(buffer, 'run.json').run.module).toMatchObject({ id: 'custom-deadbeef', kind: 'custom', name: 'Bespoke Analyzer', version: '2.0.0' });

    const importDb = makeFakeDb({}); // custom-deadbeef not installed → kind 'unknown'
    const result = await importModuleRunBundle(buffer, importDb.db);

    expect(result.success).toBe(true);
    expect(result.moduleExists).toBe(false);
    expect(result.localModuleId).toBe('imported-run');
    expect(result.reproducible.missingModule).toBe('custom-deadbeef');
    expect(result.reproducible.locally).toBe(true); // snapshot still replays
    expect(result.reproducible.notes.some((n) => n.includes('custom-deadbeef'))).toBe(true);
    const sessionInsert = importDb.inserts.find((i) => i.sql.includes('INSERT INTO sessions'))!;
    expect(sessionInsert.params[1]).toBe('imported-run');
  });

  it('blocks import when a payload file was tampered after export (checksum)', async () => {
    const buffer = await exportFixtureBundle();
    const zip = new AdmZip(buffer);
    zip.updateFile(zip.getEntry('output.md')!, Buffer.from('TAMPERED OUTPUT', 'utf-8'));

    const importDb = makeFakeDb({});
    const result = await importModuleRunBundle(zip.toBuffer(), importDb.db);

    expect(result.success).toBe(false);
    expect(result.validation.errors.some((e) => e.message.includes('Checksum mismatch'))).toBe(true);
    expect(importDb.inserts.length).toBe(0);
  });

  it('refuses non-module-run bundles with a friendly redirect', async () => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({
      format_version: '1.0.0',
      bundle_type: 'study-pack',
      contents: {},
      package: { name: 'Not a run' },
    }), 'utf-8'));
    const importDb = makeFakeDb({});

    const result = await importModuleRunBundle(zip.toBuffer(), importDb.db);
    expect(result.success).toBe(false);
    expect(result.validation.errors.some((e) => e.message.includes('study-pack'))).toBe(true);
  });
});

// ── 2.2: REPRODUCE — the existing rerun pipeline rehydrates the import ───────

describe('rerun-on-imported-run config rehydration (Wave 2.2 reproduce hook)', () => {
  it('the imported config_snapshot rehydrates into a valid /api/claude/message body with the model swapped', async () => {
    // 1) Export → import (full bundle round trip, not a hand-built snapshot).
    const exportDb = makeFakeDb(runFixture());
    const buffer = await bundleModuleRunToAnton(exportDb.db, SESSION_ID, MESSAGE_ID);
    const importDb = makeFakeDb({});
    const imported = await importModuleRunBundle(buffer, importDb.db);
    expect(imported.success).toBe(true);

    // 2) Pull exactly what the importer persisted on the assistant message —
    //    this is what POST /api/rerun reads back from the DB.
    const assistantInsert = importDb.inserts.find(
      (i) => i.sql.includes('INSERT INTO messages') && i.sql.includes("'assistant'"))!;
    const persistedSnapshot = JSON.parse(String(assistantInsert.params[6])) as Record<string, unknown>;
    const userInsert = importDb.inserts.find(
      (i) => i.sql.includes('INSERT INTO messages') && i.sql.includes("'user'"))!;

    // 3) Rehydrate through the REAL rerun helper (the route's LLM seam is the
    //    dispatched claude router — mocked end-to-end in tests/routes/rerun.test.ts).
    const body = rehydrateClaudeBody({
      snapshot: persistedSnapshot,
      newModelId: 'mistral-large-latest',
      sessionId: String(imported.sessionId),
      moduleId: String(imported.localModuleId),
      areaId: null,
      userMessage: String(userInsert.params[2]),
      history: [],
    });

    expect(body.model).toBe('mistral-large-latest');
    expect(body.thinking).toBe('think_hard');
    expect(body.creativity).toBe('balanced');
    expect(body.outputFormats).toEqual(['executive-summary']);
    expect(body.selectedPersonas).toEqual(['aml-expert']);
    expect(body.knowledgeSources).toEqual(CONFIG_SNAPSHOT.knowledgeSources);
    expect(body.userMessage).toBe('Assess our AMLR Article 16 readiness please.');
    expect(body.multiAgentEnabled).toBe(false);

    // 4) The rehydrated body satisfies the REAL pipeline schema — the rerun
    //    endpoint would accept and execute it.
    const { ClaudeMessageSchema } = await import('../../server/lib/schemas.js');
    expect(ClaudeMessageSchema.safeParse(body).success).toBe(true);
  });
});

// ── 2.5: gap-assessment export shape ─────────────────────────────────────────

describe('gap-assessment export (Wave 2.5)', () => {
  const GAP_ID = 'gap-1';
  const gapFixture: FakeDbOptions = {
    gapAssessmentRow: {
      id: GAP_ID,
      title: 'AMLR Readiness Q2',
      frameworks: JSON.stringify(['amlr']),
      scope_config: JSON.stringify({ selectedThemes: ['Governance'] }),
      context_config: JSON.stringify({
        entityType: 'bank',
        evidenceItems: [
          { docId: 'doc-1', name: 'AML Policy excerpt', kind: 'document', text: 'Our policy mandates KYC at onboarding.' },
        ],
      }),
      status: 'complete',
      evidence_manifest: JSON.stringify([
        { docId: 'doc-1', name: 'AML Policy excerpt', kind: 'document', sha256: 'feed'.repeat(16), chars: 38 },
      ]),
      board_summary: '## Board summary\nMostly amber.',
      capability_view: '{"capabilities":[]}',
      roadmap: '{"phases":[]}',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    },
    gapFindingRows: [
      {
        id: 1,
        assessment_id: GAP_ID,
        framework: 'amlr',
        article_id: 'Art.16',
        article_title: 'Business-wide risk assessment',
        requirement: 'Maintain a BWRA',
        current_state: 'Draft BWRA exists',
        score: 'amber',
        numeric_score: 55,
        priority: 'high',
        notes: 'Rationale text',
        facts: JSON.stringify({
          rubricVersion: 1,
          criteria: { documented: 'partial' },
          evidenceRefs: [{ docId: 'doc-1', quote: 'mandates KYC' }],
          warnings: [],
        }),
        rubric_version: 1,
        computed_score: 'amber',
        computed_numeric_score: 55,
        computed_priority: 'high',
        overridden_by: 'assessor@example.org',
        override_reason: 'External audit evidence raises it',
        overridden_at: '2026-06-02T00:00:00.000Z',
        override_kind: 'manual',
        carried_forward: false,
        change_reason: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    gapIterationRows: [
      { iteration_number: 1, status: 'complete', evidence_summary: 'initial', score_summary: JSON.stringify({ avg: 55 }), notes: null, created_at: '2026-06-01T12:00:00.000Z' },
    ],
    gapOpinionRows: [
      {
        framework: 'amlr', article_id: 'Art.16', article_title: 'BWRA', model_id: 'mistral-large-latest',
        facts: JSON.stringify({ criteria: { documented: 'yes' } }), computed_score: 'green',
        computed_numeric_score: 80, computed_priority: 'medium', rubric_version: 1,
        rationale: 'Second opinion rationale', current_state: null,
        evidence_refs: '[]', warnings: '[]', created_at: '2026-06-02T00:00:00.000Z',
      },
    ],
  };

  it('packages findings (facts + rubric + overrides), evidence manifest + DB-stored evidence text, iterations, second opinions', async () => {
    const { db } = makeFakeDb(gapFixture);
    const buffer = await bundleGapAssessmentToAnton(db, GAP_ID, { author: 'Assessor' });

    const manifest = readZipJson(buffer, 'manifest.json');
    expect(manifest.bundle_type).toBe('gap-assessment');
    expect(manifest.contents.gap_assessments).toBe(1);
    expect(manifest.contents.findings).toBe(1);
    expect(manifest.security.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    const findings = readZipJson(buffer, 'findings.json');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      articleId: 'Art.16',
      score: 'amber',
      numericScore: 55,
      rubricVersion: 1,
      computedScore: 'amber',
      overriddenBy: 'assessor@example.org',
      overrideReason: 'External audit evidence raises it',
      overrideKind: 'manual',
    });
    expect(findings[0].criteria).toEqual({ documented: 'partial' });
    expect(findings[0].evidenceRefs).toEqual([{ docId: 'doc-1', quote: 'mandates KYC' }]);

    // Evidence: manifest hashes + the DB-stored text item travels
    expect(readZipJson(buffer, 'evidence-manifest.json')[0]).toMatchObject({ docId: 'doc-1' });
    expect(readZipEntry(buffer, 'evidence/doc-1.md')).toContain('Our policy mandates KYC at onboarding.');
    // context.json must NOT double-ship the evidence texts
    const assessment = readZipJson(buffer, 'assessment.json').assessment;
    expect(assessment.context_config.evidenceItems).toBeUndefined();
    expect(assessment.context_config.entityType).toBe('bank');
    expect(assessment.evidence_items_included).toBe(1);

    expect(readZipJson(buffer, 'iterations.json')[0]).toMatchObject({ iterationNumber: 1, scoreSummary: { avg: 55 } });
    expect(readZipJson(buffer, 'second-opinions.json')[0]).toMatchObject({ modelId: 'mistral-large-latest', computedScore: 'green' });
    expect(readZipEntry(buffer, 'board-summary.md')).toContain('Mostly amber');
    expect(readZipEntry(buffer, 'README.md')).toContain('what travels vs what doesn');
  });

  it('passes structural validation as an export-only record', async () => {
    const { db } = makeFakeDb(gapFixture);
    const buffer = await bundleGapAssessmentToAnton(db, GAP_ID);
    const result = await validateAntonFile(buffer, db);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('gap-assessment');
    expect(result.validated_depth).toBe('structural');
  });

  it('throws for an unknown assessment', async () => {
    const { db } = makeFakeDb({});
    await expect(bundleGapAssessmentToAnton(db, 'nope')).rejects.toThrow(/not found/i);
  });
});

// ── 2.5: legal-research-session export shape ─────────────────────────────────

describe('legal-research-session export (Wave 2.5)', () => {
  const LEGAL_ID = 'legal-1';
  const legalFixture: FakeDbOptions = {
    legalSessionRow: {
      id: LEGAL_ID,
      title: 'Tipping-off under AMLD6',
      mode: 'deep-dive',
      expert_role: 'eu-regulatory-lawyer',
      research_questions: JSON.stringify([
        {
          id: 'q1',
          title: 'Does internal escalation count as tipping-off?',
          status: 'done',
          messages: [
            { role: 'user', content: 'Does internal escalation count as tipping-off?' },
            { role: 'assistant', content: 'Under Art. 39 AMLD6 … no, provided …' },
          ],
        },
      ]),
      pinned_findings: JSON.stringify([
        { id: 'p1', text: 'Internal disclosure within the group is carved out.', source: 'Art. 39(3)', pinnedAt: '2026-06-01T00:00:00.000Z' },
      ]),
      citations: JSON.stringify([
        { id: 'c1', ref: 'Directive (EU) 2015/849 Art. 39', text: '…', type: 'directive', verification: { status: 'verified_local', source: 'local-framework' } },
        { id: 'c2', ref: 'CJEU C-123/45', text: '…', type: 'case-law', verification: { status: 'unresolved' } },
      ]),
      active_knowledge_packs: JSON.stringify(['amld6-pack']),
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T01:00:00.000Z',
    },
  };

  it('packages transcript + pinned findings + citation ledger WITH statuses + config', async () => {
    const { db } = makeFakeDb(legalFixture);
    const buffer = await bundleLegalResearchSessionToAnton(db, LEGAL_ID, { author: 'Counsel' });

    const manifest = readZipJson(buffer, 'manifest.json');
    expect(manifest.bundle_type).toBe('legal-research-session');
    expect(manifest.contents.legal_research_sessions).toBe(1);
    expect(manifest.contents.research_questions).toBe(1);
    expect(manifest.contents.citations).toBe(2);
    expect(manifest.security.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    const session = readZipJson(buffer, 'session.json').session;
    expect(session).toMatchObject({
      mode: 'deep-dive',
      expert_role: 'eu-regulatory-lawyer',
      active_knowledge_packs: ['amld6-pack'],
      citations_verified: 1,
      citations_unverified_or_unresolved: 1,
    });

    const transcript = readZipJson(buffer, 'transcript.json');
    expect(transcript[0].messages).toHaveLength(2);
    expect(readZipEntry(buffer, 'transcript.md')).toContain('Does internal escalation count as tipping-off?');

    const citations = readZipJson(buffer, 'citations.json');
    expect(citations[0].verification.status).toBe('verified_local');
    expect(citations[1].verification.status).toBe('unresolved');

    expect(readZipJson(buffer, 'pinned-findings.json')[0].source).toBe('Art. 39(3)');
    expect(readZipEntry(buffer, 'README.md')).toContain('Honesty notes');
  });

  it('passes structural validation as an export-only record', async () => {
    const { db } = makeFakeDb(legalFixture);
    const buffer = await bundleLegalResearchSessionToAnton(db, LEGAL_ID);
    const result = await validateAntonFile(buffer, db);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('legal-research-session');
    expect(result.validated_depth).toBe('structural');
  });

  it('throws for an unknown session', async () => {
    const { db } = makeFakeDb({});
    await expect(bundleLegalResearchSessionToAnton(db, 'nope')).rejects.toThrow(/not found/i);
  });
});

// ── resolveModuleRef ground truth ────────────────────────────────────────────

describe('resolveModuleRef', () => {
  it('resolves built-in, custom, and unknown modules', async () => {
    const { db: empty } = makeFakeDb({});
    expect((await resolveModuleRef(empty, 'gap-analysis')).kind).toBe('builtin');
    expect((await resolveModuleRef(empty, 'definitely-not-a-module-xyz')).kind).toBe('unknown');

    const { db: withCustom } = makeFakeDb({
      customModuleRow: { id: 'custom-1', name: 'My Module', config: '{}' },
    });
    expect(await resolveModuleRef(withCustom, 'custom-1')).toMatchObject({ kind: 'custom', name: 'My Module' });
  });
});
