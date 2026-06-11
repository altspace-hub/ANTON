/**
 * anton-validator-dispatch.test.ts — Wave 2 (.anton contract) coverage:
 *
 *   2.1  one envelope + one dispatching validator
 *        • module bundles → full deep validation (unchanged)
 *        • registered non-module types → structural pass
 *        • unknown bundle_type → friendly error naming the type
 *        • format-version 1.x tolerance (warn, don't fail)
 *        • coding + school bundles now produce spec-enveloped manifests
 *   2.6  governance fields (KP-03 generalized) round-trip + surfaced report
 *   2.8  module export fidelity: icon/color survive, keep-original-id on
 *        import, llm_providers derived from real config
 *
 * In-memory fake DatabaseAdapter — no Postgres needed (same pattern as
 * anton-module-roundtrip.test.ts).
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  bundleModuleToAnton,
  bundleBuiltinModuleToAnton,
  bundleCodingReviewProfile,
  bundleScriptLiteTemplate,
  buildSpecManifest,
  deriveLlmProviders,
  ALL_LLM_PROVIDERS,
} from '../../server/services/anton-bundler.js';
import { validateAntonFile } from '../../server/services/anton-validator.js';
import { importAntonFile } from '../../server/services/anton-importer.js';

const BUILTIN_MODULE_ID = 'gap-analysis';

// ── In-memory fake adapter (SQL-routed) ─────────────────────────────────────

interface FakeDbOptions {
  /** Row returned for the export SELECT … FROM custom_modules (many columns) */
  customModuleRow?: Record<string, unknown>;
  /** ids that already exist for the import-time `SELECT id FROM custom_modules WHERE id = ?` */
  existingModuleIds?: string[];
  /** Row returned for SELECT * FROM code_review_sessions */
  codeReviewSessionRow?: Record<string, unknown>;
  /** Row returned for SELECT * FROM sessions */
  sessionRow?: Record<string, unknown>;
  /** Rows returned for SELECT … FROM messages */
  messageRows?: Array<Record<string, unknown>>;
}

function makeFakeDb(options: FakeDbOptions = {}): {
  db: DatabaseAdapter;
  inserts: Array<{ sql: string; params: unknown[] }>;
} {
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('SELECT id FROM custom_modules')) {
        const id = params[0] as string;
        return options.existingModuleIds?.includes(id) ? ({ id } as T) : undefined;
      }
      if (sql.includes('FROM custom_modules')) return options.customModuleRow as T | undefined;
      if (sql.includes('FROM code_review_sessions')) return options.codeReviewSessionRow as T | undefined;
      if (sql.includes('FROM sessions')) return options.sessionRow as T | undefined;
      return undefined; // skills / personas lookups → not installed
    },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM messages')) return (options.messageRows ?? []) as T[];
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT')) inserts.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, inserts };
}

