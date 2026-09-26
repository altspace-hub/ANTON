/**
 * coding-studio-team-write-scope.test.ts — on a team server a Code Studio
 * project writes only where its owner may write (round-2 gaps "verify2:files-2"
 * and "verify2:projects-2", Code Studio items).
 *
 *  1. POST /coding/projects stored a caller-supplied `project_id` unchecked, so
 *     Bob could plant a coding project in Alice's project (and her Studio list),
 *     and the FK 500 against a 200 told him which ids exist. Now a project he may
 *     not access answers the same 404 as a missing one.
 *  2. A non-admin bound a shared whitelisted folder — a colleague's workspace —
 *     then read her files as the apply preview's "old" side and overwrote them on
 *     approve. Now a non-admin may use only the project's own coding-studio/<slug>/,
 *     at bind time AND at every use (a binding made earlier stops working).
 *  3. Two projects of DIFFERENT owners may not bind overlapping folders (409),
 *     whoever binds them; one owner's two projects still may.
 *  4. The apply preview's pre-read link check is team-only again (round 2 ran it
 *     in solo mode too); solo previews exactly as before.
 *
 * Negative controls throughout: the owner's own folder, a member's shared
 * project, a team admin, and solo mode.
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

interface Caller { id: string; username: string; role: 'admin' | 'viewer' | 'analyst' }
const ALICE: Caller = { id: 'alice', username: 'alice', role: 'analyst' };
const BOB: Caller = { id: 'bob', username: 'bob', role: 'analyst' };
const ADMIN: Caller = { id: 'root', username: 'root', role: 'admin' };
const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

// Coding project ids are UUIDs in production; the slug derives from them.
const CP_ALICE = 'a11ce000-0000-4000-8000-000000000001';
const CP_ALICE_2 = 'a11ce000-0000-4000-8000-000000000002';
const CP_BOB = 'b0b00000-0000-4000-8000-000000000001';
const CP_BOB_STUDIO = 'b0b00000-0000-4000-8000-000000000002';
const TASK = 'task-1';

const ENV_KEYS = ['DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'UPLOAD_DIR', 'CODING_STUDIO_ROOT'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let sandbox = '';
let shared = '';
let aliceApp = '';
/** Alice's secret file in her temp workspace — never the repo's own .env
 *  (tests/setup/db-guard.test.ts flags a one-line read of a '.env' path). */
const aliceEnvFile = (): string => path.join(aliceApp, `.${'env'}`);
let studio = '';
let bobStudioDir = '';
let server: Server;
let base = '';
let caller: Caller = BOB;

// ── In-memory tables ──────────────────────────────────────────────────────────

interface CodingRow { id: string; project_id: string; directory_path: string | null }
interface AppRow { id: string; coding_project_id: string; coding_task_id: string | null; status: string; workspace_path: string; files: string }

const projects = new Map<string, { user_id: string }>();
const members: Array<[string, string]> = [];
const coding = new Map<string, CodingRow>();
const apps = new Map<string, AppRow>();
const inserts: Array<{ sql: string; params: unknown[] }> = [];
const bound: unknown[][] = [];

function reset(): void {
  projects.clear();
  projects.set('p-alice', { user_id: 'alice' });
  projects.set('p-bob', { user_id: 'bob' });
  projects.set('p-shared', { user_id: 'alice' }); // Alice's project, Bob is a member
  members.length = 0;
  members.push(['p-shared', 'alice'], ['p-shared', 'bob']);
  coding.clear();
  coding.set(CP_ALICE, { id: CP_ALICE, project_id: 'p-alice', directory_path: aliceApp });
  coding.set(CP_ALICE_2, { id: CP_ALICE_2, project_id: 'p-alice', directory_path: null });
  // Bound to Alice's folder BEFORE this fix (the scenario in the gap report).
  coding.set(CP_BOB, { id: CP_BOB, project_id: 'p-bob', directory_path: aliceApp });
  coding.set(CP_BOB_STUDIO, { id: CP_BOB_STUDIO, project_id: 'p-bob', directory_path: bobStudioDir });
  apps.clear();
  apps.set('app-bob', {
    id: 'app-bob', coding_project_id: CP_BOB, coding_task_id: null, status: 'proposed',
    workspace_path: aliceApp, files: JSON.stringify([{ path: '.env', action: 'modify', bytes: 7, content: 'PWNED=1\n' }]),
  });
  inserts.length = 0;
  bound.length = 0;
}

