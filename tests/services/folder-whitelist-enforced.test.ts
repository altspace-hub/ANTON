/**
 * folder-whitelist-enforced.test.ts
 *
 * Proves ALLOWED_FOLDER_PATHS is actually CONSULTED on the knowledge-read path,
 * not merely that the helper works in isolation. Before this suite the whitelist
 * was enforced by exactly one route (folders.ts) while knowledge-resolver's
 * localFolder mode, POST /api/knowledge-library and the RAG indexer read any
 * directory a request body named.
 *
 * Every "refused" case is paired with an "allowed" case on purpose: a guard that
 * blocks everyone is not a fix, it is an outage. The allowed half is what makes
 * these tests fail if someone hard-codes `return false`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

import { checkFolderPath, getAllowedFolderBases } from '../../server/lib/folder-guard.js';
import { resolveKnowledgeSources } from '../../server/services/knowledge-resolver.js';
import { indexFolder } from '../../server/services/rag/indexer.js';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { KnowledgeSourceConfig } from '../../src/lib/types.js';

// ── Two sibling temp trees: one inside the whitelist, one outside ────────────

let sandbox = '';
let allowedDir = '';
let forbiddenDir = '';
const savedAllowed = process.env.ALLOWED_FOLDER_PATHS;

const ALLOWED_MARKER = 'ALLOWED-MARKER-a1b2c3';
const SECRET_MARKER = 'SECRET-MARKER-d4e5f6';

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-folder-guard-'));
  allowedDir = path.join(sandbox, 'allowed');
  forbiddenDir = path.join(sandbox, 'private-docs');
  fs.mkdirSync(allowedDir, { recursive: true });
  fs.mkdirSync(forbiddenDir, { recursive: true });

  fs.writeFileSync(path.join(allowedDir, 'policy.md'), `# Policy\n${ALLOWED_MARKER}\n`, 'utf8');
  fs.writeFileSync(path.join(forbiddenDir, 'diary.md'), `# Diary\n${SECRET_MARKER}\n`, 'utf8');
  // A file type the caller can smuggle past SUPPORTED_EXTENSIONS via fileFilter:
  // text-extractor HANDLES .xls (extractXlsx covers .xlsx and .xls) but the
  // resolver's supported list does not name it, so an unclamped filter of
  // ['.xls'] really does pull this content into the prompt. It has to be a
  // genuinely parseable workbook or the clamp test proves nothing.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[SECRET_MARKER]]), 'S');
  // XLSX.writeFile needs set_fs() under ESM; write to a buffer instead.
  const xlsBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer;
  fs.writeFileSync(path.join(allowedDir, 'legacy.xls'), xlsBuf);
});

afterAll(() => {
  if (savedAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
  else process.env.ALLOWED_FOLDER_PATHS = savedAllowed;
  fs.rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.ALLOWED_FOLDER_PATHS = allowedDir;
});

function localFolderConfig(folderPaths: string[], fileFilter?: string[]): KnowledgeSourceConfig {
  return {
    modes: {
      claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
      onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
      localFolder: { enabled: true, folderPaths, fileFilter, recursive: true },
      combinedMode: { enabled: false, priority: 'merged' },
    },
  };
}

// ── 1. The helper itself ────────────────────────────────────────────────────

describe('checkFolderPath', () => {
  it('allows the base itself and anything under it', () => {
    expect(checkFolderPath(allowedDir).ok).toBe(true);
    expect(checkFolderPath(path.join(allowedDir, 'sub', 'deep')).ok).toBe(true);
  });

  it('refuses a traversal that only LOOKS like it is inside (resolve before compare)', () => {
    // Built by string concatenation on purpose: path.join() would normalise the
    // ".." away here in the TEST and the case would then prove nothing about the
    // helper. A request body can carry exactly this unnormalised shape, and it
    // startsWith(allowedDir + sep) — only resolving before comparing catches it.
    const escaping = allowedDir + path.sep + '..' + path.sep + 'private-docs';
    expect(escaping.startsWith(allowedDir + path.sep)).toBe(true);

    const r = checkFolderPath(escaping);
    expect(r.ok).toBe(false);
    // The verdict must be about the resolved target, not the literal string.
    expect(r.resolved).toBe(forbiddenDir);
  });

  it('refuses a sibling that shares the base as a string prefix', () => {
    // "<allowedDir>-backup" startsWith "<allowedDir>" — the separator check is
    // what stops it. Removing `+ path.sep` makes this case pass wrongly.
    expect(checkFolderPath(allowedDir + '-backup').ok).toBe(false);
  });

  it('refuses relative paths and non-strings', () => {
    expect(checkFolderPath('uploads').ok).toBe(false);
    expect(checkFolderPath(undefined).ok).toBe(false);
    expect(checkFolderPath(42).ok).toBe(false);
  });

  it('falls back to ANTON-owned uploads/outputs when the env var is unset — never to "anything"', () => {
    const bases = getAllowedFolderBases({} as NodeJS.ProcessEnv);
    expect(bases).toEqual([path.resolve('./uploads'), path.resolve('./outputs')]);
    expect(checkFolderPath(forbiddenDir, {} as NodeJS.ProcessEnv).ok).toBe(false);
  });
});

// ── 2. knowledge-resolver localFolder mode (finding 1) ──────────────────────

describe('resolveKnowledgeSources — localFolder mode honours the whitelist', () => {
  it('does NOT read a folder outside ALLOWED_FOLDER_PATHS into the prompt', async () => {
    const result = await resolveKnowledgeSources(localFolderConfig([forbiddenDir]));

    expect(result.contextDocuments).not.toContain(SECRET_MARKER);
    expect(result.contextDocuments).toContain('REFUSED');
    // Nothing may be reported as a hashed source either — the run manifest must
    // not claim provenance for a file that was never (and must never be) read.
    expect(result.sourceDetails?.some(d => d.contentHashed)).toBe(false);
    expect(result.sourceManifest).toEqual([]);
  });

  it('still reads a folder that IS on the whitelist', async () => {
    const result = await resolveKnowledgeSources(localFolderConfig([allowedDir]));

    expect(result.contextDocuments).toContain(ALLOWED_MARKER);
    expect(result.sourceManifest).toContain('policy.md (local)');
  });

  it('reads the allowed folder even when a forbidden one is listed alongside it', async () => {
    const result = await resolveKnowledgeSources(localFolderConfig([forbiddenDir, allowedDir]));

    expect(result.contextDocuments).toContain(ALLOWED_MARKER);
    expect(result.contextDocuments).not.toContain(SECRET_MARKER);
  });

  it('will not let a caller-supplied fileFilter widen the supported extensions', async () => {
    // The folder itself IS whitelisted, so only the extension clamp can keep
    // .xls out. Types the extractor cannot parse (.pem, .key, extensionless
    // files matched by a filter of ['']) already come back null and so never
    // reach the prompt — .xls is the case where the clamp is load-bearing.
    const result = await resolveKnowledgeSources(localFolderConfig([allowedDir], ['.xls']));

    expect(result.contextDocuments).not.toContain(SECRET_MARKER);
    expect(result.sourceManifest).not.toContain('legacy.xls (local)');
  });

  it('still honours a fileFilter that narrows within the supported set', async () => {
    const result = await resolveKnowledgeSources(localFolderConfig([allowedDir], ['.md']));
    expect(result.contextDocuments).toContain(ALLOWED_MARKER);
  });
});

// ── 3. The RAG indexer (finding 2, last line of defence) ────────────────────

describe('indexFolder', () => {
  /** Records every write so we can assert nothing reached document_chunks. */
  function recordingDb() {
    const calls: string[] = [];
    const db = {
      run: async (sql: string) => { calls.push(sql); return { changes: 0 }; },
      get: async () => undefined,
      all: async () => [],
    } as unknown as DatabaseAdapter;
    return { db, calls };
  }

  it('refuses a folder outside ALLOWED_FOLDER_PATHS and writes nothing', async () => {
    const { db, calls } = recordingDb();
    await expect(indexFolder(db, forbiddenDir)).rejects.toThrow(/ALLOWED_FOLDER_PATHS/);
    expect(calls).toEqual([]);
  });

  it('indexes a whitelisted folder as before', async () => {
    const { db, calls } = recordingDb();
    const result = await indexFolder(db, allowedDir);
    expect(result.documents).toBeGreaterThan(0);
    expect(calls.some(sql => sql.includes('document_chunks'))).toBe(true);
  });
});

