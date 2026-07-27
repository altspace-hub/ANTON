/**
 * coding-scripts-ownership.test.ts — attribution on write, scoping on read.
 *
 * coding-scripts.ts was the last route group creating `sessions` rows with no `user_id`
 * at all, and reading them back by id alone. On a `DEPLOYMENT_MODE=team` install that
 * meant every user's generated scripts and application source were listed to, readable
 * by, and OVERWRITABLE by every other user — `/:id/save` fetched by id and then wrote.
 *
 * It also undercut ownership.ts elsewhere: that helper leaves solo mode unscoped
 * precisely BECAUSE unattributed rows existed here. Fixing the writes is what makes the
 * scoping meaningful rather than a permanent carve-out.
 *
 * These assert on the SQL the handlers build rather than over HTTP, because the property
 * at risk is "is the owner predicate in the query" — an end-to-end test in solo mode
 * (where scoping correctly no-ops) would pass against completely unscoped SQL.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ownerFilter, type OwnedRequest } from '../../server/middleware/ownership.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROUTE = join(process.cwd(), 'server/routes/coding-scripts.ts');
const source = readFileSync(ROUTE, 'utf8');

const ALICE: OwnedRequest = { user: { id: 'alice', role: 'analyst' } };

let original: string | undefined;
beforeEach(() => { original = process.env.DEPLOYMENT_MODE; });
afterEach(() => {
  if (original === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = original;
});

describe('sessions are attributed on write', () => {
  it('both generation endpoints insert a user_id', () => {
    const inserts = source.match(/INSERT INTO sessions \(([^)]*)\)/g) ?? [];
    expect(inserts.length).toBe(2);                       // script-lite + script-medium
    for (const stmt of inserts) {
      expect(stmt).toContain('user_id');
    }
  });

  it('passes the authenticated caller, not a hardcoded or absent owner', () => {
    const uses = source.match(/req\.user\?\.id \?\? null/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it('keeps placeholder count in step with the column list', () => {
    // An INSERT that gains a column but not a `?` fails at runtime, not at typecheck —
    // and only on the generation path, which no unit test otherwise exercises.
    for (const m of source.matchAll(/INSERT INTO sessions \(([^)]*)\)\s*VALUES \(([^)]*)\)/g)) {
      const columns = m[1].split(',').length;
      const placeholders = m[2].split(',').length;
      expect(placeholders).toBe(columns);
    }
  });
});

describe('every read path is owner-scoped', () => {
  it('leaves no unscoped session lookup behind', () => {
    // Each `SELECT ... FROM sessions` in this file must interpolate a scope fragment.
    const selects = [...source.matchAll(/SELECT [^`']*?FROM sessions[^`]*?(?=`)/g)].map((m) => m[0]);
    expect(selects.length).toBeGreaterThanOrEqual(8);     // 2 save + 2 get + files + history + iterate + convert
    for (const sql of selects) {
      expect(sql).toContain('${scope.sql}');
    }
  });

  it('spreads the scope params into every scoped query', () => {
    const scoped = (source.match(/\$\{scope\.sql\}/g) ?? []).length;
    const spread = (source.match(/\.\.\.scope\.params/g) ?? []).length;
    expect(spread).toBe(scoped);   // a fragment without its params throws at bind time
  });

  it('qualifies the column when the query aliases the table', () => {
    // The history query is `FROM sessions s`, so a bare `user_id = ?` would be ambiguous
    // or silently bind the wrong table once a join is added.
    expect(source).toContain("ownerFilter(req, 's.user_id')");
  });
});

describe('the scope fragment behaves as these handlers assume', () => {
  it('adds the predicate for a non-admin on a shared install', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const f = ownerFilter(ALICE, 'user_id');
    expect(f.sql).toBe(' AND user_id = ?');
    expect(f.params).toEqual(['alice']);
  });

  it('stays empty in solo mode, so a laptop keeps its pre-attribution history', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const f = ownerFilter(ALICE, 'user_id');
    expect(f.sql).toBe('');
    expect(f.params).toEqual([]);
  });
});

describe('/api/pptx-pipeline is gone', () => {
  /**
   * The route round-tripped a CALLER-SUPPLIED Node script through an LLM instructed to
   * "keep the same structure", then spawned the result with `env: { ...process.env }` —
   * ANTHROPIC_API_KEY, DATABASE_URL, ENCRYPTION_KEY. It had no callers in any client.
   * Deleting beat hardening: nothing shipped used it.
   */
  it('has no route file', () => {
    expect(existsSync(join(process.cwd(), 'server/routes/pptx-pipeline.ts'))).toBe(false);
  });

  it('is neither imported nor mounted in the server entry point', () => {
    const index = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
    expect(index).not.toContain('pptx-pipeline');
    expect(index).not.toContain('createPptxPipelineRoutes');
  });

  it('leaves the legitimate template-driven script executor in place', () => {
    // market-computation-service runs vetted templates, not request bodies. Deleting the
    // route must not be read as "script execution is banned" and revert that too.
    const svc = readFileSync(join(process.cwd(), 'server/services/market-computation-service.ts'), 'utf8');
    expect(svc).toContain('executeScript');
  });
});
