/**
 * coding-exec-team-gate.test.ts — on a team server, running code through Code
 * Studio is an admin action (round-2 gap "verify:files", Code Studio execution).
 *
 * The setup/build/test runs, the preview server, the Studio build loop, host-side
 * git and the Script Lite preview all spawn processes as the server's OS user.
 * validateTestArgv only refuses shells, so ["node","-e","…readdirSync(uploads)…"]
 * was a valid test command for any team user, and its output came back in the
 * response — every user's uploads, whatever the folder guard said.
 *
 * What each case pins:
 *   - team non-admin, OWN project → 403, and nothing ran (no spawn-seam call, no
 *     statement past the ownership probe);
 *   - team non-admin, someone else's project → 404 first (the refusal must not
 *     reveal that the id exists);
 *   - a project whose parent has NO owner → 404 for a team non-admin (these
 *     routers used to treat an unowned project as everyone's);
 *   - negative controls: a team admin and the solo user pass the gate, and the
 *     owner's non-executing routes (status, logs, releases …) still answer.
 *
 * Fake DB + injected service seams: nothing is spawned in this file.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction, Router } from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { CodingGitService } from '../../server/routes/coding-git.js';
import type { PreviewService } from '../../server/routes/coding-preview.js';
import type { StudioOrchestrator, StudioRun } from '../../server/services/coding-studio-orchestrator.js';

if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'c'.repeat(64);

interface Caller { id: string; username: string; role: string }
const ALICE: Caller = { id: 'alice', username: 'alice', role: 'analyst' };
const ADMIN: Caller = { id: 'root', username: 'root', role: 'admin' };
const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

const OWN = 'cp-alice-0001';
const FOREIGN = 'cp-bob-0002';
const UNOWNED = 'cp-unowned-0003';

let workspace = '';
const OWNERS: Record<string, string | null> = { [OWN]: 'alice', [FOREIGN]: 'bob', [UNOWNED]: null };

interface Recorded { sql: string; params: unknown[] }

/**
 * Answers the three routers' ownership lookups from OWNERS, and assertOwned's
 * probe (coding-large) from `probePasses`. Records every statement.
 */