/** Re-zip a bundle with a mutated manifest (for version-tolerance tests). */
function withMutatedManifest(buffer: Buffer, mutate: (m: any) => void): Buffer {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('manifest.json');
  if (!entry) throw new Error('fixture bundle has no manifest');
  const manifest = JSON.parse(entry.getData().toString('utf-8'));
  mutate(manifest);
  zip.updateFile(entry, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  return zip.toBuffer();
}

const CUSTOM_ROW = {
  id: 'custom-ab12cd34',
  name: 'Fidelity Test Module',
  short_name: 'fidelity-test-module',
  description: 'Round-trip fidelity fixture',
  icon: '🦊',
  area: 'custom',
  system_prompt: 'You are a fidelity round-trip fixture module.',
  config: JSON.stringify({
    author: 'Tester',
    version: '1.0.0',
    tags: ['fidelity'],
    guidedInputs: [],
    model: 'claude-opus-4-8',
    color: '#AB34CD',
  }),
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};

// ── 2.1: dispatching validator ──────────────────────────────────────────────

describe('dispatching validator (Wave 2.1)', () => {
  it('module bundle → full deep validation with bundle_type + validated_depth', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const { db } = makeFakeDb();

    const result = await validateAntonFile(buffer, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('module');
    expect(result.validated_depth).toBe('full');
    expect(result.manifest?.security?.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('coding-review-profile bundle → structural pass (previously rejected)', async () => {
    const { db } = makeFakeDb({
      codeReviewSessionRow: {
        id: 'crs-1',
        source_type: 'folder',
        explanation_level: 'medium',
        review_lenses: JSON.stringify(['security', 'performance']),
        created_at: '2026-06-01T00:00:00.000Z',
      },
    });
    const buffer = await bundleCodingReviewProfile(db, 'crs-1');

    const result = await validateAntonFile(buffer, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('coding-review-profile');
    expect(result.validated_depth).toBe('structural');
  });

  it('script-lite bundle with script.py → structural pass, source file is a warning not an error', async () => {
    const { db } = makeFakeDb({
      sessionRow: { id: 's-1', summary: 'CSV analyzer', created_at: '2026-06-01T00:00:00.000Z' },
      messageRows: [
        { role: 'assistant', content: 'Here you go:\n```python\nprint("hello")\n```\n' },
      ],
    });
    const buffer = await bundleScriptLiteTemplate(db, 's-1');

    const result = await validateAntonFile(buffer, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('script-lite-template');
    expect(result.validated_depth).toBe('structural');
    expect(result.warnings.some((w) => w.message.includes('Source file'))).toBe(true);
  });

  it('school study-pack manifest (unified writer shape) → structural pass + import-surface note', async () => {
    // Exactly the shape routes/school.ts now builds via buildSpecManifest
    const manifest = buildSpecManifest({
      bundleType: 'study-pack',
      id: 'solo.123',
      name: 'My Study Pack',
      author: 'solo',
      tags: ['school', 'study-pack'],
      targetAreas: ['school'],
      contentsCount: { study_packs: 1, review_cards: 2 },
    });
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
    zip.addFile('contents/study-packs/review-cards.json', Buffer.from(JSON.stringify({
      bundle_type: 'study-pack',
      cards: [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }],
    }), 'utf-8'));
    const { db } = makeFakeDb();

    const result = await validateAntonFile(zip.toBuffer(), db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('study-pack');
    expect(result.validated_depth).toBe('structural');
    expect(result.notes?.some((n) => n.includes('/api/school/import-bundle'))).toBe(true);
  });

  it('declared-contents presence is enforced for contents/-layout bundles', async () => {
    const manifest = buildSpecManifest({
      bundleType: 'study-pack',
      id: 'solo.456',
      name: 'Broken Pack',
      contentsCount: { study_packs: 1 },
    });
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
    // contents/ exists, but not the declared study-packs directory
    zip.addFile('contents/other/file.json', Buffer.from('{}', 'utf-8'));
    const { db } = makeFakeDb();

    const result = await validateAntonFile(zip.toBuffer(), db);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Declared contents missing'))).toBe(true);
  });

  it('unknown bundle_type → friendly error naming the type', async () => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({
      format_version: '1.0.0',
      bundle_type: 'flux-capacitor',
      package: { name: 'Nope' },
    }), 'utf-8'));
    const { db } = makeFakeDb();

    const result = await validateAntonFile(zip.toBuffer(), db);

    expect(result.valid).toBe(false);
    expect(result.bundle_type).toBe('flux-capacitor');
    expect(result.errors.some((e) => e.message.includes('Unknown bundle type "flux-capacitor"'))).toBe(true);
  });

  it('binaries are forbidden for every type, including source-bearing ones', async () => {
    const { db } = makeFakeDb({
      sessionRow: { id: 's-2', summary: 'evil', created_at: '2026-06-01T00:00:00.000Z' },
      messageRows: [],
    });
    const clean = await bundleScriptLiteTemplate(db, 's-2');
    const zip = new AdmZip(clean);
    zip.addFile('payload.exe', Buffer.from('MZ', 'utf-8'));

    const result = await validateAntonFile(zip.toBuffer(), db);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('payload.exe'))).toBe(true);
  });
});

// ── 2.1.3: version tolerance ────────────────────────────────────────────────

describe('format-version tolerance (Wave 2.1.3)', () => {
  it('accepts a 1.x minor variation on a module bundle with a warning', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const mutated = withMutatedManifest(buffer, (m) => { m.version = '1.1.0'; });
    const { db } = makeFakeDb();

    const result = await validateAntonFile(mutated, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('1.1.0'))).toBe(true);
  });

  it('rejects a foreign major version on a module bundle', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const mutated = withMutatedManifest(buffer, (m) => { m.version = '2.0.0'; });
    const { db } = makeFakeDb();

    const result = await validateAntonFile(mutated, db);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('manifest version'))).toBe(true);
  });

  it('accepts a 1.x format_version variation on a structural bundle with a warning', async () => {
    const manifest = buildSpecManifest({
      bundleType: 'study-pack',
      id: 'solo.789',
      name: 'Versioned Pack',
      contentsCount: { study_packs: 1 },
    });
    (manifest as { format_version: string }).format_version = '1.2.0';
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf-8'));
    const { db } = makeFakeDb();

    const result = await validateAntonFile(zip.toBuffer(), db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('1.2.0'))).toBe(true);
  });
});

