/**
 * user-module-defaults.test.ts — GET /user-module-defaults/:moduleId and
 * POST /user-module-defaults/:moduleId/used (Wave 6 track H, 2026-09-17).
 *
 * Against a fake adapter that emulates the service's two statements (no
 * database) and a stubbed module loader: a first open returns null defaults
 * plus the profile prefill and the jurisdiction pack; a recorded run comes
 * back on the next open with the counter climbed; the caller's identity is
 * the row key; unauthenticated calls are refused.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.mock('../../server/services/module-loader.js', () => ({
  getModule: async (id: string) => id === 'gap-analysis'
    ? {
        id,
        guidedInputs: [
          { id: 'entity_type', type: 'select', label: 'Institution Type', options: [{ value: 'bank', label: 'Bank' }] },
          { id: 'jurisdiction', type: 'chips', label: 'Jurisdiction(s)', options: [{ value: 'eu', label: 'EU / AMLR' }, { value: 'sg', label: 'Singapore' }] },
          { id: 'org_name', type: 'text', label: 'Organisation name' },
          { id: 'f_secret', type: 'text', label: 'API token' },
        ],
      }
    : undefined,
}));

import { createUserModuleDefaultsRoutes } from '../../server/routes/user-module-defaults.js';
import { preloadDiskSkills } from '../../server/services/skills-manager.js';

interface Stored { output_formats: string; thinking: string | null; creativity: string | null; guided_inputs: string; used_count: number }

const state = {
  profile: { jurisdiction: 'Singapore', output_language: 'en', organisation: 'Lion Bank', company: null } as Record<string, string | null> | undefined,
  org: { jurisdiction: 'Sweden', org_name: 'Org Ltd', preferred_language: 'sv' } as Record<string, string | null> | undefined,
  rows: new Map<string, Stored>(),
  gets: [] as string[],
};

function makeFakeDb(): DatabaseAdapter {
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      state.gets.push(sql);
      if (/FROM user_profiles WHERE id = \?/.test(sql)) { expect(params).toEqual(['default']); return state.profile as T | undefined; }
      if (/FROM org_context WHERE id = \?/.test(sql)) { expect(params).toEqual(['default']); return state.org as T | undefined; }
      if (/FROM user_module_defaults/.test(sql)) return state.rows.get(`${params[0]}|${params[1]}`) as T | undefined;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 60)}`);
    },
    async all<T>(): Promise<T[]> { throw new Error('fake db: unexpected all()'); },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (!/INSERT INTO user_module_defaults/.test(sql)) throw new Error(`fake db: unexpected run(): ${sql.slice(0, 60)}`);
      const [userId, moduleId, formats, thinking, creativity, guided] = params as [string, string, string, string | null, string | null, string];
      const key = `${userId}|${moduleId}`;
      const prev = state.rows.get(key);
      state.rows.set(key, {
        output_formats: formats,
        thinking: thinking ?? prev?.thinking ?? null,
        creativity: creativity ?? prev?.creativity ?? null,
        guided_inputs: guided,
        used_count: (prev?.used_count ?? 0) + 1,
      });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

interface GetBody {
  defaults: { outputFormats: string[]; thinking: string | null; creativity: string | null; guidedInputs: Record<string, unknown>; usedCount: number } | null;
  prefill: Record<string, string | string[]>;
  jurisdictionSkill: { id: string; name: string } | null;
}

let server: Server;
let base = '';
let currentUser: { id: string; username: string; role: string } | null = { id: 'alice', username: 'alice', role: 'analyst' };

beforeAll(async () => {
  await preloadDiskSkills();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (currentUser) (req as unknown as { user: typeof currentUser }).user = currentUser;
    next();
  });
  app.use('/api', createUserModuleDefaultsRoutes(makeFakeDb()));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

async function getDefaults(moduleId: string): Promise<{ status: number; json: GetBody }> {
  const res = await fetch(`${base}/api/user-module-defaults/${moduleId}`);
  return { status: res.status, json: (await res.json()) as GetBody };
}

async function postUsed(moduleId: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/user-module-defaults/${moduleId}/used`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/user-module-defaults/:moduleId', () => {
  it('first open: null defaults, the profile prefill for the guided fields, the jurisdiction pack', async () => {
    const { status, json } = await getDefaults('gap-analysis');
    expect(status).toBe(200);
    expect(json.defaults).toBeNull();
    // profile "Singapore" beats org "Sweden"; org name from the profile; nothing for the select the profile cannot answer
    expect(json.prefill).toEqual({ jurisdiction: ['sg'], org_name: 'Lion Bank' });
    expect(json.jurisdictionSkill).toEqual({ id: 'jurisdiction-sg-mas', name: 'Singapore — Monetary Authority of Singapore (MAS)' });
    // both single-row tables were read
    expect(state.gets.some((s) => /FROM user_profiles/.test(s))).toBe(true);
    expect(state.gets.some((s) => /FROM org_context/.test(s))).toBe(true);
  });

  it('a module the loader does not know still answers — empty prefill, pack from the profile', async () => {
    const { status, json } = await getDefaults('custom-abc123');
    expect(status).toBe(200);
    expect(json.prefill).toEqual({});
    expect(json.jurisdictionSkill?.id).toBe('jurisdiction-sg-mas');
  });

  it('falls back to the org context jurisdiction when the profile has none; null pack when nothing maps', async () => {
    const saved = state.profile;
    state.profile = { jurisdiction: '', output_language: 'sv', organisation: '', company: '' };
    try {
      const { json } = await getDefaults('gap-analysis');
      expect(json.prefill).toEqual({ org_name: 'Org Ltd' }); // no "Sweden" option for the chips field
      expect(json.jurisdictionSkill).toBeNull();               // no pack for Sweden
      state.profile = undefined;
      state.org = undefined;
      const bare = await getDefaults('gap-analysis');
      expect(bare.json.prefill).toEqual({});
      expect(bare.json.jurisdictionSkill).toBeNull();
    } finally {
      state.profile = saved;
      state.org = { jurisdiction: 'Sweden', org_name: 'Org Ltd', preferred_language: 'sv' };
    }
  });

  it('rejects a malformed module id', async () => {
    const res = await fetch(`${base}/api/user-module-defaults/${encodeURIComponent('../etc')}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/user-module-defaults/:moduleId/used → GET round trip', () => {
  it('records the run, and the next open returns it with the counter climbed', async () => {
    const first = await postUsed('gap-analysis', {
      outputFormats: ['gap-scoring-matrix', 'action-plan'], thinking: 'investigate', creativity: 'strict',
      guidedInputs: { entity_type: 'bank', jurisdiction: ['sg'], f_secret: 'sk-live-123', note: 'n'.repeat(400) },
    });
    expect(first.status).toBe(200);
    expect(first.json).toEqual({ ok: true });

    const second = await postUsed('gap-analysis', { outputFormats: ['action-plan'], thinking: 'think', creativity: 'strict', guidedInputs: {} });
    expect(second.status).toBe(200);

    const { json } = await getDefaults('gap-analysis');
    expect(json.defaults).toEqual({ outputFormats: ['action-plan'], thinking: 'think', creativity: 'strict', guidedInputs: {}, usedCount: 2 });

    expect(state.rows.get('alice|gap-analysis')!.used_count).toBe(2);

    // guided inputs are stored hygienically: the field labelled "API token" is dropped
    // (the label comes from the module loader), a long value is capped
    const third = await postUsed('gap-analysis', {
      outputFormats: [], thinking: 'quick', creativity: 'balanced',
      guidedInputs: { f_secret: 'sk-live-123', entity_type: 'bank', note: 'n'.repeat(400) },
    });
    expect(third.status).toBe(200);
    const stored = JSON.parse(state.rows.get('alice|gap-analysis')!.guided_inputs) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['entity_type', 'note']);
    expect((stored.note as string).length).toBe(200);
    expect((await getDefaults('gap-analysis')).json.defaults?.usedCount).toBe(3);
  });

  it('the row is keyed by the caller — another user opens to null', async () => {
    currentUser = { id: 'bob', username: 'bob', role: 'analyst' };
    try {
      const { json } = await getDefaults('gap-analysis');
      expect(json.defaults).toBeNull();
    } finally {
      currentUser = { id: 'alice', username: 'alice', role: 'analyst' };
    }
  });

  it('a body that is not an object is a 400; an unknown level is tolerated (kept from last time)', async () => {
    const bad = await fetch(`${base}/api/user-module-defaults/gap-analysis/used`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[1,2]' });
    expect(bad.status).toBe(400);
    const odd = await postUsed('gap-analysis', { outputFormats: ['action-plan'], thinking: 'ludicrous', creativity: 'wild', guidedInputs: null });
    expect(odd.status).toBe(200);
    const { json } = await getDefaults('gap-analysis');
    expect(json.defaults?.thinking).toBe('quick');
    expect(json.defaults?.creativity).toBe('balanced');
  });

  it('unauthenticated calls are refused on both routes', async () => {
    currentUser = null;
    try {
      expect((await getDefaults('gap-analysis')).status).toBe(401);
      expect((await postUsed('gap-analysis', { outputFormats: [] })).status).toBe(401);
    } finally {
      currentUser = { id: 'alice', username: 'alice', role: 'analyst' };
    }
  });
});
