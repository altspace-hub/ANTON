/**
 * rag-indexer-symlink.test.ts — the RAG folder indexer does not read through a
 * file symlink (round-2 gap "verify:files", indexer follows symlinks).
 *
 * listFiles() used to accept any directory entry with a document extension, so a
 * link named notes.md inside a whitelisted shared folder, pointing at someone's
 * upload, was read through and indexed — and anyone who may read the shared
 * folder could then fetch it with /api/rag/search. It now requires
 * Dirent.isFile(), as the other scanners (knowledge-resolver, folders.ts) do.
 *
 * Creating a file symlink needs a privilege on Windows; the link case skips (and
 * says so) where the host refuses. The negative control — a regular file in the
 * same folder is still indexed — always runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { indexFolder } from '../../server/services/rag/indexer.js';

const SHARED_MARKER = 'SHARED-POLICY-3e1f';
const SECRET_MARKER = 'SOMEONES-UPLOAD-9a4c';

let sandbox = '';
let shared = '';
let linked = false;
const savedAllowed = process.env.ALLOWED_FOLDER_PATHS;
const savedMode = process.env.DEPLOYMENT_MODE;

/** Records every chunk text the indexer writes. */
function recordingDb(texts: string[]): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(): Promise<T | undefined> { return undefined; },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/INSERT INTO document_chunks/.test(sql)) texts.push(String(params[4]));
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

beforeAll(() => {
  sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-indexer-link-')));
  shared = path.join(sandbox, 'shared');
  const elsewhere = path.join(sandbox, 'elsewhere');
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(elsewhere, { recursive: true });
  fs.writeFileSync(path.join(shared, 'policy.md'), `# Policy\n${SHARED_MARKER}\n`, 'utf8');
  fs.writeFileSync(path.join(elsewhere, 'contract.md'), `# Contract\n${SECRET_MARKER}\n`, 'utf8');
  try {
    fs.symlinkSync(path.join(elsewhere, 'contract.md'), path.join(shared, 'notes.md'), 'file');
    linked = true;
  } catch {
    linked = false; // EPERM on Windows without the symlink privilege
  }
  process.env.ALLOWED_FOLDER_PATHS = shared;
  delete process.env.DEPLOYMENT_MODE; // the rule is mode-independent; solo keeps the guard out of the way
});

afterAll(() => {
  if (savedAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
  else process.env.ALLOWED_FOLDER_PATHS = savedAllowed;
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = savedMode;
  try { fs.unlinkSync(path.join(shared, 'notes.md')); } catch { /* no link was made */ }
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('indexFolder — file symlinks are not followed', () => {
  it('does not index the file a link points at', async (ctx) => {
    if (!linked) ctx.skip();
    const texts: string[] = [];
    const result = await indexFolder(recordingDb(texts), shared);
    expect(texts.join('\n')).not.toContain(SECRET_MARKER);
    expect(result.documents).toBe(1);
  });

  it('negative control — a regular document in the same folder is indexed', async () => {
    const texts: string[] = [];
    await indexFolder(recordingDb(texts), shared);
    expect(texts.join('\n')).toContain(SHARED_MARKER);
  });
});