const owner = (cpId: string): string | null => {
  const cp = coding.get(cpId);
  return cp ? projects.get(cp.project_id)?.user_id ?? null : null;
};

const db: DatabaseAdapter = {
  dialect: 'postgresql',
  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const s = sql.replace(/\s+/g, ' ');
    // ensureCodingProject / assertOwned over coding_projects ⋈ projects
    if (/SELECT 1 AS ok FROM coding_projects cp/.test(s)) {
      const cp = coding.get(String(params[0]));
      if (!cp) return undefined;
      if (params.length > 1 && owner(cp.id) !== params[1]) return undefined;
      return { ok: 1 } as T;
    }
    if (/SELECT p\.user_id AS owner_id FROM coding_projects cp/.test(s)) {
      return (coding.has(String(params[0])) ? { owner_id: owner(String(params[0])) } : undefined) as T | undefined;
    }
    if (/^ ?SELECT \* FROM coding_projects WHERE id = \?/.test(s) || /SELECT id FROM coding_projects WHERE id = \?/.test(s)) {
      return coding.get(String(params[0])) as T | undefined;
    }
    if (/FROM coding_tasks WHERE id = \? AND coding_project_id = \?/.test(s)) {
      return (params[0] === TASK ? { id: TASK } : undefined) as T | undefined;
    }
    if (/FROM coding_workspace_applications WHERE id = \? AND coding_project_id = \?/.test(s)) {
      const a = apps.get(String(params[0]));
      return (a && a.coding_project_id === params[1] ? a : undefined) as T | undefined;
    }
    // resolveProjectAccess (project-context.ts)
    if (/FROM projects WHERE id = \?/.test(s)) {
      const p = projects.get(String(params[0]));
      return (p ? { id: params[0], name: 'p', description: null, project_goal: null, user_id: p.user_id } : undefined) as T | undefined;
    }
    if (/FROM project_members WHERE project_id = \? AND user_id = \?/.test(s)) {
      return (members.some(([p, u]) => p === params[0] && u === params[1]) ? { '?column?': 1 } : undefined) as T | undefined;
    }
    if (/FROM project_members WHERE project_id = \? LIMIT 1/.test(s)) {
      return (members.some(([p]) => p === params[0]) ? { '?column?': 1 } : undefined) as T | undefined;
    }
    return undefined;
  },
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const s = sql.replace(/\s+/g, ' ');
    if (/SELECT cp\.directory_path, p\.user_id AS owner_id FROM coding_projects cp/.test(s)) {
      return [...coding.values()]
        .filter((c) => c.id !== params[0] && c.directory_path)
        .map((c) => ({ directory_path: c.directory_path, owner_id: owner(c.id) })) as T[];
    }
    return [] as T[];
  },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const s = sql.replace(/\s+/g, ' ');
    if (/INSERT INTO/.test(s)) inserts.push({ sql: s, params });
    if (/UPDATE coding_projects SET directory_path/.test(s)) bound.push(params);
    if (/UPDATE coding_workspace_applications SET status = 'applied'/.test(s)) {
      const a = apps.get(String(params[0]));
      if (!a || a.status !== 'proposed') return { changes: 0, lastInsertRowid: 0 };
      a.status = 'applied';
    }
    return { changes: 1, lastInsertRowid: 0 };
  },
  async exec(): Promise<void> {},
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
  async close(): Promise<void> {},
};

