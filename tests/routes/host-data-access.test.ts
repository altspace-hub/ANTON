/**
 * host-data-access.test.ts — reading and writing the server's disk and ANTON's
 * own database from a request (2026-09-25).
 *
 * Found while checking ANTON for a public showcase, and just as real on a team
 * server:
 *  - POST /api/data/import {source:'file'} read ANY filePath on the server
 *    (configuration secrets included) and returned its rows; a workflow
 *    data_import step did the same.
 *  - POST /api/data/export {destination:'database'} handed the request ANTON's
 *    own connection and a table name of its choosing: an upsert into `users`
 *    made the caller an admin. {destination:'file'} wrote a file anywhere.
 *  - DELETE /api/data/cache cleared every user's datasets.
 *  - An agent's 'database' connector with no connection string reads ANTON's
 *    own database through a table list its creator chooses, so any user could
 *    read the users table and other people's sessions — through the connector
 *    test route with no model involved at all.
 *
 * Now: every file path goes through the folder guard (ALLOWED_FOLDER_PATHS);
 * a database export writes only into tables listed in DATA_EXPORT_TABLES; on a
 * team server only an admin may touch server files or export into the database
 * (routes and workflow steps), clear the cache, or add a database connector;
 * a connector reading ANTON's database never reads account, credential or
 * settings tables, runs read-only with a timeout, and on a team server only
 * for an admin's agent.
 *
 * Negative controls throughout: the admin, the solo user, and a permitted path
 * or table still work. Fake adapters, no database.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-host-data-access';
});

import { importData, exportData } from '../../server/services/data-importer.js';
import { createDataset } from '../../server/services/data-transformer.js';
import { forbiddenLocalTable, createConnectorExecutor } from '../../server/services/agent-connector-executor.js';

interface Executed { sql: string; params: unknown[] }

const saved = {
  mode: process.env.DEPLOYMENT_MODE,
  folders: process.env.ALLOWED_FOLDER_PATHS,
  tables: process.env.DATA_EXPORT_TABLES,
};
let allowedDir = '';
let outsideDir = '';

beforeAll(() => {
  allowedDir = mkdtempSync(path.join(tmpdir(), 'anton-allowed-'));
  outsideDir = mkdtempSync(path.join(tmpdir(), 'anton-outside-'));
  writeFileSync(path.join(allowedDir, 'rows.csv'), 'id,amount\n1,5\n');
  writeFileSync(path.join(outsideDir, 'secret.csv'), 'KEY,VALUE\nJWT_SECRET,hunter2\n');
});

afterAll(() => {
  for (const [key, value] of [['DEPLOYMENT_MODE', saved.mode], ['ALLOWED_FOLDER_PATHS', saved.folders], ['DATA_EXPORT_TABLES', saved.tables]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(allowedDir, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env.DEPLOYMENT_MODE;
  process.env.ALLOWED_FOLDER_PATHS = allowedDir;
  delete process.env.DATA_EXPORT_TABLES;
});

function recordingDb(getRow?: (sql: string, params: unknown[]) => unknown): DatabaseAdapter & { executed: Executed[] } {
  const executed: Executed[] = [];
  const db = {
    executed,
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      executed.push({ sql, params });
      return (getRow?.(sql, params) ?? undefined) as T | undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      executed.push({ sql, params });
      return [{ id: 1 }] as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      executed.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> {
      executed.push({ sql: 'BEGIN', params: [] });
      const out = await fn(db as unknown as DatabaseAdapter);
      executed.push({ sql: 'COMMIT', params: [] });
      return out;
    },
    async close(): Promise<void> {},
  };
  return db as unknown as DatabaseAdapter & { executed: Executed[] };
}

describe('data-importer: files stay inside ALLOWED_FOLDER_PATHS', () => {
  it('refuses to read a file outside the allowed folders', async () => {
    await expect(importData({ source: 'file', filePath: path.join(outsideDir, 'secret.csv') }))
      .rejects.toThrow(/File path not permitted/);
  });

  it('refuses a relative path, which would depend on where the server was started', async () => {
    await expect(importData({ source: 'file', filePath: './rows.csv' })).rejects.toThrow(/File path not permitted/);
  });

  it('refuses to write a file outside the allowed folders, and writes nothing', async () => {
    const target = path.join(outsideDir, 'planted.json');
    await expect(exportData(createDataset([{ a: 1 }], 'test'), { destination: 'file', filePath: target, fileType: 'json' }))
      .rejects.toThrow(/File path not permitted/);
    expect(existsSync(target)).toBe(false);
  });

  it('negative control: a file inside an allowed folder is read, and one is written there', async () => {
    const dataset = await importData({ source: 'file', filePath: path.join(allowedDir, 'rows.csv') });
    expect(dataset.metadata.rowCount).toBe(1);
    const target = path.join(allowedDir, 'out.json');
    await exportData(dataset, { destination: 'file', filePath: target, fileType: 'json' });
    expect(existsSync(target)).toBe(true);
  });
});

describe('data-importer: a database export writes only into DATA_EXPORT_TABLES', () => {
  it("refuses an upsert into ANTON's users table, running no SQL", async () => {
    const db = recordingDb();
    const promotion = createDataset([{ id: 'u-bob', role: 'admin' }], 'body');
    await expect(exportData(promotion, { destination: 'database', db, tableName: 'users', insertMode: 'upsert' }))
      .rejects.toThrow(/not enabled/);
    expect(db.executed).toHaveLength(0);
  });

  it('refuses every table while DATA_EXPORT_TABLES is unset', async () => {
    const db = recordingDb();
    await expect(exportData(createDataset([{ id: 1 }], 'body'), { destination: 'database', db, tableName: 'reports' }))
      .rejects.toThrow(/DATA_EXPORT_TABLES/);
    expect(db.executed).toHaveLength(0);
  });

  it('negative control: a listed table is written', async () => {
    process.env.DATA_EXPORT_TABLES = 'reports, ledger';
    const db = recordingDb();
    await exportData(createDataset([{ id: 1 }], 'body'), { destination: 'database', db, tableName: 'Reports' });
    expect(db.executed[0]?.sql).toMatch(/^INSERT INTO Reports/);
  });
});

describe('forbiddenLocalTable', () => {
  it('names account, credential, settings and catalogue tables, however they are written', () => {
    for (const sql of [
      'SELECT * FROM users',
      'SELECT * FROM public.users',
      'SELECT s.* FROM orders o JOIN user_sessions s ON s.user_id = o.owner',
      'SELECT * FROM user_identities',
      'SELECT * FROM custom_model_endpoints',
      'SELECT * FROM app_session_tokens',
      'SELECT * FROM agent_connectors',
      'SELECT * FROM pg_catalog.pg_authid',
      'SELECT * FROM information_schema.tables',
      'WITH x AS (SELECT * FROM users) SELECT * FROM x',
    ]) {
      expect(forbiddenLocalTable(sql), sql).not.toBeNull();
    }
  });

  it('negative control: business tables are not named', () => {
    for (const sql of ['SELECT * FROM orders', 'SELECT * FROM reports r JOIN invoices i ON i.id = r.invoice', 'SELECT * FROM session_snapshots']) {
      expect(forbiddenLocalTable(sql), sql).toBeNull();
    }
  });
});

describe("agent database connector reading ANTON's own database", () => {
  const CONNECTOR = {
    id: 'aconn-1', name: 'db', connector_type: 'database',
    config: JSON.stringify({ tables: ['orders', 'users'] }), auth_config: '{}',
  };
  function executorDb(ownerRole: string | null) {
    return recordingDb((sql) => {
      if (/FROM agent_connectors/.test(sql)) return CONNECTOR;
      if (/FROM agent_profiles a LEFT JOIN users u/.test(sql)) return { role: ownerRole };
      return undefined;
    });
  }
  const call = (query: string) => ({ tool: 'db', action: query, params: {} });
  const ran = (db: { executed: Executed[] }, query: string) => db.executed.some((e) => e.sql === query);

  it('never reads the users table, even for an admin agent and in solo mode', async () => {
    for (const mode of ['team', undefined]) {
      if (mode) process.env.DEPLOYMENT_MODE = mode; else delete process.env.DEPLOYMENT_MODE;
      const db = executorDb('admin');
      const r = await (await createConnectorExecutor(db)).executeCall('agent-1', call('SELECT * FROM users'));
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/cannot be read through a connector/);
      expect(ran(db, 'SELECT * FROM users')).toBe(false);
    }
  });

  it("team server: a non-admin's agent reads nothing from ANTON's database", async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = executorDb('analyst');
    const r = await (await createConnectorExecutor(db)).executeCall('agent-1', call('SELECT * FROM orders'));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/administrator/);
    expect(ran(db, 'SELECT * FROM orders')).toBe(false);
  });

  it("negative control: an admin's agent reads an allowed table, read-only and with a timeout", async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const db = executorDb('admin');
    const r = await (await createConnectorExecutor(db)).executeCall('agent-1', call('SELECT * FROM orders'));
    expect(r.success).toBe(true);
    const order = db.executed.map((e) => e.sql);
    const begin = order.indexOf('BEGIN');
    expect(order.slice(begin, begin + 5)).toEqual([
      'BEGIN', 'SET TRANSACTION READ ONLY', "SET LOCAL statement_timeout = '5s'", 'SELECT * FROM orders', 'COMMIT',
    ]);
  });

  it('negative control: in solo mode the owner is not checked', async () => {
    const db = executorDb(null);
    const r = await (await createConnectorExecutor(db)).executeCall('agent-1', call('SELECT * FROM orders'));
    expect(r.success).toBe(true);
  });
});

describe('HTTP: /api/data and workflow steps on a team server', () => {
  interface Caller { id: string; username: string; role: 'admin' | 'analyst' }
  const ANALYST: Caller = { id: 'u-bob', username: 'bob', role: 'analyst' };
  const ADMIN: Caller = { id: 'u-root', username: 'root', role: 'admin' };
  let caller: Caller = ANALYST;
  let server: Server;
  let base = '';
  const db = recordingDb((sql, params) => {
    if (/SELECT role FROM users WHERE id = \?/.test(sql)) return { role: params[0] === ADMIN.id ? 'admin' : 'analyst' };
    return undefined;
  });

  beforeAll(async () => {
    const { createDataRoutes } = await import('../../server/routes/data.js');
    const { createWorkflowRoutes } = await import('../../server/routes/workflows.js');
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: Caller }).user = caller;
      next();
    });
    app.use('/api/data', await createDataRoutes(db));
    app.use('/api/workflows', await createWorkflowRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  beforeEach(() => {
    caller = ANALYST;
    process.env.DEPLOYMENT_MODE = 'team';
  });

  const send = (method: string, route: string, body?: unknown) => fetch(`${base}${route}`, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const importFile = () => send('POST', '/api/data/import', { source: 'file', filePath: path.join(allowedDir, 'rows.csv') });

  it('a non-admin cannot import a server file, export to the database or a file, or clear the cache', async () => {
    expect((await importFile()).status).toBe(403);
    for (const destination of ['database', 'file']) {
      const r = await send('POST', '/api/data/export', { datasetId: 'x', config: { destination, tableName: 'users', filePath: path.join(allowedDir, 'x.json') } });
      expect(r.status, destination).toBe(403);
    }
    expect((await send('DELETE', '/api/data/cache')).status).toBe(403);
  });

  it("a non-admin's workflow step cannot read a server file", async () => {
    const r = await send('POST', '/api/workflows/execute-step', {
      step: { id: 's1', type: 'data_import', label: 'Import', config: { importSource: 'file', filePath: path.join(allowedDir, 'rows.csv') } },
    });
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toMatch(/Only an administrator/);
  });

  it('negative controls: the admin imports the file, downloads it, and clears the cache; solo is not gated', async () => {
    caller = ADMIN;
    const imported = await importFile();
    expect(imported.status).toBe(200);
    const { datasetId } = (await imported.json()) as { datasetId: string };
    const download = await send('GET', `/api/data/cache/${datasetId}/download?name=rows`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('rows.json');
    expect(await download.json()).toEqual([{ id: '1', amount: '5' }]);   // CSV cells stay text
    expect((await send('DELETE', '/api/data/cache')).status).toBe(200);

    const step = await send('POST', '/api/workflows/execute-step', {
      step: { id: 's1', type: 'data_import', label: 'Import', config: { importSource: 'file', filePath: path.join(allowedDir, 'rows.csv') } },
    });
    expect(step.status).toBe(200);

    caller = ANALYST;
    delete process.env.DEPLOYMENT_MODE;
    expect((await importFile()).status).toBe(200);
  });
});
