/**
 * connection-guardrails-live.test.ts — the guardrails RUN, they do not merely exist.
 *
 * The bug this pins was not a missing check. The checks were written, carefully, in
 * server/connections/{api,database}-adapter.ts — and nothing in the repository imported
 * those files. The live path (workflow-executor.ts, plus its near-duplicate in
 * routes/workflows.ts) reimplemented the fetch/pg calls and consulted none of the
 * connection's settings. A unit test of the guard functions would have passed happily
 * throughout, because the guard functions were never the problem.
 *
 * So every test here drives the REAL entry point, executeScheduledWorkflow, with only
 * the network edges (global fetch, the pg Client) stubbed, and asserts on what reached
 * those edges. Measured before the fix, through exactly this harness:
 *
 *   - `DELETE /NOT-in-the-allowlist` on a connection allowing only `GET /allowed`
 *     produced fetch calls: ["https://api.example.com/NOT-in-the-allowlist"], run success;
 *   - `ssl:true, sslVerifyCert:true` produced `ssl: { rejectUnauthorized: false }`;
 *   - `DELETE FROM secrets WHERE 1=1` on a connection with no write permission ran.
 *
 * Each blocking assertion is paired with a permitting one, so "fetch was not called"
 * cannot pass because the step never ran for some unrelated reason.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

/** Options handed to `new PgClient(...)` by the executor, in call order. */
const pgClientOptions: Record<string, unknown>[] = [];
/** Queries the fake pg client actually executed. */
const pgQueries: string[] = [];
let pgRowsToReturn = 3;

vi.mock('pg', () => {
  class FakeClient {
    constructor(opts: Record<string, unknown>) { pgClientOptions.push(opts); }
    async connect() { /* noop */ }
    async query(sql: string) {
      pgQueries.push(sql);
      return {
        rows: Array.from({ length: pgRowsToReturn }, (_, i) => ({ i })),
        rowCount: pgRowsToReturn,
        fields: [],
      };
    }
    async end() { /* noop */ }
  }
  return { default: { Client: FakeClient } };
});

// resolveTemplate is imported from routes/workflows.ts, which drags in the whole Express
// route module. Substituted with a faithful {{dotted.path}} resolver — not an identity
// stub — because the max_rows test observes a step output by interpolating it into the
// NEXT step's URL, which is the only place a step's output becomes externally visible.
vi.mock('../../server/routes/workflows.js', () => ({
  resolveTemplate: (t: string, ctx: Record<string, unknown>) =>
    String(t).replace(/\{\{([^}]+)\}\}/g, (_m: string, expr: string) => {
      const v = expr.trim().split('.').reduce<unknown>(
        (acc, k) => (acc === null || acc === undefined ? undefined : (acc as Record<string, unknown>)[k]),
        ctx,
      );
      return v === undefined || v === null ? '' : String(v);
    }),
}));

interface FakeConn {
  id: string;
  display_name: string;
  type: string;
  permissions: string[];
  status: string;
  config: Record<string, unknown>;
}

/** Mutable so each test can shape the connection the executor will load. */
const connections = new Map<string, FakeConn>();

vi.mock('../../server/services/connection-manager.js', () => ({
  createConnectionManager: vi.fn(async () => ({
    get: async (id: string) => connections.get(id) ?? null,
    logAction: () => { /* fire-and-forget in production too */ },
  })),
}));

import { executeScheduledWorkflow } from '../../server/services/workflow-executor.js';
import { resetRateLimits } from '../../server/services/connection-guard.js';

function makeFakeDb(definition: unknown): DatabaseAdapter {
  const runs = new Map<string, Record<string, unknown>>();
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM workflow_schedules')) {
        return { workflow_definition: JSON.stringify(definition) } as T;
      }
      if (sql.includes('FROM workflow_runs')) return runs.get(String(params[0])) as T | undefined;
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO workflow_runs')) {
        runs.set(String(params[0]), { id: params[0], status: params[3] });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return db;
}

function workflow(steps: Record<string, unknown>[]) {
  return {
    id: 'wf-guardrails', label: 'Guardrails', shortLabel: 'G', icon: 'ClipboardList',
    description: '', category: 'custom', estimatedTime: '', tags: [],
    steps: steps.map((s, i) => ({ id: `s${i + 1}`, label: `Step ${i + 1}`, description: '', ...s })),
  };
}

async function run(...steps: Record<string, unknown>[]) {
  return executeScheduledWorkflow(makeFakeDb(workflow(steps)), 'wf-guardrails', 1);
}

/** Records every URL the executor tried to fetch. */
function stubFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return {
      status: 200, ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
      text: async () => 'ok',
    };
  }));
  return urls;
}

beforeEach(() => {
  pgClientOptions.length = 0;
  pgQueries.length = 0;
  pgRowsToReturn = 3;
  connections.clear();
  resetRateLimits();
  vi.unstubAllGlobals();
});

