/**
 * folder-guard-team-storage.test.ts — on a team server, ANTON's own upload and
 * output storage is not a readable folder (team-server readiness B5).
 *
 * The default whitelist allowed ./uploads and ./outputs, which hold EVERY
 * user's uploads and exports side by side. Any user could therefore browse them
 * (POST /api/folders/browse), paste them into a prompt as a "Local folder"
 * source (knowledge-resolver) or index and search them (routes/rag.ts) — past
 * the per-file ownership checks in routes/files.ts.
 *
 * Each refusal is paired with a negative control: the same request in solo
 * mode, or against a genuinely shared folder in team mode, still succeeds. A
 * guard that refuses everything would pass the refusal half on its own.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import os from 'os';
import path from 'path';
import fs from 'fs';

import {
  checkFolderPath,
  getAllowedFolderBases,
  TEAM_STORAGE_REFUSAL,
} from '../../server/lib/folder-guard.js';
import { resolveKnowledgeSources } from '../../server/services/knowledge-resolver.js';
import { createFolderRoutes } from '../../server/routes/folders.js';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { KnowledgeSourceConfig } from '../../src/lib/types.js';

const ENV_KEYS = ['DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'UPLOAD_DIR', 'OUTPUT_DIR', 'WORKSPACES_DIR'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const ALICE_SECRET = 'ALICE-UPLOAD-7f3a9c';
const BOB_SECRET = 'BOB-EXPORT-2d8e41';
const SHARED_MARKER = 'SHARED-POLICY-5b6c0d';

let sandbox = '';
let uploads = '';
let outputs = '';
let shared = '';

function setEnv(mode: 'team' | 'solo', allowed: string[] = [uploads, outputs, shared]) {
  if (mode === 'team') process.env.DEPLOYMENT_MODE = 'team';
  else delete process.env.DEPLOYMENT_MODE;
  process.env.ALLOWED_FOLDER_PATHS = allowed.join(',');
  process.env.UPLOAD_DIR = uploads;
  process.env.OUTPUT_DIR = outputs;
  process.env.WORKSPACES_DIR = path.join(sandbox, 'store', 'workspaces');
}

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-team-storage-'));
  uploads = path.join(sandbox, 'store', 'uploads');
  outputs = path.join(sandbox, 'store', 'outputs');
  shared = path.join(sandbox, 'shared');
  for (const d of [uploads, outputs, shared]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(uploads, 'alice-contract.md'), `# Contract\n${ALICE_SECRET}\n`, 'utf8');
  fs.writeFileSync(path.join(outputs, 'bob-report.md'), `# Report\n${BOB_SECRET}\n`, 'utf8');
  fs.writeFileSync(path.join(shared, 'policy.md'), `# Policy\n${SHARED_MARKER}\n`, 'utf8');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

// ── 1. The guard ────────────────────────────────────────────────────────────

describe('checkFolderPath — team mode refuses ANTON storage', () => {
  it('drops uploads/outputs bases and keeps a shared folder', () => {
    setEnv('team');
    expect(getAllowedFolderBases()).toEqual([shared]);
  });

  it('refuses the upload and output stores and anything inside them', () => {
    setEnv('team');
    for (const p of [uploads, path.join(uploads, 'alice-contract.md'), outputs, path.join(outputs, 'sub')]) {
      const r = checkFolderPath(p);
      expect(r.ok, p).toBe(false);
      expect(r.reason, p).toBe('team_storage');
      expect(r.error, p).toBe(TEAM_STORAGE_REFUSAL);
    }
  });

  it('drops a base that CONTAINS the store — reading it recursively would reach every upload', () => {
    setEnv('team', [sandbox]);
    expect(getAllowedFolderBases()).toEqual([]);
    expect(checkFolderPath(sandbox).reason).toBe('team_storage');
    // shared/ was reachable only through the dropped base.
    expect(checkFolderPath(shared).ok).toBe(false);
  });

  it('refuses the fallback (ALLOWED_FOLDER_PATHS unset): it is exactly ./uploads and ./outputs', () => {
    expect(getAllowedFolderBases({ DEPLOYMENT_MODE: 'team' } as NodeJS.ProcessEnv)).toEqual([]);
    expect(checkFolderPath(path.resolve('./uploads'), { DEPLOYMENT_MODE: 'team' } as NodeJS.ProcessEnv).ok).toBe(false);
  });

  it('refuses a link inside a shared folder that points into uploads', () => {
    setEnv('team');
    const link = path.join(shared, 'looks-harmless');
    try {
      // 'junction' needs no privilege on Windows; POSIX ignores the type.
      fs.symlinkSync(uploads, link, 'junction');
    } catch {
      return; // cannot create links here — the lexical cases above still apply
    }
    try {
      const r = checkFolderPath(link);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('team_storage');
    } finally {
      // Remove the LINK only — never a recursive delete through it (it would
      // empty the target). unlink handles a junction; rmdir is the fallback.
      try { fs.unlinkSync(link); } catch { try { fs.rmdirSync(link); } catch { /* sandbox cleanup */ } }
    }
  });

  it.runIf(process.platform === 'win32' || process.platform === 'darwin')(
    'refuses a case variant of the store on a case-insensitive filesystem',
    () => {
      // The whitelist names the store in other casing, so only the case-folded
      // storage check can refuse it (the whitelist match itself is exact).
      const variant = uploads.replace(/uploads$/, 'UPLOADS');
      setEnv('team', [variant]);
      expect(getAllowedFolderBases()).toEqual([]);
      const r = checkFolderPath(variant);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('team_storage');
    },
  );

  it('negative control — team mode still allows the shared folder', () => {
    setEnv('team');
    const r = checkFolderPath(path.join(shared, 'policy.md'));
    expect(r.ok).toBe(true);
    expect(r.resolved).toBe(path.join(shared, 'policy.md'));
  });

  it('negative control — solo mode is unchanged: uploads, outputs and the fallback stay readable', () => {
    setEnv('solo');
    expect(getAllowedFolderBases()).toEqual([uploads, outputs, shared]);
    expect(checkFolderPath(uploads).ok).toBe(true);
    expect(checkFolderPath(outputs).ok).toBe(true);
    expect(getAllowedFolderBases({} as NodeJS.ProcessEnv)).toEqual([path.resolve('./uploads'), path.resolve('./outputs')]);
  });
});

