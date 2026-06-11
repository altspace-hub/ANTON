/**
 * anton-module-roundtrip.test.ts — export → validate → import round-trips
 * for module .anton bundles (bug B5 of CORE_EXPERIENCE_REVIEW_2026-06).
 *
 * Covers:
 *   • built-in module export (bundleBuiltinModuleToAnton) produces a
 *     hybrid-dialect bundle that the 5-step validator accepts and the
 *     importer installs
 *   • custom module export (bundleModuleToAnton) round-trips the same way
 *   • legacy flat-dialect bundles (old antonExport.ts output already in the
 *     wild) are accepted via compatibility mapping — never bricked
 *   • legacy flat non-module types get a friendly "older ANTON version" error
 *
 * Uses an in-memory fake DatabaseAdapter (same pattern as
 * default-model-store.test.ts) so no Postgres is needed.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  bundleModuleToAnton,
  bundleBuiltinModuleToAnton,
  BUNDLE_TYPE_REGISTRY,
} from '../../server/services/anton-bundler.js';
import { validateAntonFile } from '../../server/services/anton-validator.js';
import { importAntonFile } from '../../server/services/anton-importer.js';

// A built-in module that has shipped for many versions — stable test anchor.
const BUILTIN_MODULE_ID = 'gap-analysis';

// ── In-memory fake adapter ──────────────────────────────────────────────────

interface FakeDbOptions {
  /** Row returned for SELECT … FROM custom_modules */
  customModuleRow?: Record<string, unknown>;
}

function makeFakeDb(options: FakeDbOptions = {}): {
  db: DatabaseAdapter;
  inserts: Array<{ sql: string; params: unknown[] }>;
} {
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('FROM custom_modules')) {
        return options.customModuleRow as T | undefined;
      }
      // skills / personas dependency lookups → not installed
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
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

// ── Legacy flat-dialect bundle builder (replica of old antonExport.ts) ──────