// ── API: endpoint allowlist ────────────────────────────────────────────────

describe('api_call honours allowed_endpoints', () => {
  const withAllowlist = (): FakeConn => ({
    id: 'api-1', display_name: 'API', type: 'api', permissions: [], status: 'active',
    config: { base_url: 'https://api.example.com', allowed_endpoints: [{ method: 'GET', path: '/allowed' }] },
  });

  it('blocks a call outside the allowlist BEFORE any request leaves', async () => {
    connections.set('api-1', withAllowlist());
    const urls = stubFetch();

    const result = await run({
      type: 'api_call',
      config: { connectionId: 'api-1', method: 'DELETE', endpointPath: '/NOT-in-the-allowlist' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowed_endpoints/);
    // The load-bearing half: the credentials-bearing request never happened.
    expect(urls).toEqual([]);
  });

  it('still lets a listed call through — the block above is not blocking everything', async () => {
    connections.set('api-1', withAllowlist());
    const urls = stubFetch();

    const result = await run({
      type: 'api_call',
      config: { connectionId: 'api-1', method: 'GET', endpointPath: '/allowed' },
    });

    expect(result.success).toBe(true);
    expect(urls).toEqual(['https://api.example.com/allowed']);
  });

  it('does not restrict a connection that configured no endpoints', async () => {
    // Upgrade safety: every connection created before this control existed has an empty
    // list, and must keep working exactly as it did.
    connections.set('api-1', { ...withAllowlist(), config: { base_url: 'https://api.example.com' } });
    const urls = stubFetch();

    const result = await run({
      type: 'api_call',
      config: { connectionId: 'api-1', method: 'POST', endpointPath: '/anything' },
    });

    expect(result.success).toBe(true);
    expect(urls).toEqual(['https://api.example.com/anything']);
  });
});

// ── API: rate limit ────────────────────────────────────────────────────────

describe('api_call honours rate_limit', () => {
  it('refuses the call that exceeds the per-minute budget, and sends nothing', async () => {
    connections.set('api-2', {
      id: 'api-2', display_name: 'API', type: 'api', permissions: [], status: 'active',
      config: { base_url: 'https://api.example.com', rate_limit: 1 },
    });
    const urls = stubFetch();

    const first = await run({ type: 'api_call', config: { connectionId: 'api-2', endpointPath: '/x' } });
    const second = await run({ type: 'api_call', config: { connectionId: 'api-2', endpointPath: '/x' } });

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/Rate limit exceeded/);
    expect(urls).toHaveLength(1);
  });
});

// ── Database: SQL shape ────────────────────────────────────────────────────

const dbConn = (over: Partial<FakeConn> = {}): FakeConn => ({
  id: 'db-1', display_name: 'DB', type: 'database', permissions: [], status: 'active',
  config: {
    driver: 'postgresql', host: 'db.example.com', port: 5432,
    database: 'x', username: 'u', password: 'p',
  },
  ...over,
});

describe('database_query is read-only unless the connection says otherwise', () => {
  it('refuses a DELETE on a connection with no write permission, and runs no SQL', async () => {
    connections.set('db-1', dbConn());

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'DELETE FROM secrets WHERE 1=1' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Only SELECT queries are permitted/);
    expect(pgQueries).toEqual([]);
    expect(pgClientOptions).toEqual([]);   // it never even connected
  });

  it('allows the same DELETE once the connection carries "write"', async () => {
    connections.set('db-1', dbConn({ permissions: ['read', 'write'] }));

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'DELETE FROM secrets WHERE 1=1' },
    });

    expect(result.success).toBe(true);
    expect(pgQueries).toEqual(['DELETE FROM secrets WHERE 1=1']);
  });

  it('allows a plain SELECT, so the refusal above is about the verb', async () => {
    connections.set('db-1', dbConn());

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders' },
    });

    expect(result.success).toBe(true);
    expect(pgQueries).toEqual(['SELECT * FROM orders']);
  });

  it('refuses a piggybacked second statement', async () => {
    connections.set('db-1', dbConn());

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'SELECT 1 FROM orders; DROP TABLE users' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/single statement/);
    expect(pgQueries).toEqual([]);
  });
});

// ── Database: table allowlist ──────────────────────────────────────────────

describe('database_query honours allowed_tables', () => {
  it('refuses a table outside the list', async () => {
    connections.set('db-1', dbConn({
      config: { ...dbConn().config, allowed_tables: 'orders' },
    }));

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM api_keys' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowed_tables/);
    expect(pgQueries).toEqual([]);
  });

  it('permits a table inside the list', async () => {
    connections.set('db-1', dbConn({
      config: { ...dbConn().config, allowed_tables: 'orders' },
    }));

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders' },
    });

    expect(result.success).toBe(true);
    expect(pgQueries).toEqual(['SELECT * FROM orders']);
  });
});

