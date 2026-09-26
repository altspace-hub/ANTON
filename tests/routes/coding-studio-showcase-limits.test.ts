/**
 * coding-studio-showcase-limits.test.ts — the Code Studio limits a public or
 * shared server needs (public showcase brief, area G).
 *
 *   1. Provisioning a workspace (a folder on the server's disk plus, with
 *      CREATEDB, a Postgres database and role) is an admin action in team mode.
 *      A foreign project still answers 404 first.
 *   2. A person may hold at most CODING_MAX_PROJECTS_PER_USER Code Studio
 *      projects in team mode — through POST /coding/projects AND through the
 *      kickoff workshop's finalize, which creates projects too. Admins and solo
 *      are not capped; 0 turns the cap off.
 *   3. The apply preview refuses a rewrite that keeps a sliver of an existing
 *      file, and ignores file blocks inside a leaked <think> block.
 *
 * Every case has its negative control (the admin, solo, below-cap or whole-file
 * request that must still pass). Fake database + mock DDL runner: nothing is
 * spawned and no database is created.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { RawDdlRunner } from '../../server/services/coding-studio-provisioner.js';
import {
  createCodingWorkshopEngine,
  createDefaultWorkshopState,
} from '../../server/services/coding-workshop-engine.js';
import { CodingProjectCapError } from '../../server/services/coding-workspace.js';

if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'd'.repeat(64);

interface Caller { id: string; username: string; role: string }
const ALICE: Caller = { id: 'alice', username: 'alice', role: 'analyst' };
const ADMIN: Caller = { id: 'root', username: 'root', role: 'admin' };
const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

const OWN = '1a2b3c4d-0000-4000-8000-00000000a11c';
const FOREIGN = '5e6f7a8b-0000-4000-8000-000000000b0b';
const TASK = 'task-1';

interface Recorded { sql: string; params: unknown[] }

const ENV_KEYS = ['DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'CODING_STUDIO_ROOT', 'CODING_MAX_PROJECTS_PER_USER'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let caller: Caller = ALICE;
let projectCount = 0;
let workspace = '';
let studioRoot = '';
const statements: Recorded[] = [];
const ddl: string[] = [];

/** Answers exactly what the three routes ask; records every statement. */
function fakeDb(): DatabaseAdapter {
  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      statements.push({ sql, params });
      if (/SELECT 1 AS ok/.test(sql)) {
        // assertOwned: alice owns OWN; nobody scoped owns FOREIGN; admins see both.
        const id = String(params[0]);
        const scoped = params.length > 1;
        if (id !== OWN && id !== FOREIGN) return undefined;
        if (scoped && (id !== OWN || params[1] !== ALICE.id)) return undefined;
        return { ok: 1 } as T;
      }
      if (/COUNT\(\*\) AS n/.test(sql) && /coding_projects/.test(sql)) return { n: projectCount } as T;
      if (/pg_roles/.test(sql)) return { rolname: 'anton', rolcreatedb: true, rolcreaterole: true, rolsuper: false } as T;
      if (/FROM coding_tasks/.test(sql)) return { id: TASK } as T;
      if (/FROM coding_projects/.test(sql)) return { id: OWN, name: 'p', directory_path: workspace, environment_mode: null } as T;
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      statements.push({ sql, params });
      return [] as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      statements.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close(): Promise<void> {},
  } as DatabaseAdapter;
  return db;
}

const wrote = (table: string): boolean => statements.some((s) => new RegExp(`INSERT INTO ${table}\\b`).test(s.sql));

let server: Server;
let base = '';

beforeAll(async () => {
  workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-showcase-ws-')));
  studioRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-showcase-studio-')));
  process.env.CODING_STUDIO_ROOT = studioRoot;
  const runner: RawDdlRunner = { async exec(sql: string) { ddl.push(sql); } };
  const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
  const router = await createCodingLargeRoutes(fakeDb(), {
    ddlRunner: () => runner,
    serverDsn: 'postgresql://anton:anton@localhost:5432/anton',
  });
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = caller;
    next();
  });
  app.use('/api', router);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no addr');
  base = `http://127.0.0.1:${addr.port}`;
}, 60_000);

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(studioRoot, { recursive: true, force: true });
});

