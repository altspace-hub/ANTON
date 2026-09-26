/**
 * coding-workspace-bind-team.test.ts — binding a Code Studio workspace honours
 * the team-storage rule end to end (round-2 gap "verify:files", Code Studio
 * workspace allowlist — the route half; the service half is in
 * tests/services/coding-workspace-team-storage.test.ts).
 *
 * The exploit: with the shipped `./uploads,./outputs` whitelist a team user made
 * a project and PUT /coding/projects/:id/workspace {directory_path: <uploads>},
 * then read every user's upload names through git status and their content
 * through the apply preview. Also closed here: binding the Studio root, or
 * another project's coding-studio/<slug>/ folder (another user's code).
 *
 * Negative controls: the project's own Studio folder still binds in team mode,
 * and a shared folder still binds for an admin (round 3 made it admin-only);
 * solo mode binds the upload store exactly as before.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { deriveProjectSlug } from '../../server/services/coding-studio-provisioner.js';
import { STUDIO_ONLY_REFUSAL } from '../../server/services/coding-workspace.js';

if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const PROJECT = '11111111-aaaa-4bbb-8ccc-000000000001';
const OTHER_PROJECT = '22222222-aaaa-4bbb-8ccc-000000000002';
const ALICE = { id: 'alice', username: 'alice', role: 'analyst' };
const SOLO = { id: 'solo', username: 'solo', role: 'admin' };
const ADMIN = { id: 'root', username: 'root', role: 'admin' };

const ENV_KEYS = ['DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'UPLOAD_DIR', 'CODING_STUDIO_ROOT'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let sandbox = '';
let uploads = '';
let shared = '';
let studio = '';
let server: Server;
let base = '';
let caller: { id: string; username: string; role: string } = ALICE;
const bound: unknown[][] = [];

const db: DatabaseAdapter = {
  dialect: 'postgresql',
  async get<T>(sql: string): Promise<T | undefined> {
    if (/SELECT 1 AS ok/.test(sql)) return { ok: 1 } as T; // Alice owns PROJECT
    return { id: PROJECT } as T;
  },
  async all<T>(): Promise<T[]> { return [] as T[]; },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (/UPDATE coding_projects SET directory_path/.test(sql)) bound.push(params);
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec(): Promise<void> {},
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
  async close(): Promise<void> {},
};

beforeAll(async () => {
  sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-bind-team-')));
  uploads = path.join(sandbox, 'uploads');
  shared = path.join(sandbox, 'shared');
  studio = path.join(sandbox, 'coding-studio');
  for (const d of [uploads, shared, path.join(studio, deriveProjectSlug(PROJECT)), path.join(studio, deriveProjectSlug(OTHER_PROJECT))]) {
    fs.mkdirSync(d, { recursive: true });
  }
  process.env.UPLOAD_DIR = uploads;
  process.env.ALLOWED_FOLDER_PATHS = [uploads, shared].join(',');
  process.env.CODING_STUDIO_ROOT = studio;

  const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = caller;
    next();
  });
  app.use('/api', await createCodingLargeRoutes(db, { serverDsn: 'postgresql://anton:anton@localhost:5432/anton' }));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no addr');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  fs.rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  bound.length = 0;
  caller = ALICE;
  process.env.DEPLOYMENT_MODE = 'team';
});

const bind = (dir: string) => fetch(`${base}/api/coding/projects/${PROJECT}/workspace`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directory_path: dir }),
});

describe('PUT /coding/projects/:id/workspace — team mode', () => {
  it('refuses the upload store (the exploit), writing nothing', async () => {
    expect((await bind(uploads)).status).toBe(403);
    expect(bound).toEqual([]);
  });

  it('refuses the Studio root and another project\'s Studio folder', async () => {
    expect((await bind(studio)).status).toBe(403);
    expect((await bind(path.join(studio, deriveProjectSlug(OTHER_PROJECT)))).status).toBe(403);
    expect(bound).toEqual([]);
  });

  it("negative control — the project's own Studio folder still binds", async () => {
    const own = path.join(studio, deriveProjectSlug(PROJECT));
    expect((await bind(own)).status).toBe(200);
    expect(bound.map((p) => p[0])).toEqual([own]);
  });

  // Round 3 (gap "verify2:files-2"): a shared whitelisted folder is an ADMIN's
  // to bind in team mode. Round 2 kept it bindable for everyone, which let a
  // non-admin bind a colleague's folder and overwrite it through apply/approve.
  it('a shared whitelisted folder is refused to a non-admin, and still binds for an admin', async () => {
    const refused = await bind(shared);
    expect(refused.status).toBe(403);
    expect((await refused.json() as { error: string }).error).toContain(STUDIO_ONLY_REFUSAL);
    expect(bound).toEqual([]);
    caller = ADMIN;
    expect((await bind(shared)).status).toBe(200);
    expect(bound.map((p) => p[0])).toEqual([shared]);
  });

  it('PATCH and create apply the same rule', async () => {
    const patch = await fetch(`${base}/api/coding/projects/${PROJECT}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directory_path: uploads }),
    });
    expect(patch.status).toBe(403);
    const create = await fetch(`${base}/api/coding/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', directory_path: path.join(studio, deriveProjectSlug(OTHER_PROJECT)) }),
    });
    expect(create.status).toBe(403);
  });
});

describe('negative control — solo mode is unchanged', () => {
  it('binds the upload store and a sibling Studio folder as before', async () => {
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    expect((await bind(uploads)).status).toBe(200);
    expect((await bind(path.join(studio, deriveProjectSlug(OTHER_PROJECT)))).status).toBe(200);
  });
});