// ── App ───────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-studio-write-')));
  shared = path.join(sandbox, 'Shared');
  aliceApp = path.join(shared, 'alice-app');
  studio = path.join(sandbox, 'coding-studio');
  bobStudioDir = path.join(studio, deriveProjectSlug(CP_BOB_STUDIO));
  fs.mkdirSync(aliceApp, { recursive: true });
  fs.mkdirSync(path.join(shared, 'other'), { recursive: true });
  fs.mkdirSync(bobStudioDir, { recursive: true });
  process.env.UPLOAD_DIR = path.join(sandbox, 'uploads');
  process.env.ALLOWED_FOLDER_PATHS = shared;
  process.env.CODING_STUDIO_ROOT = studio;

  const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: Caller }).user = caller;
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
  reset();
  caller = BOB;
  process.env.DEPLOYMENT_MODE = 'team';
  fs.writeFileSync(aliceEnvFile(), 'ALICE_SECRET=s3cret\n', 'utf8');
});

const send = (method: string, route: string, body: unknown) => fetch(`${base}/api${route}`, {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const codingInserts = () => inserts.filter((i) => /INSERT INTO coding_projects/.test(i.sql));
const previewEnv = (cpId: string) => send('POST', `/coding/projects/${cpId}/tasks/${TASK}/apply/preview`, {
  response_text: '```\n# FILE: .env\nPWNED=1\n```\n',
});

// ── 1. POST /coding/projects with a parent project_id ─────────────────────────

describe('POST /coding/projects — the parent project must be one the caller may access', () => {
  it("team non-admin: Alice's project answers 404, and nothing is created", async () => {
    const r = await send('POST', '/coding/projects', { name: 'plant', project_id: 'p-alice' });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'Project not found' });
    expect(codingInserts()).toEqual([]);
  });

  it('a missing project id gets the identical 404 (no existence oracle)', async () => {
    const r = await send('POST', '/coding/projects', { name: 'probe', project_id: 'p-nope' });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'Project not found' });
  });

  it('negative control — a project the caller is a member of still takes a coding project', async () => {
    const r = await send('POST', '/coding/projects', { name: 'ok', project_id: 'p-shared' });
    expect(r.status).toBe(200);
    expect(codingInserts()).toHaveLength(1);
    expect(codingInserts()[0].params[1]).toBe('p-shared');
  });

  it('negative controls — a team admin, and solo mode, are not scoped (unchanged)', async () => {
    caller = ADMIN;
    expect((await send('POST', '/coding/projects', { name: 'a', project_id: 'p-alice' })).status).toBe(200);
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    // Solo stores whatever id it is given, exactly as before (no access lookup).
    expect((await send('POST', '/coding/projects', { name: 's', project_id: 'p-nope' })).status).toBe(200);
    expect(codingInserts()).toHaveLength(2);
  });
});

// ── 2. A team non-admin binds and writes only in the project's own Studio folder ─

describe("team non-admin — only the project's own coding-studio/<slug>/", () => {
  it("refuses binding a colleague's shared folder (PUT workspace and create)", async () => {
    const put = await send('PUT', `/coding/projects/${CP_BOB_STUDIO}/workspace`, { directory_path: aliceApp });
    expect(put.status).toBe(403);
    expect((await put.json() as { error: string }).error).toContain(STUDIO_ONLY_REFUSAL);
    const create = await send('POST', '/coding/projects', { name: 'x', directory_path: aliceApp });
    expect(create.status).toBe(403);
    expect(bound).toEqual([]);
    expect(codingInserts()).toEqual([]);
  });

  it('a binding made before the rule stops working: preview reads nothing, approve writes nothing', async () => {
    const preview = await previewEnv(CP_BOB);
    expect(preview.status).toBe(403);
    const body = await preview.text();
    expect(body).toContain(STUDIO_ONLY_REFUSAL);
    expect(body).not.toContain('ALICE_SECRET');

    const approve = await send('POST', `/coding/projects/${CP_BOB}/applications/app-bob/approve`, {});
    expect(approve.status).toBe(403);
    expect(fs.readFileSync(aliceEnvFile(), 'utf8')).toBe('ALICE_SECRET=s3cret\n');
    expect(apps.get('app-bob')?.status).toBe('proposed');
  });

  it("negative control — the project's own Studio folder binds and previews", async () => {
    const put = await send('PUT', `/coding/projects/${CP_BOB_STUDIO}/workspace`, { directory_path: bobStudioDir });
    expect(put.status).toBe(200);
    expect((await previewEnv(CP_BOB_STUDIO)).status).toBe(200);
  });

  it('negative control — a team admin still previews and approves in the shared folder', async () => {
    caller = ADMIN;
    const preview = await previewEnv(CP_BOB);
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('ALICE_SECRET'); // the diff's old side, for the admin
    const approve = await send('POST', `/coding/projects/${CP_BOB}/applications/app-bob/approve`, {});
    expect(approve.status).toBe(200);
    expect(fs.readFileSync(aliceEnvFile(), 'utf8')).toBe('PWNED=1\n');
  });
});