// ── 2. The "Local folders" knowledge source ─────────────────────────────────

function localFolderConfig(folderPaths: string[]): KnowledgeSourceConfig {
  return {
    modes: {
      claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
      onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
      localFolder: { enabled: true, folderPaths, recursive: true },
      combinedMode: { enabled: false, priority: 'merged' },
    },
  };
}

describe('resolveKnowledgeSources — localFolder in team mode', () => {
  it('does not read the upload or output store into the prompt', async () => {
    setEnv('team');
    const r = await resolveKnowledgeSources(localFolderConfig([uploads, outputs]));
    expect(r.contextDocuments).not.toContain(ALICE_SECRET);
    expect(r.contextDocuments).not.toContain(BOB_SECRET);
    expect(r.contextDocuments).toContain('REFUSED');
    // The whitelist cannot re-open storage, so the prompt must not suggest it.
    expect(r.contextDocuments).not.toContain('add it to ALLOWED_FOLDER_PATHS');
    expect(r.sourceManifest).toEqual([]);
  });

  it('negative control — team mode still reads the shared folder', async () => {
    setEnv('team');
    const r = await resolveKnowledgeSources(localFolderConfig([uploads, shared]));
    expect(r.contextDocuments).toContain(SHARED_MARKER);
    expect(r.contextDocuments).not.toContain(ALICE_SECRET);
  });

  it('negative control — solo mode still reads uploads', async () => {
    setEnv('solo');
    const r = await resolveKnowledgeSources(localFolderConfig([uploads]));
    expect(r.contextDocuments).toContain(ALICE_SECRET);
  });
});

// ── 3. The folder browser routes ────────────────────────────────────────────

describe('routes/folders.ts in team mode', () => {
  let server: Server;
  let base = '';
  const runs: string[] = [];

  const stubDb = {
    run: async (sql: string) => { runs.push(sql); return { changes: 1 }; },
    get: async () => ({ id: 1 }),
    all: async () => [],
  } as unknown as DatabaseAdapter;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createFolderRoutes(stubDb));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function post(route: string, body: unknown, user = 'carol', role = 'analyst') {
    const r = await fetch(`${base}/api${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
      body: JSON.stringify(body),
    });
    return { status: r.status, text: await r.text() };
  }

  it('browse: refuses the upload store and lists none of its file names — for an admin too', async () => {
    setEnv('team');
    for (const role of ['analyst', 'admin']) {
      const r = await post('/folders/browse', { path: uploads }, 'carol', role);
      expect(r.status, role).toBe(403);
      expect(r.text, role).not.toContain('alice-contract');
    }
  });

  it('index: refuses the output store', async () => {
    setEnv('team');
    const r = await post('/folders/index', { path: outputs });
    expect(r.status).toBe(403);
    expect(r.text).not.toContain('bob-report');
  });

  it('register: refuses the upload store and writes nothing', async () => {
    setEnv('team');
    runs.length = 0;
    const r = await post('/folders/register', { path: uploads, label: 'Everyone' });
    expect(r.status).toBe(403);
    expect(runs).toEqual([]);
  });

  it('negative control — team mode still browses the shared folder', async () => {
    setEnv('team');
    const r = await post('/folders/browse', { path: shared });
    expect(r.status).toBe(200);
    expect(r.text).toContain('policy.md');
  });

  it('negative control — solo mode still browses and indexes uploads', async () => {
    setEnv('solo');
    const browse = await post('/folders/browse', { path: uploads }, 'solo', 'admin');
    expect(browse.status).toBe(200);
    expect(browse.text).toContain('alice-contract.md');
    const index = await post('/folders/index', { path: uploads }, 'solo', 'admin');
    expect(index.status).toBe(200);
    expect(index.text).toContain('alice-contract.md');
  });
});
