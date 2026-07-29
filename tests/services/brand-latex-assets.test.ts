/**
 * brand-latex-assets.test.ts — the upload taxonomy and the asset loader.
 *
 * Two things are being pinned here, and they are different in kind:
 *
 *  1. `brandTemplateTypeForFilename` IS the upload allowlist. routes/templates.ts
 *     calls it from multer's fileFilter and again to pick the stored `type`, so
 *     a bug here is simultaneously "the wrong files are accepted" and "the
 *     accepted file is stored as something the CHECK constraint rejects".
 *
 *  2. `loadLatexBrandAssets` reads files off disk on behalf of a session. It is
 *     therefore the boundary where a database row turns into bytes, and it is
 *     tested against a REAL temp directory with REAL files rather than a mocked
 *     fs — the containment check it performs is a path comparison, and a mocked
 *     fs would let a wrong comparison pass.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  brandTemplateTypeForFilename,
  safeLatexAssetName,
  loadLatexBrandAssets,
  BRAND_TEMPLATE_UPLOAD_TYPES,
  LATEX_ASSET_EXTENSIONS,
} from '../../server/services/brand-latex-assets.js';

// ── The allowlist ─────────────────────────────────────────────────────────

describe('brandTemplateTypeForFilename — what may be uploaded at all', () => {
  it('accepts the LaTeX house-style extensions', () => {
    expect(brandTemplateTypeForFilename('acmecorp.cls')).toBe('latex');
    expect(brandTemplateTypeForFilename('acmestyle.sty')).toBe('latex');
    expect(brandTemplateTypeForFilename('refs.bib')).toBe('latex');
  });

  it('still accepts the two office formats it always did', () => {
    expect(brandTemplateTypeForFilename('house.docx')).toBe('docx');
    expect(brandTemplateTypeForFilename('deck.pptx')).toBe('pptx');
  });

  it('rejects an executable', () => {
    expect(brandTemplateTypeForFilename('payload.exe')).toBeNull();
  });

  it('rejects an executable wearing a class-file name, because only the LAST extension counts', () => {
    // The reason .exe must be checked against the real extension and not merely
    // "does the name contain .cls": `acmecorp.cls.exe` is an executable.
    expect(brandTemplateTypeForFilename('acmecorp.cls.exe')).toBeNull();
    // And the inverse must still work — a dotted stem is a legal class name.
    expect(brandTemplateTypeForFilename('acme.corp.cls')).toBe('latex');
  });

  it('rejects a file with no extension, and a bare dotfile', () => {
    expect(brandTemplateTypeForFilename('README')).toBeNull();
    expect(brandTemplateTypeForFilename('.cls')).toBeNull();
  });

  it('is case-insensitive on the extension', () => {
    expect(brandTemplateTypeForFilename('ACMECORP.CLS')).toBe('latex');
    expect(brandTemplateTypeForFilename('House.DocX')).toBe('docx');
  });

  it('maps every LaTeX extension to the single stored type, and only those', () => {
    // Guards the derived constant: if LATEX_ASSET_EXTENSIONS ever stopped being
    // derived from the map, the traversal tests below would still pass while the
    // route accepted extensions the renderer refuses to bundle.
    expect([...LATEX_ASSET_EXTENSIONS].sort()).toEqual(['.bib', '.cls', '.sty']);
    for (const ext of LATEX_ASSET_EXTENSIONS) {
      expect(BRAND_TEMPLATE_UPLOAD_TYPES[ext]).toBe('latex');
    }
  });
});

// ── Filename safety ───────────────────────────────────────────────────────

describe('safeLatexAssetName — what may become an archive entry', () => {
  it('keeps an ordinary class file name unchanged', () => {
    expect(safeLatexAssetName('acmecorp.cls')).toBe('acmecorp.cls');
    expect(safeLatexAssetName('acme-corp_2026.sty')).toBe('acme-corp_2026.sty');
  });

  it('strips POSIX directory components', () => {
    expect(safeLatexAssetName('../../../etc/passwd.cls')).toBe('passwd.cls');
  });

  it('strips Windows directory components regardless of the host OS', () => {
    // path.basename is platform-dependent: on Linux it does not treat "\" as a
    // separator, so a helper built on it would let this through whole. The
    // instance must not be safe only on Windows.
    //
    // Be honest about what this assertion is worth WHERE it runs: on a Windows
    // developer machine it passes with either implementation, because
    // path.basename splits on "\" there too. It is the ubuntu-latest CI run
    // that makes it load-bearing — which is also the OS a hosted ANTON runs on.
    expect(safeLatexAssetName('..\\..\\windows\\system32\\evil.cls')).toBe('evil.cls');
  });

  it('never returns a name containing a separator or a traversal segment', () => {
    for (const raw of [
      '../evil.cls', '..\\evil.cls', 'a/b/c.cls', 'a\\b\\c.cls',
      '....//evil.cls', 'x.cls/../y.cls',
    ]) {
      const out = safeLatexAssetName(raw);
      if (out === null) continue;
      expect(out).not.toContain('/');
      expect(out).not.toContain('\\');
      expect(out.split(path.sep)).toHaveLength(1);
      expect(out.startsWith('.')).toBe(false);
    }
  });

  it('rejects a name whose extension is not a LaTeX one', () => {
    expect(safeLatexAssetName('payload.exe')).toBeNull();
    expect(safeLatexAssetName('house.docx')).toBeNull();
    expect(safeLatexAssetName('notes')).toBeNull();
  });

  it('rejects a name with no stem, since \\documentclass needs one', () => {
    expect(safeLatexAssetName('.cls')).toBeNull();
    expect(safeLatexAssetName('...cls')).toBeNull();
  });

  it('rejects rather than repairs when sanitising would destroy the extension', () => {
    // "evil.cls\0.exe" — the classic NUL-truncation trick. Rewriting the NUL
    // to "_" leaves ".exe" as the extension, which is not allowed, so the file is
    // dropped instead of being silently renamed into something that looks fine.
    expect(safeLatexAssetName('evil.cls\0.exe')).toBeNull();
  });

  it('replaces exotic characters rather than passing them through', () => {
    const out = safeLatexAssetName('acme corp\n(2026).cls');
    expect(out).toBe('acme_corp__2026_.cls');
  });
});

// ── The loader ────────────────────────────────────────────────────────────

interface Row { id: string; name: string; file_path: string; original_name: string | null; user_id: string | null }

/** A DatabaseAdapter that serves rows from an array, honouring the two queries used. */
function fakeDb(rows: Row[], onQuery?: (sql: string, params: unknown[]) => void): DatabaseAdapter {
  const db = {
    dialect: 'postgresql' as const,
    async get() { return undefined; },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      onQuery?.(sql, params);
      let out = rows;
      if (/user_id\s*=\s*\?/.test(sql)) out = out.filter(r => r.user_id === params[0]);
      return out as unknown as T[];
    },
    async run() { return { changes: 0, lastInsertRowid: 0 }; },
    async exec() { /* no-op */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>) { return fn(db); },
    async close() { /* no-op */ },
  };
  return db as unknown as DatabaseAdapter;
}

