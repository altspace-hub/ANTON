/**
 * knowledge-library-admin-gate.test.ts — the instance-wide knowledge library is
 * changed by admins only on a team server (round-2 gap "verify:files",
 * knowledge-library writes).
 *
 * The library is one list every user reads, and its folders are indexed into the
 * shared document_chunks store; any user could create, edit, delete or re-index
 * an entry. Now POST, PATCH, DELETE and /:id/index sit behind requireAdminOrSolo.
 *
 * Negative controls: a team non-admin still READS the list and an entry's status;
 * a team admin and the solo user pass the gate (a body that fails validation
 * proves it without touching the filesystem).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

interface Caller { id: string; username: string; role: string }
const ALICE: Caller = { id: 'alice', username: 'alice', role: 'analyst' };
const ADMIN: Caller = { id: 'root', username: 'root', role: 'admin' };
const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

const writes: string[] = [];
const db: DatabaseAdapter = {
  dialect: 'postgresql',
  async get<T>(sql: string): Promise<T | undefined> {
    if (/COUNT\(\*\)/.test(sql)) return { c: 0 } as T;
    return { id: 'kl1', label: 'Policies', path: '/nowhere', recursive: 1, file_filter: null } as T;
  },
  async all<T>(): Promise<T[]> { return [] as T[]; },
  async run(sql: string): Promise<RunResult> { writes.push(sql); return { changes: 0, lastInsertRowid: 0 }; },
  async exec(): Promise<void> {},
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
  async close(): Promise<void> {},
};

let server: Server;
let base = '';
let caller: Caller = ALICE;
const savedMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  const { createKnowledgeLibraryRoutes } = await import('../../server/routes/knowledge-library.js');
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = caller;
    next();
  });
  app.use('/api', await createKnowledgeLibraryRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no addr');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = savedMode;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => {
  writes.length = 0;
  caller = ALICE;
  process.env.DEPLOYMENT_MODE = 'team';
});

const call = (method: string, url: string, body?: unknown) => fetch(`${base}/api${url}`, {
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const MUTATIONS: ReadonlyArray<readonly [string, string]> = [
  ['POST', '/knowledge-library'],
  ['PATCH', '/knowledge-library/kl1'],
  ['DELETE', '/knowledge-library/kl1'],
  ['POST', '/knowledge-library/kl1/index'],
];

describe('team mode — a non-admin cannot change the shared library', () => {
  it.each(MUTATIONS)('%s %s → 403, nothing written', async (method, url) => {
    const res = await call(method, url, { label: 'x', path: '/tmp' });
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('negative control — the list and an entry\'s status are still readable', async () => {
    expect((await call('GET', '/knowledge-library')).status).toBe(200);
    expect((await call('GET', '/knowledge-library/kl1/status')).status).toBe(200);
  });
});

describe('negative controls — admins and solo pass the gate', () => {
  for (const [label, who, mode] of [['team admin', ADMIN, 'team'], ['solo user', SOLO, 'solo']] as const) {
    it(`${label}: create reaches validation (400 without a label), delete reaches the store`, async () => {
      caller = who;
      if (mode === 'solo') delete process.env.DEPLOYMENT_MODE;
      expect((await call('POST', '/knowledge-library', {})).status).toBe(400);
      expect((await call('DELETE', '/knowledge-library/kl1')).status).toBe(404); // fake store deletes 0 rows
      expect(writes.some((s) => /DELETE FROM knowledge_library/.test(s))).toBe(true);
    });
  }
});