function buildLegacyFlatBundle(overrides: Record<string, unknown> = {}): Buffer {
  const manifest = {
    formatVersion: '1.0',
    type: 'module',
    id: 'gap-analysis',
    name: 'AMLR Gap Analysis',
    version: '1.0.0',
    author: { name: 'openEXPERT Team', org: 'ANTON' },
    description: 'Legacy export fixture',
    area: 'fcp',
    tags: ['amlr'],
    dependencies: { skills: [], minPlatformVersion: '1.0.0' },
    toggleDefaults: { defaultReasoningMode: false, defaultWritingTone: 'professional', defaultEmojiEnabled: false },
    license: 'CC-BY-4.0',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  zip.addFile('system-prompt.md', Buffer.from('You are an AMLR gap-analysis specialist.', 'utf-8'));
  zip.addFile('config.json', Buffer.from(JSON.stringify({ label: 'AMLR Gap Analysis', defaults: { thinking: 'investigate' } }, null, 2), 'utf-8'));
  zip.addFile('README.md', Buffer.from('# AMLR Gap Analysis\n', 'utf-8'));
  zip.addFile('LICENSE', Buffer.from('CC-BY-4.0\n', 'utf-8'));
  return zip.toBuffer();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('built-in module export round-trip (B5)', () => {
  it('exports a built-in module as a hybrid-dialect bundle that validates cleanly', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID, {
      authorName: 'openEXPERT Team',
      authorOrg: 'ANTON',
      description: 'Round-trip test export',
      tags: ['test'],
      license: 'CC-BY-4.0',
    });

    const { db } = makeFakeDb();
    const result = await validateAntonFile(buffer, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifest?.meta?.id).toBe(BUILTIN_MODULE_ID);
    expect(result.manifest?.bundle_type).toBe('module');
    expect(result.manifest?.security?.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    // System prompt actually travelled
    expect(result.files?.get('system-prompt.md')?.length ?? 0).toBeGreaterThan(0);
    // Guided inputs from module.json travelled
    const guided = JSON.parse(result.files?.get('guided-inputs.json') ?? '[]');
    expect(Array.isArray(guided)).toBe(true);
    expect(guided.length).toBeGreaterThan(0);
  });

  it('imports its own built-in export through the real importer', async () => {
    const buffer = await bundleBuiltinModuleToAnton(BUILTIN_MODULE_ID);
    const { db, inserts } = makeFakeDb();

    const result = await importAntonFile(buffer, db);

    expect(result.success).toBe(true);
    expect(result.moduleId).toMatch(/^custom-[0-9a-f]{8}$/);
    expect(inserts.length).toBe(1);
    expect(inserts[0].sql).toContain('INSERT INTO custom_modules');
  });

  it('throws a clear error for an unknown built-in module', async () => {
    await expect(bundleBuiltinModuleToAnton('definitely-not-a-module-xyz')).rejects.toThrow(/Module not found/);
  });
});

describe('custom module export round-trip', () => {
  it('exports a custom module and validates + imports it cleanly', async () => {
    const customRow = {
      id: 'custom-ab12cd34',
      name: 'My Custom Module',
      short_name: 'my-custom-module',
      description: 'A test custom module',
      icon: '📦',
      area: 'custom',
      system_prompt: 'You are a helpful test module for round-trip verification.',
      config: JSON.stringify({
        author: 'Tester',
        version: '1.2.0',
        tags: ['roundtrip'],
        guidedInputs: [{ id: 'q1', type: 'text', label: 'Question' }],
        model: 'claude-opus-4-8',
      }),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    const exportDb = makeFakeDb({ customModuleRow: customRow });
    const buffer = await bundleModuleToAnton(exportDb.db, 'custom-ab12cd34');

    const importDb = makeFakeDb();
    const validation = await validateAntonFile(buffer, importDb.db);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.manifest?.meta?.name).toBe('My Custom Module');
    expect(validation.manifest?.meta?.version).toBe('1.2.0');

    const result = await importAntonFile(buffer, importDb.db);
    expect(result.success).toBe(true);
    expect(importDb.inserts.length).toBe(1);
  });
});

describe('legacy flat-dialect compatibility', () => {
  it('accepts an old flat-dialect module bundle via compatibility mapping', async () => {
    const buffer = buildLegacyFlatBundle();
    const { db } = makeFakeDb();

    const result = await validateAntonFile(buffer, db);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    // Mapped onto the hybrid shape the importer reads
    expect(result.manifest?.meta?.id).toBe('gap-analysis');
    expect(result.manifest?.meta?.author).toBe('openEXPERT Team');
    expect(result.manifest?.meta?.category).toBe('fcp');
    // The user is told it is a legacy bundle (no checksum), as a warning only
    expect(result.warnings.some(w => w.message.includes('Legacy .anton dialect'))).toBe(true);
    // config.json is mapped to default-config.json so module config survives
    const mappedConfig = JSON.parse(result.files?.get('default-config.json') ?? '{}');
    expect(mappedConfig.label).toBe('AMLR Gap Analysis');
  });

  it('imports an old flat-dialect bundle end-to-end', async () => {
    const buffer = buildLegacyFlatBundle();
    const { db, inserts } = makeFakeDb();

    const result = await importAntonFile(buffer, db);

    expect(result.success).toBe(true);
    expect(result.moduleId).toMatch(/^custom-[0-9a-f]{8}$/);
    expect(inserts.length).toBe(1);
  });

  it('rejects legacy flat non-module types with a friendly message', async () => {
    const buffer = buildLegacyFlatBundle({ type: 'skill' });
    const { db } = makeFakeDb();

    const result = await validateAntonFile(buffer, db);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('older ANTON version'))).toBe(true);
  });
});

describe('bundle type registry (B9)', () => {
  it('registers the beehive hive-collaborative-output type', () => {
    const entry = BUNDLE_TYPE_REGISTRY['hive-collaborative-output'];
    expect(entry).toBeDefined();
    expect(entry.label).toBe('Hive Collaborative Output');
    expect(entry.contentsKey).toBe('hive_collaborative_outputs');
  });
});