// ── 2.6: governance fields ──────────────────────────────────────────────────

describe('governance fields round-trip (Wave 2.6)', () => {
  const governance = {
    source_url: 'https://eur-lex.europa.eu/eli/reg/2024/1624/oj',
    validated_by: 'jane@example.org',
    effective_date: '2027-07-10',
  };

  it('written by the unified writer, surfaced by the validator', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID, { governance });
    const { db } = makeFakeDb();

    const result = await validateAntonFile(buffer, db);

    expect(result.valid).toBe(true);
    expect(result.governance).toEqual(governance);
    expect(result.warnings.some((w) => w.message.includes('validated by jane@example.org'))).toBe(true);
    expect(result.manifest?.governance).toEqual(governance);
  });

  it('omitted entirely when unknown — never fabricated', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const zip = new AdmZip(buffer);
    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf-8'));

    expect(manifest.governance).toBeUndefined();
  });

  it('survives export → import (re-import sees the same governance)', async () => {
    const exportDb = makeFakeDb({ customModuleRow: CUSTOM_ROW });
    const buffer = await bundleModuleToAnton(exportDb.db, CUSTOM_ROW.id, { governance });

    const importDb = makeFakeDb();
    const result = await importAntonFile(buffer, importDb.db);

    expect(result.success).toBe(true);
    expect(result.validation.governance).toEqual(governance);
  });

  it('knowledge-pack dialect root-level KP-03 fields are recognised', async () => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({
      bundle_type: 'regulatory-knowledge-pack',
      name: 'amlr-2024',
      version: '1.0.0',
      effective_date: '2027-07-10',
      source_url: 'https://eur-lex.europa.eu/eli/reg/2024/1624/oj',
      validated_by: 'FCP Team',
      content_confirmed: true,
    }), 'utf-8'));
    zip.addFile('entities.json', Buffer.from('[]', 'utf-8'));
    const { db } = makeFakeDb();

    const result = await validateAntonFile(zip.toBuffer(), db);

    expect(result.valid).toBe(true);
    expect(result.bundle_type).toBe('regulatory-knowledge-pack');
    expect(result.governance?.validated_by).toBe('FCP Team');
    expect(result.governance?.content_confirmed).toBe(true);
    expect(result.notes?.some((n) => n.includes('/api/knowledge-packs/import'))).toBe(true);
  });
});

// ── 2.8: module export fidelity ─────────────────────────────────────────────