let dir: string;
let outsideDir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-latex-assets-'));
  outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-latex-outside-'));
  await fs.writeFile(path.join(dir, 'a1.cls'), '% acmecorp class\n');
  await fs.writeFile(path.join(dir, 'a2.sty'), '% acmecorp style\n');
  await fs.writeFile(path.join(outsideDir, 'secret.cls'), '% not a brand asset\n');
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outsideDir, { recursive: true, force: true });
});

let savedMode: string | undefined;
beforeEach(() => { savedMode = process.env.DEPLOYMENT_MODE; delete process.env.DEPLOYMENT_MODE; });
afterEach(() => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = savedMode;
});

const row = (over: Partial<Row> = {}): Row => ({
  id: 'r1', name: 'ACME class', file_path: path.join(dir, 'a1.cls'),
  original_name: 'acmecorp.cls', user_id: 'alice', ...over,
});

describe('loadLatexBrandAssets', () => {
  it('returns the file under its ORIGINAL name, not the name it is stored as', async () => {
    const assets = await loadLatexBrandAssets(fakeDb([row()]), 'alice', { templatesDir: dir });
    expect(assets.map(a => a.filename)).toEqual(['acmecorp.cls']);
    expect(assets[0].content.toString('utf-8')).toBe('% acmecorp class\n');
  });

  it('returns nothing when the instance has never uploaded one', async () => {
    expect(await loadLatexBrandAssets(fakeDb([]), 'alice', { templatesDir: dir })).toEqual([]);
  });

  it('refuses a row whose file_path points outside the templates directory', async () => {
    const assets = await loadLatexBrandAssets(
      fakeDb([row({ file_path: path.join(outsideDir, 'secret.cls') })]),
      'alice', { templatesDir: dir },
    );
    expect(assets).toEqual([]);
  });

  it('refuses a traversal that only LOOKS like it is inside the directory', async () => {
    const assets = await loadLatexBrandAssets(
      fakeDb([row({ file_path: path.join(dir, '..', path.basename(outsideDir), 'secret.cls') })]),
      'alice', { templatesDir: dir },
    );
    expect(assets).toEqual([]);
  });

  it('skips a row whose file has been deleted from disk', async () => {
    const assets = await loadLatexBrandAssets(
      fakeDb([row({ file_path: path.join(dir, 'gone.cls') })]),
      'alice', { templatesDir: dir },
    );
    expect(assets).toEqual([]);
  });

  it('skips a file larger than the cap without dropping the ones that fit', async () => {
    const assets = await loadLatexBrandAssets(
      fakeDb([row(), row({ id: 'r2', file_path: path.join(dir, 'a2.sty'), original_name: 'acme.sty' })]),
      'alice', { templatesDir: dir, maxFileBytes: 16 },
    );
    // 'a1.cls' is 17 bytes, 'a2.sty' is 17 — both over. Prove the cap bites at all:
    expect(assets).toEqual([]);
    const both = await loadLatexBrandAssets(
      fakeDb([row(), row({ id: 'r2', file_path: path.join(dir, 'a2.sty'), original_name: 'acme.sty' })]),
      'alice', { templatesDir: dir },
    );
    expect(both.map(a => a.filename)).toEqual(['acmecorp.cls', 'acme.sty']);
  });

  it('honours the file-count cap', async () => {
    const rows = [row(), row({ id: 'r2', file_path: path.join(dir, 'a2.sty'), original_name: 'acme.sty' })];
    const assets = await loadLatexBrandAssets(fakeDb(rows), 'alice', { templatesDir: dir, maxFiles: 1 });
    expect(assets.map(a => a.filename)).toEqual(['acmecorp.cls']);
  });

  it('lets a re-upload under the same name replace the older content', async () => {
    const rows = [
      row({ id: 'old' }),
      row({ id: 'new', file_path: path.join(dir, 'a2.sty'), original_name: 'acmecorp.cls' }),
    ];
    const assets = await loadLatexBrandAssets(fakeDb(rows), 'alice', { templatesDir: dir });
    expect(assets).toHaveLength(1);
    expect(assets[0].content.toString('utf-8')).toBe('% acmecorp style\n');
  });

  it('queries only type = latex, so a docx template can never be bundled', async () => {
    let seen = '';
    await loadLatexBrandAssets(fakeDb([row()], sql => { seen = sql; }), 'alice', { templatesDir: dir });
    expect(seen).toMatch(/type\s*=\s*'latex'/);
  });

  it('degrades to no bundle rather than throwing when the query fails', async () => {
    // A database predating migration 256 has no original_name column. That must
    // mean "no house style", not "the export failed".
    const broken = {
      dialect: 'postgresql' as const,
      async get() { return undefined; },
      async all(): Promise<never[]> { throw new Error('column "original_name" does not exist'); },
      async run() { return { changes: 0, lastInsertRowid: 0 }; },
      async exec() { /* no-op */ },
      async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>) { return fn(broken as unknown as DatabaseAdapter); },
      async close() { /* no-op */ },
    } as unknown as DatabaseAdapter;
    await expect(loadLatexBrandAssets(broken, 'alice', { templatesDir: dir })).resolves.toEqual([]);
  });
});