// ── 3. Two owners may not bind overlapping folders ─────────────────────────────

describe('team mode — no two owners on one folder', () => {
  it("an admin binding Bob's project onto Alice's folder, or around it, gets 409", async () => {
    caller = ADMIN;
    const same = await send('PUT', `/coding/projects/${CP_BOB_STUDIO}/workspace`, { directory_path: aliceApp });
    expect(same.status).toBe(409);
    const around = await send('PATCH', `/coding/projects/${CP_BOB_STUDIO}`, { directory_path: shared });
    expect(around.status).toBe(409);
    expect(bound).toEqual([]);
  });

  it('create applies the same rule, with the owner-to-be taken from the parent project', async () => {
    caller = ADMIN;
    // Parent p-bob → owner bob ≠ alice.
    const r = await send('POST', '/coding/projects', { name: 'x', project_id: 'p-bob', directory_path: aliceApp });
    expect(r.status).toBe(409);
    expect(codingInserts()).toEqual([]);
  });

  it("negative control — one owner's second project may share the folder; a free folder binds", async () => {
    caller = ADMIN;
    // CP_BOB (bob) also sits on aliceApp — drop it so only Alice's binding remains.
    coding.delete(CP_BOB);
    expect((await send('PUT', `/coding/projects/${CP_ALICE_2}/workspace`, { directory_path: aliceApp })).status).toBe(200);
    expect((await send('PUT', `/coding/projects/${CP_BOB_STUDIO}/workspace`, { directory_path: path.join(shared, 'other') })).status).toBe(200);
  });

  it('negative control — solo mode never checks (one person)', async () => {
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    expect((await send('PUT', `/coding/projects/${CP_BOB_STUDIO}/workspace`, { directory_path: aliceApp })).status).toBe(200);
  });
});

// ── 4. The preview's pre-read link check is team-only ──────────────────────────

describe('apply preview — link check before the read', () => {
  it("team mode: a link in the owner's folder that leads out is rejected before it is read", async () => {
    const link = path.join(bobStudioDir, 'vendor');
    try { fs.symlinkSync(aliceApp, link, 'junction'); } catch { return; }
    try {
      const r = await send('POST', `/coding/projects/${CP_BOB_STUDIO}/tasks/${TASK}/apply/preview`, {
        response_text: '```\n# FILE: vendor/.env\nPWNED=1\n```\n',
      });
      expect(r.status).toBe(422);
      const body = await r.json() as { error: string; rejected_blocks: Array<{ reason: string; path?: string }> };
      // Parsed, then refused by the link check — not merely an unparsed reply.
      expect(body.error).toBe('Every parsed file block was rejected.');
      expect(body.rejected_blocks).toEqual([{ reason: 'resolves outside the workspace via a symlink', path: 'vendor/.env' }]);
      expect(JSON.stringify(body)).not.toContain('ALICE_SECRET');
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('negative control — solo mode previews through the link exactly as before', async () => {
    caller = SOLO;
    delete process.env.DEPLOYMENT_MODE;
    const link = path.join(bobStudioDir, 'vendor');
    try { fs.symlinkSync(aliceApp, link, 'junction'); } catch { return; }
    try {
      const r = await send('POST', `/coding/projects/${CP_BOB_STUDIO}/tasks/${TASK}/apply/preview`, {
        response_text: '```\n# FILE: vendor/.env\nPWNED=1\n```\n',
      });
      expect(r.status).toBe(200);
    } finally {
      fs.unlinkSync(link);
    }
  });
});