describe('module export fidelity (Wave 2.8)', () => {
  it('icon + color travel through export → import (no more 📦 reset)', async () => {
    const exportDb = makeFakeDb({ customModuleRow: CUSTOM_ROW });
    const buffer = await bundleModuleToAnton(exportDb.db, CUSTOM_ROW.id);

    const importDb = makeFakeDb();
    const result = await importAntonFile(buffer, importDb.db);

    expect(result.success).toBe(true);
    expect(importDb.inserts.length).toBe(1);
    const params = importDb.inserts[0].params;
    // icon is the 5th column in the INSERT
    expect(params[4]).toBe('🦊');
    // color rides in the config blob so it survives a re-export
    const config = JSON.parse(params[7] as string) as Record<string, unknown>;
    expect(config.color).toBe('#AB34CD');
  });

  it('keepId keeps the original id when it is free', async () => {
    const exportDb = makeFakeDb({ customModuleRow: CUSTOM_ROW });
    const buffer = await bundleModuleToAnton(exportDb.db, CUSTOM_ROW.id);

    const importDb = makeFakeDb();
    const result = await importAntonFile(buffer, importDb.db, undefined, { keepId: true });

    expect(result.success).toBe(true);
    expect(result.moduleId).toBe('custom-ab12cd34');
    expect(result.keptOriginalId).toBe(true);
  });

  it('keepId falls back to a generated id on collision', async () => {
    const exportDb = makeFakeDb({ customModuleRow: CUSTOM_ROW });
    const buffer = await bundleModuleToAnton(exportDb.db, CUSTOM_ROW.id);

    const importDb = makeFakeDb({ existingModuleIds: ['custom-ab12cd34'] });
    const result = await importAntonFile(buffer, importDb.db, undefined, { keepId: true });

    expect(result.success).toBe(true);
    expect(result.moduleId).not.toBe('custom-ab12cd34');
    expect(result.moduleId).toMatch(/^custom-[0-9a-f]{8}$/);
    expect(result.keptOriginalId).toBe(false);
  });

  it('without keepId the importer generates a fresh id (existing behaviour)', async () => {
    const exportDb = makeFakeDb({ customModuleRow: CUSTOM_ROW });
    const buffer = await bundleModuleToAnton(exportDb.db, CUSTOM_ROW.id);

    const importDb = makeFakeDb();
    const result = await importAntonFile(buffer, importDb.db);

    expect(result.success).toBe(true);
    expect(result.moduleId).toMatch(/^custom-[0-9a-f]{8}$/);
    expect(result.moduleId).not.toBe('custom-ab12cd34');
  });

  it('llm_providers derive from the configured model — claude pins anthropic', async () => {
    const exportDb = makeFakeDb({ customModuleRow: CUSTOM_ROW });
    const buffer = await bundleModuleToAnton(exportDb.db, CUSTOM_ROW.id);
    const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));

    expect(manifest.compatibility.llm_providers).toEqual(['anthropic']);
  });

  it('llm_providers fall back to the honest universal list when no model is configured', async () => {
    // gap-analysis module.json carries no model — provider-agnostic
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));

    expect(manifest.compatibility.llm_providers).toEqual([...ALL_LLM_PROVIDERS]);
    expect(manifest.compatibility.llm_providers.length).toBeGreaterThan(1);
  });

  it('deriveLlmProviders ground-truth mapping', () => {
    expect(deriveLlmProviders({ model: 'claude-opus-4-8' })).toEqual(['anthropic']);
    expect(deriveLlmProviders({ model: 'gpt-4o' })).toEqual(['openai']);
    expect(deriveLlmProviders({ model: 'gemini-2.0-flash' })).toEqual(['google']);
    expect(deriveLlmProviders({ model: 'mistral-large-latest' })).toEqual(['mistral']);
    expect(deriveLlmProviders({ model: 'compat:groq:llama-3.3-70b' })).toEqual(['openai-compatible']);
    expect(deriveLlmProviders({ defaults: { model: 'claude-haiku-4-5' } })).toEqual(['anthropic']);
    expect(deriveLlmProviders({})).toEqual([...ALL_LLM_PROVIDERS]);
    expect(deriveLlmProviders(undefined)).toEqual([...ALL_LLM_PROVIDERS]);
  });
});