// ── Database: row ceiling ──────────────────────────────────────────────────

describe('database_query honours max_rows_per_query', () => {
  /**
   * A step's output is merged into the run context and never persisted, so the only way
   * to observe how many rows survived is to interpolate the count into a following step
   * that does reach an edge we control. The second step's URL therefore carries the real
   * post-truncation row count — asserting on the variable this test set would prove
   * nothing about the executor.
   */
  const echoRowCount = {
    type: 'api_call',
    config: { connectionId: 'api-echo', method: 'GET', endpointPath: '/rows/{{q.rows.length}}' },
  };

  beforeEach(() => {
    connections.set('api-echo', {
      id: 'api-echo', display_name: 'Echo', type: 'api', permissions: [], status: 'active',
      config: { base_url: 'https://api.example.com' },
    });
  });

  it('caps the step maxRows at the connection ceiling', async () => {
    pgRowsToReturn = 10;
    connections.set('db-1', dbConn({ config: { ...dbConn().config, max_rows_per_query: 2 } }));
    const urls = stubFetch();

    const result = await run(
      {
        type: 'database_query',
        config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders', maxRows: 999, outputVariable: 'q' },
      },
      echoRowCount,
    );

    expect(result.success).toBe(true);
    // The driver returned 10; the connection's ceiling of 2 is what reached the context.
    expect(urls).toEqual(['https://api.example.com/rows/2']);
  });

  it('leaves the step in charge when the connection sets no ceiling', async () => {
    // Pairs with the case above: without this, "the URL says 2" could be a constant.
    pgRowsToReturn = 10;
    connections.set('db-1', dbConn());
    const urls = stubFetch();

    const result = await run(
      {
        type: 'database_query',
        config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders', maxRows: 4, outputVariable: 'q' },
      },
      echoRowCount,
    );

    expect(result.success).toBe(true);
    expect(urls).toEqual(['https://api.example.com/rows/4']);
  });
});

// ── Database: TLS ──────────────────────────────────────────────────────────

