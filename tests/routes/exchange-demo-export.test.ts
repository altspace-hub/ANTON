/**
 * exchange-demo-export.test.ts — Exchange on the public showcase (2026-10-02).
 *
 * Demo accounts are analysts, so the team-mode rules let a visitor sign an
 * export with the instance's Ed25519 key (a stranger's prompt that verifies as
 * "signed by the showcase"), export a built-in with any author and
 * organisation typed into the request, and import a bundle — which installs
 * its skills and personas for every visitor and records its signer for all.
 *
 * Now, with DEMO_MODE=true, a visitor (a non-admin):
 *   - exports only a custom module of their own, always unsigned, whatever
 *     `sign` says;
 *   - gets 404 for someone else's module and for a built-in;
 *   - gets 404 on import and validate, and nothing is written.
 *
 * Negative controls: the demo's admin still exports signed; outside demo mode
 * an analyst's export is signed as before.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import AdmZip from 'adm-zip';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createExchangeRoutes } from '../../server/routes/exchange.js';
import { bundleModuleToAnton } from '../../server/services/anton-bundler.js';
import { makeFakeBundleDb, customModuleRow, type FakeBundleDb } from '../helpers/anton-bundle-fake-db.js';

type Role = 'viewer' | 'analyst' | 'admin';

const OWNERS = new Map<string, string>([['custom-own11', 'vis_a'], ['custom-bob22', 'vis_b']]);

let server: Server;
let base = '';
let current: { id: string; username: string; role: Role } | null = null;
let fake: FakeBundleDb;
let someBundle: Buffer;
const saved = { mode: process.env.DEPLOYMENT_MODE, demo: process.env.DEMO_MODE };

/** The fake bundle db, plus the owner column the demo rule reads (the fake does not model user_id). */
function ownedDb(): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    get: async (sql: string, ...p: unknown[]) => {
      const flat = p.length === 1 && Array.isArray(p[0]) ? p[0] as unknown[] : p;
      if (/FROM custom_modules WHERE id = \? AND user_id = \?/.test(sql)) {
        const [id, user] = flat as string[];
        return fake.modules.has(id) && OWNERS.get(id) === user ? { ok: 1 } : undefined;
      }
      return fake.db.get(sql, ...flat);
    },
    all: (sql: string, ...p: unknown[]) => fake.db.all(sql, ...p),
    run: (sql: string, ...p: unknown[]) => fake.db.run(sql, ...p),
    exec: (sql: string) => fake.db.exec(sql),
    transaction: <T>(fn: (d: DatabaseAdapter) => Promise<T>) => fake.db.transaction(fn),
    close: () => fake.db.close(),
  } as unknown as DatabaseAdapter;
}

function signatureOf(buffer: Buffer): unknown {
  const manifest = JSON.parse(new AdmZip(buffer).getEntry('manifest.json')!.getData().toString('utf-8')) as Record<string, unknown>;
  return manifest.signature;
}

async function exportModule(id: string, opts: { custom?: boolean; sign?: boolean } = {}): Promise<{ status: number; buffer: Buffer }> {
  const res = await fetch(`${base}/api/exchange/export/${id}${opts.custom === false ? '' : '?type=custom'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorName: 'Anyone', authorOrg: 'Any Org', sign: opts.sign ?? true }),
  });
  return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
}

function form(buffer: Buffer): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' }), 'module.anton');
  return fd;
}

beforeAll(async () => {
  const exporter = makeFakeBundleDb({ modules: [customModuleRow({ thinking: 'think' })] });
  someBundle = await bundleModuleToAnton(exporter.db, 'custom-ab12cd34');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (current) (req as unknown as { user: typeof current }).user = current;
    next();
  });
  app.use('/api', await createExchangeRoutes(ownedDb()));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  fake = makeFakeBundleDb({
    instanceName: 'ANTON Showcase',
    modules: [
      customModuleRow({ thinking: 'think' }, { id: 'custom-own11', name: 'My AML checklist' }),
      customModuleRow({ thinking: 'think' }, { id: 'custom-bob22', name: 'Bob\'s module' }),
    ],
  });
  process.env.DEPLOYMENT_MODE = 'team';
  process.env.DEMO_MODE = 'true';
});

afterEach(() => {
  current = null;
  if (saved.mode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = saved.mode;
  if (saved.demo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved.demo;
});

const VISITOR = { id: 'vis_a', username: 'vis_a', role: 'analyst' as Role };
const ADMIN = { id: 'root', username: 'root', role: 'admin' as Role };

describe('demo visitor: export own modules, unsigned', () => {
  it('exports their own module, and it is unsigned although sign=true was sent', async () => {
    current = VISITOR;
    const r = await exportModule('custom-own11', { sign: true });
    expect(r.status).toBe(200);
    expect(signatureOf(r.buffer)).toBeUndefined();
    expect(fake.writes.filter((w) => w.sql.includes('instance_identity'))).toEqual([]);
  });

  it('negative control: the demo\'s admin exports the same module signed', async () => {
    current = ADMIN;
    const r = await exportModule('custom-own11', { sign: true });
    expect(r.status).toBe(200);
    expect(signatureOf(r.buffer)).toMatchObject({ signer_pubkey: expect.any(String) });
  });

  it('negative control: outside demo mode an analyst\'s export is signed as before', async () => {
    delete process.env.DEMO_MODE;
    current = VISITOR;
    const r = await exportModule('custom-own11', { sign: true });
    expect(r.status).toBe(200);
    expect(signatureOf(r.buffer)).toMatchObject({ signer_pubkey: expect.any(String) });
  });

  it('someone else\'s module is a 404, the same as one that does not exist', async () => {
    current = VISITOR;
    expect((await exportModule('custom-bob22')).status).toBe(404);
    expect((await exportModule('custom-missing')).status).toBe(404);
  });

  it('a built-in module is a 404 for a visitor (its author and organisation come from the request)', async () => {
    current = VISITOR;
    expect((await exportModule('gap-analysis', { custom: false })).status).toBe(404);
  });
});

describe('demo visitor: no import', () => {
  it('import and validate answer 404, and nothing is written', async () => {
    current = VISITOR;
    for (const path of ['/exchange/import', '/exchange/validate', '/exchange/import-run', '/exchange/import-bundle/market-index']) {
      const res = await fetch(`${base}/api${path}`, { method: 'POST', body: form(someBundle) });
      expect(res.status, path).toBe(404);
    }
    expect(fake.modules.has('custom-ab12cd34')).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  it('negative control: the demo\'s admin still imports', async () => {
    current = ADMIN;
    const res = await fetch(`${base}/api/exchange/import`, { method: 'POST', body: form(someBundle) });
    expect(res.status).toBe(200);
    expect((await res.json() as { success: boolean }).success).toBe(true);
  });
});
