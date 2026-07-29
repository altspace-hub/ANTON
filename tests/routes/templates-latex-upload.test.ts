/**
 * templates-latex-upload.test.ts — the brand-template upload allowlist, executed.
 *
 * A company that has a LaTeX house style could not upload it: `POST
 * /api/templates/upload` accepted only .docx and .pptx, so the .tex exporter
 * could name `\documentclass{acmecorp}` but never ship `acmecorp.cls`, and the
 * recipient got a document that compiles nowhere.
 *
 * ── Why this drives a real HTTP request ─────────────────────────────────────
 *
 * The allowlist lives in multer's `fileFilter`, which is a callback multer
 * invokes while parsing a multipart body. Asserting on the source text of that
 * callback proves the string '.cls' appears in the file; it does not prove
 * multer ever calls it, that the accepted file reaches disk, or that a rejected
 * one leaves nothing behind. So the router is mounted on a real Express app on
 * an ephemeral port and posted to with a real multipart body.
 *
 * The database is a stand-in, but not an inert one: it enforces the same
 * `type IN ('docx','pptx','latex')` rule as the real CHECK constraint, so a
 * route that stored 'cls' would fail here exactly as it would in production.
 * The constraint itself is verified against real PostgreSQL in
 * tests/db/brand-templates-latex.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import type { AddressInfo } from 'net';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createTemplatesRouter } from '../../server/routes/templates.js';
import { TEMPLATES_DIR } from '../../server/services/brand-latex-assets.js';

/** Mirrors the CHECK constraint migration 256 installs. */
const ALLOWED_TYPES = new Set(['docx', 'pptx', 'latex']);

interface InsertedRow {
  id: string; name: string; type: string; file_path: string;
  file_size: number; user_id: string | null; original_name: string | null;
}

const inserted: InsertedRow[] = [];

const db = {
  dialect: 'postgresql' as const,
  async get() { return undefined; },
  async all() { return []; },
  async run(sql: string, ...params: unknown[]) {
    if (/INSERT INTO brand_templates/.test(sql)) {
      const [id, name, type, file_path, file_size, user_id, original_name] = params;
      if (!ALLOWED_TYPES.has(String(type))) {
        throw new Error(
          'new row for relation "brand_templates" violates check constraint "brand_templates_type_check"',
        );
      }
      inserted.push({
        id: String(id), name: String(name), type: String(type), file_path: String(file_path),
        file_size: Number(file_size), user_id: user_id as string | null,
        original_name: (original_name ?? null) as string | null,
      });
    }
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec() { /* no-op */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>) { return fn(db as unknown as DatabaseAdapter); },
  async close() { /* no-op */ },
} as unknown as DatabaseAdapter;

let server: http.Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use('/api', await createTemplatesRouter(db));
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(async () => {
  // Uploads land in the instance's real templates directory. Remove exactly the
  // files this test created, so a passing run leaves nothing behind.
  for (const row of inserted) await fs.rm(row.file_path, { force: true });
  inserted.length = 0;
});

interface UploadResponse { status: number; body: Record<string, unknown> }

async function upload(filename: string, content: string): Promise<UploadResponse> {
  const form = new FormData();
  form.append('template', new Blob([content], { type: 'application/octet-stream' }), filename);
  const res = await fetch(`${base}/api/templates/upload`, { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Files sitting in the templates directory right now. */
async function templatesDirListing(): Promise<string[]> {
  try { return await fs.readdir(TEMPLATES_DIR); } catch { return []; }
}

describe('POST /api/templates/upload — what the allowlist accepts', () => {
  it('accepts a LaTeX class file and stores it as type latex', async () => {
    const res = await upload('acmecorp.cls', '\\ProvidesClass{acmecorp}\n');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('latex');
    expect(res.body.original_name).toBe('acmecorp.cls');

    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    // The bytes really reached disk, under a UUID name with the real extension.
    expect(existsSync(row.file_path)).toBe(true);
    expect(readFileSync(row.file_path, 'utf-8')).toBe('\\ProvidesClass{acmecorp}\n');
    expect(path.dirname(row.file_path)).toBe(TEMPLATES_DIR);
    expect(path.extname(row.file_path)).toBe('.cls');
    expect(path.basename(row.file_path, '.cls')).toBe(row.id);
  });

  it('accepts .sty and .bib as the same type', async () => {
    expect((await upload('acmecolors.sty', 'x')).body.type).toBe('latex');
    expect((await upload('refs.bib', 'x')).body.type).toBe('latex');
    expect(inserted.map(r => r.type)).toEqual(['latex', 'latex']);
  });

  it('still accepts the office formats it always did', async () => {
    expect((await upload('house.docx', 'PK')).body.type).toBe('docx');
    expect((await upload('deck.pptx', 'PK')).body.type).toBe('pptx');
    // …and does NOT give them an original_name: nothing needs it, and a value
    // there would change what the Settings list shows for existing templates.
    expect(inserted.map(r => r.original_name)).toEqual([null, null]);
  });

  it('rejects an executable, and leaves nothing on disk', async () => {
    const before = await templatesDirListing();
    const res = await upload('payload.exe', 'MZ');
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('.cls');   // the message lists what IS allowed
    expect(inserted).toHaveLength(0);
    expect(await templatesDirListing()).toEqual(before);
  });

  it('rejects an executable wearing a class-file name', async () => {
    // 'acmecorp.cls.exe' contains '.cls'. Only the last extension counts.
    const before = await templatesDirListing();
    expect((await upload('acmecorp.cls.exe', 'MZ')).status).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(await templatesDirListing()).toEqual(before);
  });

  it('rejects a file with no extension', async () => {
    expect((await upload('Makefile', 'all:')).status).toBe(400);
    expect(inserted).toHaveLength(0);
  });
});

describe('POST /api/templates/upload — a hostile filename cannot escape', () => {
  it('never lets the upload name decide where the file is written', async () => {
    const res = await upload('../../../etc/acmecorp.cls', 'x');
    expect(res.status).toBe(200);
    const row = inserted[0];
    expect(path.dirname(path.resolve(row.file_path))).toBe(path.resolve(TEMPLATES_DIR));
    expect(row.file_path).not.toContain('..');
  });

  it('records a sanitised original_name, since that name becomes an archive entry', async () => {
    await upload('..\\..\\windows\\acmecorp.cls', 'x');
    expect(inserted[0].original_name).toBe('acmecorp.cls');
  });

  it('stores no original_name it could not sanitise into a usable class name', async () => {
    // '.cls' has no stem, so \documentclass could never name it. The upload is
    // refused outright rather than stored under a name nothing can reference.
    expect((await upload('.cls', 'x')).status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('refuses a name that survives the extension check but sanitises to nothing', async () => {
    // '-.cls' HAS a .cls extension, so the allowlist admits it; stripping the
    // leading dash then leaves '.cls', which has no stem. Storing it would put a
    // latex row in the table whose file no .tex could ever reference — so the
    // upload is refused, and "every latex row has a usable filename" stays true.
    const before = await templatesDirListing();
    const res = await upload('-.cls', 'x');
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(await templatesDirListing()).toEqual(before);
  });
});

describe('POST /api/templates/upload — limits that must not drift', () => {
  it('keeps the 20 MB cap', () => {
    // Functional proof would mean posting 20 MB through the loopback on every
    // CI run. The cap is a single literal, so pin the literal and say so.
    const src = readFileSync(path.join(process.cwd(), 'server/routes/templates.ts'), 'utf-8');
    expect(src).toContain('fileSize: 20 * 1024 * 1024');
  });
});