// ── coding + school bundles are spec-enveloped (Wave 2.1 writer unification) ─

describe('spec envelope on previously ad-hoc manifests', () => {
  it('coding-review-profile manifest carries the full envelope + legacy fields', async () => {
    const { db } = makeFakeDb({
      codeReviewSessionRow: {
        id: 'crs-9',
        source_type: 'github',
        explanation_level: 'deep',
        review_lenses: JSON.stringify(['security']),
        created_at: '2026-06-01T00:00:00.000Z',
      },
    });
    const buffer = await bundleCodingReviewProfile(db, 'crs-9');
    const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));

    // Envelope
    expect(manifest.format_version).toBe('1.0.0');
    expect(manifest.bundle_type).toBe('coding-review-profile');
    expect(typeof manifest.created_at).toBe('string');
    expect(manifest.generator).toMatch(/^openexpert\//);
    expect(manifest.package?.name).toContain('github');
    expect(manifest.contents?.coding_review_profiles).toBe(1);
    // Legacy ad-hoc fields preserved (read-old/write-new)
    expect(manifest.type).toBe('coding-review-profile');
    expect(manifest.review_lenses).toEqual(['security']);
  });

  it('script-lite manifest carries the envelope and validates', async () => {
    const { db } = makeFakeDb({
      sessionRow: { id: 's-3', summary: 'Quick parser', created_at: '2026-06-01T00:00:00.000Z' },
      messageRows: [],
    });
    const buffer = await bundleScriptLiteTemplate(db, 's-3');
    const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8'));

    expect(manifest.format_version).toBe('1.0.0');
    expect(manifest.bundle_type).toBe('script-lite-template');
    expect(manifest.generator).toMatch(/^openexpert\//);
    expect(manifest.session_id).toBe('s-3'); // bespoke field preserved

    const result = await validateAntonFile(buffer, db);
    expect(result.valid).toBe(true);
    expect(result.validated_depth).toBe('structural');
  });

  it('school manifests (buildSpecManifest with targetAreas) keep the shape the school importer reads', () => {
    const manifest = buildSpecManifest({
      bundleType: 'lesson-plan',
      id: 'lesson-1',
      name: 'Fractions 101',
      author: 'teacher-1',
      tags: ['school', 'lesson-plan'],
      targetAreas: ['school'],
      contentsCount: { lesson_plans: 1 },
    });

    // routes/school.ts import path reads: format_version, bundle_type, package.name, contents
    expect(manifest.format_version).toBe('1.0.0');
    expect(manifest.bundle_type).toBe('lesson-plan');
    expect(manifest.package.name).toBe('Fractions 101');
    expect(manifest.package.target_areas).toEqual(['school']);
    expect(manifest.contents.lesson_plans).toBe(1);
  });
});

// ── importer redirect for non-module types ──────────────────────────────────

describe('module importer refuses non-module bundles with a redirect', () => {
  it('returns a friendly error naming the type instead of crashing', async () => {
    const { db } = makeFakeDb({
      codeReviewSessionRow: {
        id: 'crs-5',
        source_type: 'folder',
        explanation_level: 'medium',
        review_lenses: '[]',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    });
    const buffer = await bundleCodingReviewProfile(db, 'crs-5');

    const importDb = makeFakeDb();
    const result = await importAntonFile(buffer, importDb.db);

    expect(result.success).toBe(false);
    expect(importDb.inserts.length).toBe(0);
    expect(result.validation.errors.some((e) => e.message.includes('coding-review-profile'))).toBe(true);
  });
});