beforeEach(() => {
  statements.length = 0;
  ddl.length = 0;
  caller = ALICE;
  projectCount = 0;
  process.env.DEPLOYMENT_MODE = 'team';
  delete process.env.CODING_MAX_PROJECTS_PER_USER;
  delete process.env.ALLOWED_FOLDER_PATHS;
  for (const entry of fs.readdirSync(studioRoot)) fs.rmSync(path.join(studioRoot, entry), { recursive: true, force: true });
});

const post = async (url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const r = await fetch(`${base}/api${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
};

// ── 1. Provisioning ─────────────────────────────────────────────────────────

describe('workspace provisioning is an admin action in team mode', () => {
  it('team non-admin, own project → 403: no folder, no database', async () => {
    const r = await post(`/coding/projects/${OWN}/workspace/provision`, {});
    expect(r.status).toBe(403);
    expect(fs.readdirSync(studioRoot)).toEqual([]);
    expect(ddl).toEqual([]);
    expect(statements.some((s) => /pg_roles|coding_studio_databases/.test(s.sql))).toBe(false);
  });

  it('team non-admin, someone else\'s project → 404 first (the refusal does not reveal the id)', async () => {
    const r = await post(`/coding/projects/${FOREIGN}/workspace/provision`, {});
    expect(r.status).toBe(404);
  });

  it.each([['team admin', ADMIN, 'team'], ['solo', SOLO, undefined]] as const)(
    'negative control: %s provisions (folder + database)',
    async (_label, who, mode) => {
      caller = who;
      if (mode) process.env.DEPLOYMENT_MODE = mode; else delete process.env.DEPLOYMENT_MODE;
      const r = await post(`/coding/projects/${OWN}/workspace/provision`, {});
      expect(r.status).toBe(200);
      expect(r.json.provisioned).toBe(true);
      expect(fs.readdirSync(studioRoot)).toHaveLength(1);
      expect(ddl.some((s) => s.startsWith('CREATE DATABASE'))).toBe(true);
    },
  );
});

// ── 2. Per-person project cap ───────────────────────────────────────────────

describe('a person may hold at most CODING_MAX_PROJECTS_PER_USER projects (team mode)', () => {
  it('at the default cap (20) a non-admin is refused and nothing is written', async () => {
    projectCount = 20;
    const r = await post('/coding/projects', { name: 'one more' });
    expect(r.status).toBe(403);
    expect(String(r.json.error)).toMatch(/limit of 20 Code Studio projects/);
    expect(wrote('projects')).toBe(false);
    expect(wrote('coding_projects')).toBe(false);
    // Counted for the caller, by owner or creator.
    const count = statements.find((s) => /COUNT\(\*\) AS n/.test(s.sql));
    expect(count?.params).toEqual(['alice', 'alice']);
  });

  it('the cap is configurable', async () => {
    process.env.CODING_MAX_PROJECTS_PER_USER = '3';
    projectCount = 3;
    expect((await post('/coding/projects', { name: 'x' })).status).toBe(403);
  });

  it('negative control: below the cap a non-admin creates the project', async () => {
    projectCount = 19;
    const r = await post('/coding/projects', { name: 'fits' });
    expect(r.status).toBe(200);
    expect(wrote('coding_projects')).toBe(true);
  });

  it.each([
    ['a team admin', ADMIN, 'team', undefined],
    ['solo', SOLO, undefined, undefined],
    ['a non-admin with the cap off (0)', ALICE, 'team', '0'],
  ] as const)('negative control: %s is not capped', async (_label, who, mode, cap) => {
    caller = who;
    if (mode) process.env.DEPLOYMENT_MODE = mode; else delete process.env.DEPLOYMENT_MODE;
    if (cap !== undefined) process.env.CODING_MAX_PROJECTS_PER_USER = cap;
    projectCount = 500;
    const r = await post('/coding/projects', { name: 'uncapped' });
    expect(r.status).toBe(200);
    expect(wrote('coding_projects')).toBe(true);
  });
});

describe('the workshop finalize honours the same cap', () => {
  function workshopDb(ownerRole: string, count: number, writes: string[]): DatabaseAdapter {
    const state = { ...createDefaultWorkshopState('standard', 'project'), problemStatement: 'Track invoices', scope: 'MVP' };
    const db: DatabaseAdapter = {
      dialect: 'postgresql',
      async get<T>(sql: string): Promise<T | undefined> {
        if (/FROM coding_workshop_sessions/.test(sql)) {
          return { id: 'ws1', user_id: 'alice', coding_project_id: null, tier: 'standard', mode: 'project', state: JSON.stringify(state), status: 'active', charter: null } as T;
        }
        if (/SELECT role FROM users/.test(sql)) return { role: ownerRole } as T;
        if (/COUNT\(\*\) AS n/.test(sql)) return { n: count } as T;
        return undefined;
      },
      async all<T>(): Promise<T[]> { return [] as T[]; },
      async run(sql: string): Promise<RunResult> { writes.push(sql); return { changes: 1, lastInsertRowid: 0 }; },
      async exec(): Promise<void> {},
      async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
      async close(): Promise<void> {},
    } as DatabaseAdapter;
    return db;
  }

  it('team mode, analyst owner at the cap → CodingProjectCapError, no project rows', async () => {
    const writes: string[] = [];
    const engine = createCodingWorkshopEngine(workshopDb('analyst', 20, writes));
    await expect(engine.finalize('ws1', 'alice')).rejects.toBeInstanceOf(CodingProjectCapError);
    expect(writes.some((s) => /INSERT INTO (projects|coding_projects)\b/.test(s))).toBe(false);
  });

  it.each([['an admin owner', 'admin', 'team'], ['solo', 'analyst', undefined]] as const)(
    'negative control: %s finalizes at any count',
    async (_label, role, mode) => {
      if (mode) process.env.DEPLOYMENT_MODE = mode; else delete process.env.DEPLOYMENT_MODE;
      const writes: string[] = [];
      const engine = createCodingWorkshopEngine(workshopDb(role, 500, writes));
      const out = await engine.finalize('ws1', 'alice');
      expect(out.codingProjectId).toBeTruthy();
      expect(writes.some((s) => /INSERT INTO coding_projects\b/.test(s))).toBe(true);
    },
  );
});

// ── 3. Apply preview ────────────────────────────────────────────────────────

describe('apply preview refuses a sliver rewrite and ignores <think> drafts', () => {
  const fence = '```';
  const forty = Array.from({ length: 40 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';

  beforeEach(() => {
    // Solo: the workspace is an ALLOWED_FOLDER_PATHS folder (team non-admins
    // are held to their own Studio folder — covered elsewhere).
    delete process.env.DEPLOYMENT_MODE;
    caller = SOLO;
    process.env.ALLOWED_FOLDER_PATHS = workspace;
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'src', 'big.ts'), forty, 'utf8');
  });

  const preview = (response_text: string) => post(`/coding/projects/${OWN}/tasks/${TASK}/apply/preview`, { response_text });

  it('a 5-line rewrite of a 40-line file is refused, not proposed', async () => {
    const sliver = Array.from({ length: 5 }, (_, i) => `export const v${i} = ${i};`).join('\n');
    const r = await preview(`${fence}ts\n// FILE: src/big.ts\n${sliver}\n${fence}`);
    expect(r.status).toBe(422);
    const rejected = r.json.rejected_blocks as Array<{ path: string; reason: string }>;
    expect(rejected).toEqual([{ path: 'src/big.ts', reason: expect.stringMatching(/shrinks from 40 to 5/) }]);
    expect(wrote('coding_workspace_applications')).toBe(false);
  });

  it('negative control: a whole-file rewrite is proposed', async () => {
    const full = forty + 'export const extra = 1;\n';
    const r = await preview(`${fence}ts\n// FILE: src/big.ts\n${full}${fence}`);
    expect(r.status).toBe(200);
    expect((r.json.files as Array<{ path: string; action: string }>).map((f) => [f.path, f.action])).toEqual([['src/big.ts', 'modify']]);
    expect(wrote('coding_workspace_applications')).toBe(true);
  });

  it('a file block inside a leaked <think> block is not proposed', async () => {
    const text = `<think>Draft:\n${fence}ts\n// FILE: src/draft.ts\nconst d = 1;\n${fence}\n</think>\n${fence}ts\n// FILE: src/new.ts\nexport const n = 1;\n${fence}`;
    const r = await preview(text);
    expect(r.status).toBe(200);
    expect((r.json.files as Array<{ path: string }>).map((f) => f.path)).toEqual(['src/new.ts']);
  });
});