function fakeDb(reads: Recorded[], probePasses: () => boolean): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      reads.push({ sql, params });
      if (/SELECT 1 AS ok/.test(sql)) return (probePasses() ? { ok: 1 } : undefined) as T | undefined;
      if (/FROM coding_projects cp/.test(sql) && /owner_user_id/.test(sql)) {
        const id = String(params[0]);
        if (!(id in OWNERS)) return undefined;
        return { id, name: 'p', owner_user_id: OWNERS[id], directory_path: workspace } as T;
      }
      return { id: OWN, name: 'p', project_id: 'p1', directory_path: workspace } as T;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      reads.push({ sql, params });
      return [] as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      reads.push({ sql, params });
      return { changes: 0, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

const ENV_KEYS = ['DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'CODING_STUDIO_ROOT'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let server: Server;
let base = '';
let caller: Caller = ALICE;
let probePasses = true;
const reads: Recorded[] = [];
const spawned: string[] = [];

function fakeRun(): StudioRun {
  return {
    id: 'run1', codingProjectId: OWN, status: 'running', currentTask: null, autonomy: 'more', reviseCap: 4,
    stopRequested: false, plan: null, awaitingGate: null, lastError: null, stepLog: [],
  };
}

beforeAll(async () => {
  workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-exec-gate-')));
  process.env.ALLOWED_FOLDER_PATHS = workspace;
  // A Studio root that does not overlap the workspace, so validateWorkspacePath
  // accepts it for the admin/solo controls.
  process.env.CODING_STUDIO_ROOT = path.join(workspace, '..', `anton-exec-gate-studio-${path.basename(workspace)}`);

  const db = fakeDb(reads, () => probePasses);
  const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
  const { createCodingGitRoutes } = await import('../../server/routes/coding-git.js');
  const { createCodingPreviewRoutes } = await import('../../server/routes/coding-preview.js');
  const { createCodingStudioRoutes } = await import('../../server/routes/coding-studio.js');
  const { createCodingScriptsRoutes } = await import('../../server/routes/coding-scripts.js');

  const gitService: CodingGitService = {
    ensureRepo: async () => { spawned.push('git:init'); return { initialized: false, alreadyRepo: true } as Awaited<ReturnType<CodingGitService['ensureRepo']>>; },
    gitStatus: async () => { spawned.push('git:status'); return { isRepo: false, branch: null, ahead: 0, dirtyFiles: 0, lastCommits: [] } as Awaited<ReturnType<CodingGitService['gitStatus']>>; },
    listCommits: async () => { spawned.push('git:log'); return []; },
  };
  const previewService: PreviewService = {
    startPreview: async () => { spawned.push('preview:start'); return { ok: true, view: undefined } as Awaited<ReturnType<PreviewService['startPreview']>>; },
    stopPreview: async () => ({ ok: true, note: 'not running' }) as Awaited<ReturnType<PreviewService['stopPreview']>>,
    getPreviewStatus: async () => ({ status: 'stopped' }) as Awaited<ReturnType<PreviewService['getPreviewStatus']>>,
    getPreviewLogs: async () => ({ status: 'stopped', has_live_handle: false, logs: '' }),
  };
  const orchestrator = {
    startOrResume: async () => { spawned.push('studio:start'); return fakeRun(); },
    advance: async () => { spawned.push('studio:advance'); return fakeRun(); },
    approvePlan: async () => { spawned.push('studio:approve'); return fakeRun(); },
    getRun: async () => fakeRun(),
    requestStop: async () => fakeRun(),
  } as unknown as StudioOrchestrator;

  const routers: Router[] = [
    await createCodingLargeRoutes(db, { serverDsn: 'postgresql://anton:anton@localhost:5432/anton' }),
    createCodingGitRoutes(db, { service: gitService }),
    createCodingPreviewRoutes(db, { service: previewService }),
    createCodingStudioRoutes(db, { makeOrchestrator: () => orchestrator }),
    await createCodingScriptsRoutes(db),
  ];

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = caller;
    next();
  });
  for (const r of routers) app.use('/api', r);
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
});

beforeEach(() => {
  reads.length = 0;
  spawned.length = 0;
  caller = ALICE;
  probePasses = true;
  process.env.DEPLOYMENT_MODE = 'team';
});

const call = (method: string, url: string, body: unknown = {}) => fetch(`${base}/api${url}`, {
  method,
  headers: { 'content-type': 'application/json' },
  body: method === 'GET' ? undefined : JSON.stringify(body),
});

/** Every process-spawning Code Studio route, keyed by the project it acts on. */
const EXEC_ROUTES = (id: string): ReadonlyArray<readonly [string, string, unknown]> => [
  ['POST', `/coding/projects/${id}/commands/test/run`, { approved: true }],
  ['POST', `/coding/projects/${id}/commands/setup/run`, { approved: true }],
  ['POST', `/coding/projects/${id}/tests/run`, { approved: true }],
  ['POST', `/coding/projects/${id}/preview/start`, { argv: ['node', 'dev.js'] }],
  ['GET', `/coding/projects/${id}/git/status`, undefined],
  ['GET', `/coding/projects/${id}/git/commits`, undefined],
  ['POST', `/coding/projects/${id}/git/init`, {}],
  ['POST', `/coding/studio/${id}/run`, {}],
  ['POST', `/coding/studio/${id}/run/approve-plan`, {}],
];