describe('loadLatexBrandAssets ownership', () => {
  const rows = () => [
    row({ id: 'alice-cls', user_id: 'alice' }),
    row({ id: 'bob-sty', user_id: 'bob', file_path: path.join(dir, 'a2.sty'), original_name: 'bobcorp.sty' }),
    row({ id: 'legacy', user_id: null, file_path: path.join(dir, 'a2.sty'), original_name: 'legacy.sty' }),
  ];

  it('solo mode sees every template on the instance, including unattributed ones', () => {
    // One human owns the machine; filtering strictly would make their own
    // pre-attribution uploads vanish from their own export.
    delete process.env.DEPLOYMENT_MODE;
    return expect(
      loadLatexBrandAssets(fakeDb(rows()), null, { templatesDir: dir }).then(a => a.map(x => x.filename)),
    ).resolves.toEqual(['acmecorp.cls', 'bobcorp.sty', 'legacy.sty']);
  });

  it('team mode gives a session only its OWNER\'s assets', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const assets = await loadLatexBrandAssets(fakeDb(rows()), 'alice', { templatesDir: dir });
    expect(assets.map(a => a.filename)).toEqual(['acmecorp.cls']);
  });

  it('team mode withholds unattributed rows — a company asset fails closed', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const assets = await loadLatexBrandAssets(fakeDb(rows()), 'bob', { templatesDir: dir });
    expect(assets.map(a => a.filename)).toEqual(['bobcorp.sty']);
  });

  it('team mode gives an ownerless session nothing, and does not even query', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    let queried = false;
    const assets = await loadLatexBrandAssets(fakeDb(rows(), () => { queried = true; }), null, { templatesDir: dir });
    expect(assets).toEqual([]);
    expect(queried).toBe(false);
  });
});
