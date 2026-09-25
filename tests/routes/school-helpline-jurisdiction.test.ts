/**
 * school-helpline-jurisdiction.test.ts — which country's helplines a pupil in
 * distress is shown (team isolation round 2, "Profile readers outside claude.ts").
 *
 * The safety screen read the jurisdiction from user_profiles id='default'. In
 * team mode that row is no longer anyone's profile (routes/profile.ts), so every
 * pupil got the instance owner's country and their own profile was ignored.
 *
 * Now: the pupil's own profile (loadLayer0Profile); in team mode, when they have
 * none, the instance's jurisdiction — the org context an admin sets, then the
 * instance profile row — so a child still gets local numbers. Solo is unchanged:
 * the single 'default' row.
 *
 * Fake adapter; the model call is mocked at claude-client's seam. The pupil's
 * message trips the deterministic layer-1 'support' rule, which sets the
 * X-Anton-Safety-Help header this test reads.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.mock('../../server/services/claude-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/claude-client.js')>();
  return {
    ...actual,
    isApiKeyConfigured: () => true,
    streamToResponse: vi.fn(async (_params: unknown, res: express.Response) => { res.status(200).json({ ok: true }); }),
  };
});
vi.mock('../../server/services/school-safety-ai.js', () => ({
  aiScreenStudentMessage: vi.fn(async () => ({ concern: null })),
}));

interface State {
  profiles: Map<string, { jurisdiction: string | null }>;
  orgJurisdiction: string | null;
}
const state: State = { profiles: new Map(), orgJurisdiction: null };

function makeFakeDb(): DatabaseAdapter {
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s === 'SELECT * FROM user_profiles WHERE id = ?' || s === 'SELECT jurisdiction FROM user_profiles WHERE id = ?') {
        const row = state.profiles.get(String(params[0]));
        return (row ? { id: params[0], ...row } : undefined) as T | undefined;
      }
      if (s === 'SELECT jurisdiction FROM org_context WHERE id = ?') {
        return { jurisdiction: state.orgJurisdiction } as T;
      }
      return undefined;   // growth profile, admin config, … — nothing seeded
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

let server: Server;
let base: string;
let current: { id: string; role: 'admin' | 'analyst' | 'viewer' } | null = null;
const originalMode = process.env.DEPLOYMENT_MODE;

beforeAll(async () => {
  const { createSchoolRoutes } = await import('../../server/routes/school.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (current) req.user = { id: current.id, username: current.id, role: current.role };
    next();
  });
  app.use('/api', await createSchoolRoutes(makeFakeDb()));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

afterEach(() => {
  current = null;
  state.profiles.clear();
  state.orgJurisdiction = null;
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = originalMode;
});

/** The helpline names shown to this pupil after a disclosure. */
async function helplinesFor(userId: string): Promise<string[]> {
  current = { id: userId, role: 'viewer' };
  const r = await fetch(`${base}/api/school/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'I want to hurt myself' }] }),
  });
  expect(r.status).toBe(200);
  expect(r.headers.get('x-anton-safety')).toBe('support');
  const help = JSON.parse(r.headers.get('x-anton-safety-help') ?? '[]') as Array<{ name: string }>;
  return help.map((h) => h.name);
}

describe('team mode', () => {
  it('the pupil\'s own jurisdiction wins over the instance row', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    state.profiles.set('default', { jurisdiction: 'SE' });
    state.profiles.set('pupil-gb', { jurisdiction: 'GB' });
    state.orgJurisdiction = 'SE';
    expect(await helplinesFor('pupil-gb')).toContain('Childline');
  });

  it('a pupil with no profile gets the org context\'s country before the instance row\'s', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    state.profiles.set('default', { jurisdiction: 'GB' });
    state.orgJurisdiction = 'SE';
    expect(await helplinesFor('pupil-new')).toContain('BRIS');
  });

  it('with no org jurisdiction either, the instance row still gives local numbers', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    state.profiles.set('default', { jurisdiction: 'GB' });
    expect(await helplinesFor('pupil-new')).toContain('Childline');
  });
});

describe('negative control — solo', () => {
  it('reads the single default row, as before (other rows and the org context play no part)', async () => {
    delete process.env.DEPLOYMENT_MODE;
    state.profiles.set('default', { jurisdiction: 'SE' });
    state.profiles.set('solo', { jurisdiction: 'GB' });
    state.orgJurisdiction = 'GB';
    expect(await helplinesFor('solo')).toContain('BRIS');
  });
});