describe('team mode — a non-admin may not run code, even on their own project', () => {
  it.each(EXEC_ROUTES(OWN).map(([m, u, b]) => [`${m} ${u}`, m, u, b] as const))(
    '%s → 403, nothing spawned',
    async (_label, method, url, body) => {
      const res = await call(method, url, body);
      expect(res.status).toBe(403);
      expect(spawned).toEqual([]);
    },
  );

  it('coding-large refuses before reading anything past the ownership probe', async () => {
    for (const url of [`/coding/projects/${OWN}/tests/run`, `/coding/projects/${OWN}/commands/test/run`]) {
      reads.length = 0;
      const res = await call('POST', url, { approved: true });
      expect(res.status).toBe(403);
      expect(reads.map((r) => r.sql).filter((s) => !/SELECT 1 AS ok/.test(s))).toEqual([]);
    }
  });

  it('POST /coding/script-lite/preview (a request-supplied script) → 403', async () => {
    const res = await call('POST', '/coding/script-lite/preview', { script: 'print(1)', language: 'python' });
    expect(res.status).toBe(403);
  });
});

describe("team mode — another user's or an unowned project answers 404, not 403", () => {
  it.each(EXEC_ROUTES(FOREIGN).map(([m, u, b]) => [`${m} ${u}`, m, u, b] as const))(
    'foreign: %s → 404',
    async (_label, method, url, body) => {
      probePasses = false; // coding-large's assertOwned probe for Bob's project
      const res = await call(method, url, body);
      expect(res.status).toBe(404);
      expect(spawned).toEqual([]);
    },
  );

  it.each([
    ['GET', `/coding/projects/${UNOWNED}/git/status`],
    ['GET', `/coding/projects/${UNOWNED}/preview/status`],
    ['GET', `/coding/projects/${UNOWNED}/preview/logs`],
    ['GET', `/coding/studio/${UNOWNED}/run/status`],
    ['POST', `/coding/studio/${UNOWNED}/export`],
  ] as const)('unowned project: %s %s → 404 (it used to be everyone\'s)', async (method, url) => {
    const res = await call(method, url, {});
    expect(res.status).toBe(404);
  });
});

describe('negative controls — the gate is not an outage', () => {
  it("team non-admin: the owner's non-executing routes still answer", async () => {
    expect((await call('GET', `/coding/projects/${OWN}/preview/status`)).status).toBe(200);
    expect((await call('GET', `/coding/projects/${OWN}/preview/logs`)).status).toBe(200);
    expect((await call('GET', `/coding/studio/${OWN}/run/status`)).status).toBe(200);
    expect((await call('GET', `/coding/projects/${OWN}/releases`)).status).toBe(200);
  });

  for (const [label, who, mode] of [['team admin', ADMIN, 'team'], ['solo user', SOLO, 'solo']] as const) {
    it(`${label}: every gated route passes the gate`, async () => {
      caller = who;
      process.env.DEPLOYMENT_MODE = mode;
      // Past the gate, each route reaches its own next step: the seams record a
      // call, or coding-large answers 400 because no command is configured.
      expect((await call('POST', `/coding/projects/${OWN}/tests/run`, { approved: true })).status).toBe(400);
      expect((await call('POST', `/coding/projects/${OWN}/commands/test/run`, { approved: true })).status).not.toBe(403);
      expect((await call('POST', `/coding/projects/${OWN}/preview/start`, { argv: ['node', 'dev.js'] })).status).toBe(200);
      expect((await call('GET', `/coding/projects/${OWN}/git/status`)).status).toBe(200);
      expect((await call('POST', `/coding/projects/${OWN}/git/init`)).status).toBe(200);
      expect((await call('POST', `/coding/studio/${OWN}/run`)).status).toBe(200);
      expect((await call('POST', `/coding/studio/${OWN}/run/approve-plan`)).status).toBe(200);
      expect(spawned).toEqual(expect.arrayContaining(['preview:start', 'git:status', 'git:init', 'studio:start', 'studio:approve']));
      // Script Lite: past the gate the body check answers — nothing is executed.
      expect((await call('POST', '/coding/script-lite/preview', {})).status).toBe(400);
    });
  }

  it("team admin still reaches another user's project (support paths)", async () => {
    caller = ADMIN;
    expect((await call('GET', `/coding/projects/${FOREIGN}/git/status`)).status).toBe(200);
    expect((await call('GET', `/coding/projects/${UNOWNED}/preview/status`)).status).toBe(200);
  });
});