describe('database_query honours sslVerifyCert', () => {
  it('verifies the certificate when the operator left the box ticked', async () => {
    connections.set('db-1', dbConn({
      config: { ...dbConn().config, ssl: true, sslVerifyCert: true },
    }));

    const result = await run({
      type: 'database_query',
      config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders' },
    });

    expect(result.success).toBe(true);
    expect(pgClientOptions[0]?.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('verifies when sslVerifyCert is absent — the checkbox defaults to ticked', async () => {
    connections.set('db-1', dbConn({ config: { ...dbConn().config, ssl: true } }));

    await run({ type: 'database_query', config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders' } });

    expect(pgClientOptions[0]?.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('stops verifying only when the operator explicitly unticked it', async () => {
    // Paired with the cases above so the assertion cannot be satisfied by the option
    // simply being absent or constant.
    connections.set('db-1', dbConn({
      config: { ...dbConn().config, ssl: true, sslVerifyCert: false },
    }));

    await run({ type: 'database_query', config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders' } });

    expect(pgClientOptions[0]?.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('passes no ssl option at all when the connection does not use TLS', async () => {
    connections.set('db-1', dbConn());

    await run({ type: 'database_query', config: { connectionId: 'db-1', queryTemplate: 'SELECT * FROM orders' } });

    expect(pgClientOptions[0]?.ssl).toBeUndefined();
  });
});

// ── The two step runners must not diverge ──────────────────────────────────

describe('routes/workflows.ts enforces the same guards as workflow-executor.ts', () => {
  /**
   * The behavioural tests above drive the headless executor. Its near-duplicate in
   * routes/workflows.ts serves the interactive/guided run path with its own copy of the
   * api_call and database_query bodies — and a control enforced in only one of them is
   * bypassable by choosing the other trigger. Divergence between two copies of the same
   * step runner is precisely how the original checks ended up in a file nobody called,
   * so it is worth pinning explicitly rather than trusting review.
   */
  const readSrc = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
  const executor = readSrc('server/services/workflow-executor.ts');
  const routes = readSrc('server/routes/workflows.ts');

  const SHARED_GUARDS = [
    'assertEndpointAllowed(cfg, method, endpointPath)',
    'assertWithinRateLimit(conn.id, cfg)',
    'assertQueryPermitted(conn.permissions, query)',
    'assertTablesAllowed(cfg, query)',
    'resolveMaxRows(cfg, step.config.maxRows)',
    'tlsOptionFor(cfg)',
    'mssqlTlsOptions(cfg)',
  ];

  const count = (src: string, needle: string) => src.split(needle).length - 1;

  for (const call of SHARED_GUARDS) {
    it(`both runners call ${call.split('(')[0]} the same number of times`, () => {
      // Counted, not merely present. `tlsOptionFor(cfg)` appears twice per file (the
      // postgres client and the mysql one); a presence check passes while one of the two
      // is reverted to the hardcoded downgrade — verified, that exact revert left this
      // assertion green until it was made count-based.
      const inExecutor = count(executor, call);
      const inRoutes = count(routes, call);
      expect(inExecutor, `${call} missing from workflow-executor.ts`).toBeGreaterThan(0);
      expect(inRoutes, `${call} count differs between the two step runners`).toBe(inExecutor);
    });
  }

  it('neither runner still hardcodes the TLS downgrade', () => {
    // Written as a regex over code shape so a prose mention of the old value in a
    // comment cannot satisfy — or break — the assertion.
    const hardcoded = /ssl:\s*cfg\.ssl\s*\?\s*\{\s*rejectUnauthorized:\s*false/;
    const trusted = /trustServerCertificate:\s*true/;
    expect(hardcoded.test(executor)).toBe(false);
    expect(hardcoded.test(routes)).toBe(false);
    expect(trusted.test(executor)).toBe(false);
    expect(trusted.test(routes)).toBe(false);
  });
});

// ── API: timeout ceiling ───────────────────────────────────────────────────

describe('both step runners route the API timeout through the connection ceiling', () => {
  /**
   * A source-level check, and labelled as one. The behaviour is a timer, and the
   * executor retries three times with 2s/4s/8s backoff on an abort, so observing it
   * costs ~14 seconds of real waiting for a control that bounds resource use rather
   * than a security boundary. What can regress cheaply is the wiring: the ceiling being
   * dropped back to the step's own value. resolveTimeoutMs itself is covered
   * behaviourally in connection-guard.test.ts.
   */
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

  for (const file of ['server/services/workflow-executor.ts', 'server/routes/workflows.ts']) {
    it(`${file} caps the step timeout at the connection's`, () => {
      const src = read(file);
      expect(src).toContain('resolveTimeoutMs(cfg, step.config.timeout_ms)');
      expect(src).not.toContain('step.config.timeout_ms || 30000');
    });
  }
});

// ── Filesystem: extension and size limits ──────────────────────────────────

describe('file_read honours the connection scope', () => {
  let dir: string;
  const prevAllowed = process.env.ALLOWED_FOLDER_PATHS;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'anton-fsguard-'));
    writeFileSync(join(dir, 'report.pdf'), 'pdf-body');
    writeFileSync(join(dir, 'notes.md'), 'md-body');
    // The file a '.pdf'-scoped connection had no business handing to a workflow.
    writeFileSync(join(dir, '.env'), 'ANTHROPIC_API_KEY=sk-ant-leaked');
    writeFileSync(join(dir, 'big.md'), 'x'.repeat(4096));
    delete process.env.ALLOWED_FOLDER_PATHS;   // a different control; not under test here
  });

  afterEach(() => {
    if (prevAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
    else process.env.ALLOWED_FOLDER_PATHS = prevAllowed;
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * How many files the step actually read, observed through the next step's URL —
   * file_read's output, like every step output, only exists in the run context.
   */
  async function fileCount(config: Record<string, unknown>): Promise<string[]> {
    connections.set('fs-1', {
      id: 'fs-1', display_name: 'Docs', type: 'filesystem', permissions: ['read'], status: 'active',
      config: { base_path: dir, ...config },
    });
    connections.set('api-echo', {
      id: 'api-echo', display_name: 'Echo', type: 'api', permissions: [], status: 'active',
      config: { base_url: 'https://api.example.com' },
    });
    const urls = stubFetch();
    const result = await run(
      { type: 'file_read', config: { connectionId: 'fs-1', outputVariable: 'f' } },
      { type: 'api_call', config: { connectionId: 'api-echo', method: 'GET', endpointPath: '/n/{{f.count}}' } },
    );
    expect(result.success).toBe(true);
    return urls;
  }

  it('reads only the allowed extensions — the .env sitting alongside is not handed over', async () => {
    // Four files on disk; exactly one is a .pdf.
    expect(await fileCount({ allowed_extensions: ['.pdf'] })).toEqual(['https://api.example.com/n/1']);
  });

  it('reads everything when no extensions are configured', async () => {
    // Pairs with the case above, so the 1 is demonstrably filtering rather than constant.
    expect(await fileCount({})).toEqual(['https://api.example.com/n/4']);
  });

  it('applies max_file_size_mb, skipping files above the connection limit', async () => {
    // A one-byte ceiling: every fixture is larger, so nothing survives.
    expect(await fileCount({ max_file_size_mb: 1 / (1024 * 1024) })).toEqual(['https://api.example.com/n/0']);
  });
});
