/**
 * renderer-registry-latex-assets.test.ts — the wire between the upload and the export.
 *
 * The renderer's own tests hand it a `latex_assets` array directly, which proves
 * it bundles correctly but says nothing about whether anything ever FILLS that
 * array. A renderer supporting a context field nobody populates is the exact
 * shape of a feature that passes its unit tests and does nothing in production
 * — the same failure mode as the `uploaded_by` guard that read a column no code
 * ever wrote to.
 *
 * So this drives `runRenderer('latex-source')` end to end over a fake database
 * and REAL files in the instance's templates directory, and asserts on the
 * archive that lands on disk. It is the only test here that fails if the
 * registry stops loading the assets.
 *
 * Note the imports: `renderer-registry.js` reads OUTPUT_DIR at module load, so
 * it is imported dynamically AFTER the env var is redirected at a temp folder.
 * A static import would write artifacts into the developer's real outputs
 * directory — and would read the env var before beforeAll ever ran.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import JSZip from 'jszip';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { BUILTIN_RENDERERS } from '../../server/services/renderer-registry.builtin.js';
import { TEMPLATES_DIR } from '../../server/services/brand-latex-assets.js';

const CLS_BYTES = Buffer.from('\\ProvidesClass{acmecorp}[2026 ACME]\n', 'utf-8');

/** Uploads live in the instance's real templates directory (gitignored). */
const STORED_NAME = 'test-registry-latex-asset.cls';
const STORED_PATH = path.join(TEMPLATES_DIR, STORED_NAME);

let outDir: string;
let savedOutputDir: string | undefined;
let savedMode: string | undefined;

/** brand_templates rows the fake db will serve. */
let brandRows: Array<{ id: string; name: string; file_path: string; original_name: string | null; user_id: string | null }>;

beforeAll(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-registry-latex-'));
  savedOutputDir = process.env.OUTPUT_DIR;
  process.env.OUTPUT_DIR = outDir;
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.writeFile(STORED_PATH, CLS_BYTES);
});

afterAll(async () => {
  if (savedOutputDir === undefined) delete process.env.OUTPUT_DIR;
  else process.env.OUTPUT_DIR = savedOutputDir;
  await fs.rm(STORED_PATH, { force: true });
  await fs.rm(outDir, { recursive: true, force: true });
});

beforeEach(() => {
  savedMode = process.env.DEPLOYMENT_MODE;
  delete process.env.DEPLOYMENT_MODE;
  brandRows = [];
});

afterEach(() => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = savedMode;
});

const LATEX_DEF = BUILTIN_RENDERERS.find(r => r.id === 'latex-source')!;

const ACME_ROW = () => ({
  id: 'tpl1', name: 'ACME class', file_path: STORED_PATH,
  original_name: 'acmecorp.cls', user_id: 'alice',
});

/** Minimal database that answers exactly the queries runRenderer makes. */
function makeDb(sessionUserId: string | null): DatabaseAdapter {
  const db = {
    dialect: 'postgresql' as const,
    async get<T>(sql: string): Promise<T | undefined> {
      if (/FROM sessions/.test(sql)) {
        return {
          id: 'sess_reg_latex', module_id: 'test-module', title: 'Report',
          user_id: sessionUserId, content_type: 'analytic_report', sector: null,
          output_structured: null, structured_status: null,
        } as unknown as T;
      }
      if (/FROM renderers/.test(sql)) {
        return {
          ...LATEX_DEF,
          applies_when: JSON.stringify(LATEX_DEF.applies_when),
          output: JSON.stringify(LATEX_DEF.output),
          preview_module: null,
          sort_order: LATEX_DEF.sort_order ?? 100,
        } as unknown as T;
      }
      if (/FROM messages/.test(sql)) {
        return { content: '# Findings\n\nResidual risk is acceptable.' } as unknown as T;
      }
      if (/FROM user_profiles/.test(sql)) return undefined;
      if (/INSERT INTO rendered_artifacts/.test(sql)) return { id: 1 } as unknown as T;
      if (/MAX\(version_number\)/.test(sql)) return { maxv: 0 } as unknown as T;
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (/FROM brand_templates/.test(sql)) {
        let rows = brandRows;
        if (/user_id\s*=\s*\?/.test(sql)) rows = rows.filter(r => r.user_id === params[0]);
        return rows as unknown as T[];
      }
      return [];
    },
    async run() { return { changes: 1, lastInsertRowid: 1 }; },
    async exec() { /* no-op */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>) { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* no-op */ },
  };
  return db as unknown as DatabaseAdapter;
}

async function runLatex(sessionUserId: string | null) {
  const { createRendererRegistry } = await import('../../server/services/renderer-registry.js');
  const registry = createRendererRegistry(makeDb(sessionUserId));
  const out = await registry.runRenderer('sess_reg_latex', 'latex-source', {}, sessionUserId);
  const abs = path.join(outDir, 'renderer-artifacts', out.file_path);
  return { out, bytes: await fs.readFile(abs) };
}

describe('runRenderer wires uploaded LaTeX assets into the export', () => {
  it('produces a plain .tex when nothing has been uploaded', async () => {
    const { out } = await runLatex(null);
    expect(out.metadata.bundled).toBe(false);
    expect(path.extname(out.file_path)).toBe('.tex');
  });

  it('produces a zip carrying the uploaded class file under its real name', async () => {
    brandRows = [ACME_ROW()];

    const { out, bytes } = await runLatex('alice');
    expect(path.extname(out.file_path)).toBe('.zip');

    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).sort();
    expect(names).toContain('acmecorp.cls');
    expect(names.some(n => n.endsWith('.tex'))).toBe(true);

    // The file is stored under a name of the server's choosing; the archive
    // must carry the name \documentclass resolves, or the bundle is useless.
    expect(names).not.toContain(STORED_NAME);
    expect((await zip.file('acmecorp.cls')!.async('nodebuffer')).equals(CLS_BYTES)).toBe(true);

    const tex = await zip.file(names.find(n => n.endsWith('.tex'))!)!.async('string');
    expect(tex).toContain('Residual risk is acceptable.');
  });

  it('records the bundle in the artifact metadata the download route reads', async () => {
    brandRows = [ACME_ROW()];
    const { out } = await runLatex('alice');
    expect(out.metadata.bundled).toBe(true);
    expect(out.metadata.bundled_files).toEqual(['acmecorp.cls']);
  });

  it("does not hand one tenant another tenant's class file in team mode", async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    brandRows = [ACME_ROW()];
    const { out } = await runLatex('bob');
    expect(out.metadata.bundled).toBe(false);
    expect(path.extname(out.file_path)).toBe('.tex');
  });
});