// ── 4. The routes (finding 2) ───────────────────────────────────────────────

describe('routes reject out-of-whitelist folders', () => {
  let server: http.Server;
  let base = '';

  /** Minimal stand-in: the guard must fire before any of these are needed. */
  const stubDb = {
    run: async () => ({ changes: 1 }),
    get: async () => ({ id: 'stub', label: 'stub', path: allowedDir, recursive: 1, file_filter: null }),
    all: async () => [],
  } as unknown as DatabaseAdapter;

  beforeAll(async () => {
    process.env.ALLOWED_FOLDER_PATHS = allowedDir;
    const { createKnowledgeLibraryRoutes } = await import('../../server/routes/knowledge-library.js');
    const { createRagRoutes } = await import('../../server/routes/rag.js');

    const app = express();
    app.use(express.json());
    app.use('/api', await createKnowledgeLibraryRoutes(stubDb));
    app.use('/api', await createRagRoutes(stubDb));

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  async function post(route: string, body: unknown) {
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  }

  it('POST /api/knowledge-library refuses a path outside the whitelist', async () => {
    const r = await post('/api/knowledge-library', { label: 'Private', path: forbiddenDir });
    expect(r.status).toBe(403);
  });

  it('POST /api/knowledge-library still accepts a whitelisted path', async () => {
    const r = await post('/api/knowledge-library', { label: 'Policies', path: allowedDir });
    expect(r.status).toBe(201);
  });

  it('POST /api/rag/index refuses a path outside the whitelist', async () => {
    const r = await post('/api/rag/index', { folderPath: forbiddenDir });
    expect(r.status).toBe(403);
  });

  it('POST /api/rag/index still accepts a whitelisted path', async () => {
    const r = await post('/api/rag/index', { folderPath: allowedDir });
    expect(r.status).toBe(200);
  });
});
