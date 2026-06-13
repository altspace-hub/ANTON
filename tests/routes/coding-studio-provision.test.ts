/**
 * coding-studio-provision.test.ts — ANTON Studio Phase 3 (route-level).
 *
 * Mounts the REAL coding-large router with a FULLY MOCKED DatabaseAdapter + a
 * MOCK DDL runner + an injected server DSN. NO real database, NO real toolchain:
 *   • POST /workspace/provision builds the right CREATE ROLE / CREATE DATABASE /
 *     harden DDL + stores the scoped DSN in the (in-memory) vault
 *   • a role WITHOUT CREATEDB → 412 with a clear actionable error (no fallback)
 *   • POST /commands/:kind/run is blocked (409) when the BUILD gate has a
 *     mandatory dissent (the enforced gate guard), and 400 without approval
 *   • commands CRUD + apply-preset round-trip
 *   • DELETE drops the provisioned DB + role (mock runner records the DROPs)
 *
 * Spawn-heavy execution (the real execFile path) is covered at the service
 * level in coding-workspace.test.ts (runProjectTests with a mocked execFile);
 * this file never reaches a real spawn.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { RawDdlRunner } from '../../server/services/coding-studio-provisioner.js';

// Stable encryption key for the vault (DSN is stored encrypted).
if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'b'.repeat(64);

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ── A small in-memory adapter modelling exactly the tables the routes touch ──
interface FakeState {
  codingProjects: Map<string, Record<string, unknown>>;
  studioDbs: Map<string, { coding_project_id: string; db_name: string; role_name: string; scoped_dsn_encrypted: string; provisioned_at: string }>;
  panelDecisions: Map<string, { gate: string; panel_verdict: string; blocking: boolean; mode: string; extracted_at: string }>;
  testRuns: unknown[];
  rolcreatedb: boolean;
}

function makeFakeDb(state: FakeState): DatabaseAdapter {
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('pg_roles')) {
        return { rolname: 'anton', rolcreatedb: state.rolcreatedb, rolcreaterole: true, rolsuper: false } as T;
      }
      if (sql.includes('FROM coding_projects')) {
        return (state.codingProjects.get(String(params[0])) as T) ?? undefined;
      }
      if (sql.includes('FROM coding_studio_databases')) {
        return (state.studioDbs.get(String(params[0])) as T) ?? undefined;
      }
      if (sql.includes('FROM coding_panel_decisions')) {
        // (project, gate) → the decision row
        const gate = String(params[1]);
        const row = state.panelDecisions.get(gate);
        return (row as T) ?? undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return [] as T[]; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO coding_studio_databases')) {
        const [coding_project_id, db_name, role_name, scoped_dsn_encrypted] = params as string[];
        state.studioDbs.set(coding_project_id, { coding_project_id, db_name, role_name, scoped_dsn_encrypted, provisioned_at: '2026-06-13T00:00:00Z' });
      } else if (sql.includes('DELETE FROM coding_studio_databases')) {
        state.studioDbs.delete(String(params[0]));
      } else if (sql.includes('INSERT INTO coding_test_runs')) {
        state.testRuns.push(params);
      } else if (sql.startsWith('UPDATE coding_projects')) {
        // Apply the simple column updates the routes do, keyed by trailing id param.
        const id = String(params[params.length - 1]);
        const proj = state.codingProjects.get(id);
        if (proj) {
          if (sql.includes('directory_path = ?')) proj.directory_path = params[0];
          if (sql.includes('setup_command = ?') && sql.includes('build_command = ?') && sql.includes('test_command = ?')) {
            proj.setup_command = params[0]; proj.build_command = params[1]; proj.test_command = params[2]; proj.studio_language = params[3];
          } else if (sql.includes('setup_command = ?')) {
            proj.setup_command = params[0];
          } else if (sql.includes('build_command = ?')) {
            proj.build_command = params[0];
          } else if (sql.includes('test_command = NULL')) {
            proj.test_command = null;
          } else if (sql.includes('test_command = ?')) {
            proj.test_command = params[0];
          }
        }
      } else if (sql.includes('DELETE FROM coding_projects')) {
        state.codingProjects.delete(String(params[0]));
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

describe('ANTON Studio Phase 3 — provision + commands routes', () => {
  let state: FakeState;
  let ddlStatements: string[];
  let server: Server;
  let base: string;
  let studioRoot: string;

  beforeAll(async () => {
    studioRoot = await mkdtemp(path.join(os.tmpdir(), 'anton-studio-routeroot-'));
    process.env.CODING_STUDIO_ROOT = studioRoot;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await rm(studioRoot, { recursive: true, force: true });
    delete process.env.CODING_STUDIO_ROOT;
  });

  beforeEach(async () => {
    state = {
      codingProjects: new Map([[PROJECT_ID, { id: PROJECT_ID, name: 'studio-route', directory_path: null, environment_mode: null }]]),
      studioDbs: new Map(),
      panelDecisions: new Map(),
      testRuns: [],
      rolcreatedb: true,
    };
    ddlStatements = [];

    const mockRunner: RawDdlRunner = { async exec(sql: string) { ddlStatements.push(sql); } };

    const { createCodingLargeRoutes } = await import('../../server/routes/coding-large.js');
    const router = await createCodingLargeRoutes(makeFakeDb(state), {
      ddlRunner: () => mockRunner,
      serverDsn: 'postgresql://anton:anton@localhost:5432/anton',
    });
    if (server) await new Promise<void>((r) => server.close(() => r()));
    const app = express();
    app.use(express.json());
    app.use('/api', router);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  });

  async function post(p: string, body: unknown) {
    const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function put(p: string, body: unknown) {
    const r = await fetch(`${base}${p}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function get(p: string) {
    const r = await fetch(`${base}${p}`);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }
  async function del(p: string) {
    const r = await fetch(`${base}${p}`, { method: 'DELETE' });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('provisions a separate DB + role + vault DSN with the right DDL', async () => {
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/workspace/provision`, {});
    expect(status).toBe(200);
    expect(json.provisioned).toBe(true);

    // The DDL the mock runner saw: a teardown attempt, then CREATE ROLE/DATABASE/harden.
    expect(ddlStatements.some((s) => s.startsWith('CREATE ROLE') && s.includes('NOSUPERUSER'))).toBe(true);
    expect(ddlStatements.some((s) => s.startsWith('CREATE DATABASE') && s.includes('OWNER'))).toBe(true);
    expect(ddlStatements.some((s) => s.startsWith('REVOKE CONNECT'))).toBe(true);

    // The scoped DSN is in the vault (encrypted — not plaintext).
    const row = state.studioDbs.get(PROJECT_ID);
    expect(row).toBeTruthy();
    expect(row!.db_name).toMatch(/^proj_/);
    expect(row!.role_name).toMatch(/^studio_/);
    expect(row!.scoped_dsn_encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    // The response metadata carries NO secret/DSN/password.
    expect(JSON.stringify(json)).not.toMatch(/postgresql:\/\//);
    expect((json.consent as string)).toContain('cannot touch the rest of ANTON');

    // The workspace was bound (directory_path set under the studio root). The
    // folder is named after the slug (the DB is proj_<slug>, the dir is <slug>).
    const dir = String(state.codingProjects.get(PROJECT_ID)!.directory_path);
    expect(dir.startsWith(studioRoot)).toBe(true);
    expect(dir).toContain(row!.db_name.replace(/^proj_/, '')); // the slug
  });

  it('returns a CLEAR 412 (no silent fallback) when the role lacks CREATEDB', async () => {
    state.rolcreatedb = false;
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/workspace/provision`, {});
    expect(status).toBe(412);
    expect(String(json.error)).toMatch(/CREATEDB/i);
    // Nothing was created.
    expect(ddlStatements.some((s) => s.startsWith('CREATE DATABASE'))).toBe(false);
    expect(state.studioDbs.has(PROJECT_ID)).toBe(false);
  });

  it('404s provisioning an unknown project', async () => {
    const { status } = await post(`/api/coding/projects/does-not-exist/workspace/provision`, {});
    expect(status).toBe(404);
  });

  it('command CRUD + apply-preset round-trips', async () => {
    const preset = await post(`/api/coding/projects/${PROJECT_ID}/commands/apply-preset`, { language: 'rust' });
    expect(preset.status).toBe(200);
    expect((preset.json.preset as { test_command: string[] }).test_command).toEqual(['cargo', 'test']);

    const saved = await put(`/api/coding/projects/${PROJECT_ID}/commands/build`, { argv: ['cargo', 'build', '--release'] });
    expect(saved.status).toBe(200);
    expect(saved.json.command).toEqual(['cargo', 'build', '--release']);

    const listed = await get(`/api/coding/projects/${PROJECT_ID}/commands`);
    expect((listed.json.commands as { build: string[] }).build).toEqual(['cargo', 'build', '--release']);
  });

  it('rejects a shell as a command (validateTestArgv discipline)', async () => {
    const { status, json } = await put(`/api/coding/projects/${PROJECT_ID}/commands/test`, { argv: ['bash', '-c', 'rm -rf /'] });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/shell/i);
  });

  it('/commands/:kind/run requires explicit approval (400 before any spawn)', async () => {
    await post(`/api/coding/projects/${PROJECT_ID}/commands/apply-preset`, { language: 'rust' });
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/commands/test/run`, { approved: false });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/approval/i);
  });

  it('the BUILD-gate guard blocks /commands/run (409) on a mandatory dissent', async () => {
    await post(`/api/coding/projects/${PROJECT_ID}/commands/apply-preset`, { language: 'rust' });
    // Seed a blocking build-gate decision.
    state.panelDecisions.set('build', { gate: 'build', panel_verdict: 'dissent', blocking: true, mode: 'fast', extracted_at: '2026-06-13T00:00:00Z' });
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/commands/test/run`, { approved: true });
    expect(status).toBe(409);
    expect(String(json.error)).toMatch(/blocked|dissent/i);
    expect(json.gate).toBe('build');
    // Nothing executed.
    expect(state.testRuns).toHaveLength(0);
  });

  it('/commands/run with approval but no command returns 400 (configured nothing)', async () => {
    // No preset applied → no test command. Build gate not reviewed (not blocking).
    const { status, json } = await post(`/api/coding/projects/${PROJECT_ID}/commands/test/run`, { approved: true });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/No test command/i);
  });

  // NB: GET /toolchain spawns real `--version` probes; that path is covered at
  // the service level (probeToolchain with a MOCKED execFile) so this route
  // test stays spawn-free (DDL + DB fully mocked) per the no-real-toolchain rule.

  it('DELETE drops the provisioned DB + role then deletes the project', async () => {
    await post(`/api/coding/projects/${PROJECT_ID}/workspace/provision`, {});
    ddlStatements.length = 0; // focus on the teardown DDL
    const { status, json } = await del(`/api/coding/projects/${PROJECT_ID}`);
    expect(status).toBe(200);
    expect(json.database_dropped).toBe(true);
    expect(ddlStatements.some((s) => s.startsWith('DROP DATABASE IF EXISTS'))).toBe(true);
    expect(ddlStatements.some((s) => s.startsWith('DROP ROLE IF EXISTS'))).toBe(true);
    expect(state.codingProjects.has(PROJECT_ID)).toBe(false);
    expect(state.studioDbs.has(PROJECT_ID)).toBe(false);
  });
});
