/**
 * connection-guard.test.ts — the per-connection guardrails as pure functions.
 *
 * These checks lived in server/connections/{api,database}-adapter.ts, which nothing
 * imported. The companion file connection-guardrails-live.test.ts proves they now run
 * inside the workflow executor; this file pins their semantics, and in particular the
 * unset-means-unrestricted / set-means-enforced split that lets enforcement be switched
 * on without breaking an installation that configured nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  assertEndpointAllowed,
  assertWithinRateLimit,
  assertQueryPermitted,
  assertTablesAllowed,
  resolveMaxRows,
  resolveTimeoutMs,
  tlsOptionFor,
  mssqlTlsOptions,
  shouldVerifyCert,
  isFileReadable,
  resetRateLimits,
  stripSqlNoise,
  ConnectionGuardError,
} from '../../server/services/connection-guard.js';

describe('endpoint allowlist', () => {
  const cfg = { allowed_endpoints: [{ method: 'GET', path: '/reports' }, { method: 'POST', path: '/ingest/*' }] };

  it('permits an exact method+path match', () => {
    expect(() => assertEndpointAllowed(cfg, 'GET', '/reports')).not.toThrow();
  });

  it('permits a wildcard suffix match', () => {
    expect(() => assertEndpointAllowed(cfg, 'POST', '/ingest/daily')).not.toThrow();
  });

  it('refuses a path that is not listed', () => {
    expect(() => assertEndpointAllowed(cfg, 'GET', '/admin/users')).toThrow(ConnectionGuardError);
  });

  it('refuses the right path with the wrong method', () => {
    // The control is (method, path), not path alone — a GET-only allowlist must not
    // authorise a DELETE to the same URL.
    expect(() => assertEndpointAllowed(cfg, 'DELETE', '/reports')).toThrow(/not in this connection's allowed_endpoints/);
  });

  it('treats a "*" method as any verb', () => {
    expect(() => assertEndpointAllowed({ allowed_endpoints: [{ method: '*', path: '/x' }] }, 'PATCH', '/x')).not.toThrow();
  });

  it('does not restrict when no endpoints are configured', () => {
    // The status quo for every connection that never filled the box in. Enforcing
    // fail-closed here would have broken existing installs on upgrade.
    expect(() => assertEndpointAllowed({}, 'DELETE', '/anything')).not.toThrow();
    expect(() => assertEndpointAllowed({ allowed_endpoints: [] }, 'DELETE', '/anything')).not.toThrow();
  });

  it('ignores malformed rules rather than trusting them as a match', () => {
    // A rule with no path must not become an accidental allow-all.
    expect(() => assertEndpointAllowed({ allowed_endpoints: [{ method: 'GET' }] }, 'GET', '/x')).not.toThrow();
    expect(() => assertEndpointAllowed(
      { allowed_endpoints: [{ method: 'GET' }, { method: 'GET', path: '/ok' }] }, 'GET', '/x',
    )).toThrow(ConnectionGuardError);
  });
});

describe('rate limit', () => {
  beforeEach(() => resetRateLimits());

  it('allows exactly `rate_limit` calls in a window and refuses the next', () => {
    const cfg = { rate_limit: 2 };
    const t = 1_000_000;
    expect(() => assertWithinRateLimit('c1', cfg, t)).not.toThrow();
    expect(() => assertWithinRateLimit('c1', cfg, t + 10)).not.toThrow();
    expect(() => assertWithinRateLimit('c1', cfg, t + 20)).toThrow(/Rate limit exceeded/);
  });

  it('starts a fresh window after 60s', () => {
    const cfg = { rate_limit: 1 };
    const t = 2_000_000;
    expect(() => assertWithinRateLimit('c2', cfg, t)).not.toThrow();
    expect(() => assertWithinRateLimit('c2', cfg, t + 1000)).toThrow();
    expect(() => assertWithinRateLimit('c2', cfg, t + 60_000)).not.toThrow();
  });

  it('counts per connection, not globally', () => {
    const cfg = { rate_limit: 1 };
    const t = 3_000_000;
    expect(() => assertWithinRateLimit('a', cfg, t)).not.toThrow();
    expect(() => assertWithinRateLimit('b', cfg, t)).not.toThrow();
  });

  it('is unlimited at 0 or unset', () => {
    const t = 4_000_000;
    for (let i = 0; i < 50; i++) {
      expect(() => assertWithinRateLimit('c3', { rate_limit: 0 }, t + i)).not.toThrow();
      expect(() => assertWithinRateLimit('c4', {}, t + i)).not.toThrow();
    }
  });
});

describe('read-only SQL', () => {
  it('permits SELECT and WITH without any permission', () => {
    expect(() => assertQueryPermitted([], 'SELECT * FROM orders')).not.toThrow();
    expect(() => assertQueryPermitted([], 'WITH x AS (SELECT 1) SELECT * FROM x')).not.toThrow();
  });

  it('refuses DELETE / UPDATE / INSERT / DROP without the write permission', () => {
    for (const q of ['DELETE FROM orders', 'UPDATE orders SET a=1', 'INSERT INTO orders VALUES (1)', 'DROP TABLE orders']) {
      expect(() => assertQueryPermitted([], q), q).toThrow(/Only SELECT queries are permitted/);
    }
  });

  it('permits them once the connection carries "write"', () => {
    expect(() => assertQueryPermitted(['read', 'write'], 'DELETE FROM orders')).not.toThrow();
  });

  it('refuses a write hidden inside a CTE, which the leading keyword does not catch', () => {
    // The first version of this guard only looked at the first word, so every one of
    // these passed as "read-only". They are not hypothetical: PostgreSQL executes
    // data-modifying CTEs, and the first was run against this project's own database
    // during review — three rows in, zero rows out, from a query that begins WITH.
    for (const q of [
      'WITH gone AS (DELETE FROM secrets RETURNING *) SELECT * FROM gone',
      "WITH u AS (UPDATE users SET role='admin' RETURNING id) SELECT * FROM u",
      "WITH i AS (INSERT INTO users(name) VALUES ('x') RETURNING id) SELECT * FROM i",
      'WITH c AS (SELECT * FROM users) DELETE FROM c',            // the T-SQL spelling
      'WITH RECURSIVE r AS (SELECT 1) TRUNCATE audit_log',
    ]) {
      expect(() => assertQueryPermitted([], q), q).toThrow(/read-only/i);
    }
  });

  it('still permits a genuinely read-only CTE', () => {
    // Paired with the case above: a guard that refused every WITH would pass that test
    // and break the feature. These must keep working.
    expect(() => assertQueryPermitted([], 'WITH x AS (SELECT 1) SELECT * FROM x')).not.toThrow();
    expect(() => assertQueryPermitted([],
      'WITH RECURSIVE t AS (SELECT 1 n UNION ALL SELECT n+1 FROM t WHERE n < 5) SELECT * FROM t',
    )).not.toThrow();
  });

  it('does not mistake ordinary identifiers for write keywords', () => {
    // The scan runs over text with literals and quoted identifiers already removed, so
    // these are the cases that would otherwise produce false refusals.
    for (const q of [
      'SELECT delete_flag, updated_at FROM updates',
      "SELECT * FROM orders WHERE note = 'please delete this row'",
      'SELECT "update" FROM t',
      'SELECT * FROM inserted_records JOIN created_at_view ON true',
    ]) {
      expect(() => assertQueryPermitted([], q), q).not.toThrow();
    }
  });

  it('refuses SELECT ... FOR UPDATE, which takes row locks', () => {
    expect(() => assertQueryPermitted([], 'SELECT * FROM orders FOR UPDATE')).toThrow(/read-only/i);
    expect(() => assertQueryPermitted(['write'], 'SELECT * FROM orders FOR UPDATE')).not.toThrow();
  });

  it('refuses a second statement even for a write-enabled connection', () => {
    // db.query(text) with no values goes over the simple protocol, which runs every
    // statement in the string. The query is built by interpolating workflow context,
    // so the separator is the thing that turns injected data into a command.
    expect(() => assertQueryPermitted(['write'], 'SELECT 1; DROP TABLE users')).toThrow(/single statement/);
    expect(() => assertQueryPermitted([], 'SELECT 1; DROP TABLE users')).toThrow(/single statement/);
  });

  it('tolerates a trailing semicolon, which is idiomatic and harmless', () => {
    expect(() => assertQueryPermitted([], 'SELECT * FROM orders;')).not.toThrow();
    expect(() => assertQueryPermitted([], 'SELECT * FROM orders;  ')).not.toThrow();
  });

  it('is not fooled by a semicolon that only exists inside a literal', () => {
    expect(() => assertQueryPermitted([], "SELECT * FROM orders WHERE note = 'a;b'")).not.toThrow();
  });

  it('is not fooled by a statement hidden behind a comment', () => {
    expect(() => assertQueryPermitted([], 'SELECT 1 /* x */ ; DROP TABLE users')).toThrow(/single statement/);
  });

  it('refuses an empty query', () => {
    expect(() => assertQueryPermitted([], '   ')).toThrow(ConnectionGuardError);
  });
});

describe('stripSqlNoise', () => {
  it('removes literals and both comment styles', () => {
    expect(stripSqlNoise("SELECT 'a;b' -- ;drop\n, 1 /* ;also */")).not.toMatch(/drop|also/);
  });
});

describe('table allowlist', () => {
  const cfg = { allowed_tables: 'orders, customers' };

  it('permits a query confined to the listed tables', () => {
    expect(() => assertTablesAllowed(cfg, 'SELECT * FROM orders JOIN customers ON 1=1')).not.toThrow();
  });

  it('refuses a query that reaches a table outside the list', () => {
    expect(() => assertTablesAllowed(cfg, 'SELECT * FROM orders JOIN api_keys ON 1=1')).toThrow(/api_keys/);
  });

  it('refuses a table hidden inside a CTE body', () => {
    // A CTE name is a query-local alias, so `orders` here is not the real relation.
    expect(() => assertTablesAllowed(cfg, 'WITH orders AS (SELECT * FROM api_keys) SELECT * FROM orders'))
      .toThrow(/api_keys/);
  });

  it('is not satisfied by an allowed name appearing only in a comment', () => {
    expect(() => assertTablesAllowed(cfg, 'SELECT * FROM api_keys -- orders')).toThrow(/api_keys/);
  });

  it('accepts a schema-qualified name whose table part is allowed', () => {
    expect(() => assertTablesAllowed(cfg, 'SELECT * FROM public.orders')).not.toThrow();
  });

  it('accepts an array-valued allowlist as well as a comma string', () => {
    expect(() => assertTablesAllowed({ allowed_tables: ['orders'] }, 'SELECT * FROM orders')).not.toThrow();
  });

  it('does not restrict when blank', () => {
    expect(() => assertTablesAllowed({}, 'SELECT * FROM anything')).not.toThrow();
    expect(() => assertTablesAllowed({ allowed_tables: '' }, 'SELECT * FROM anything')).not.toThrow();
    expect(() => assertTablesAllowed({ allowed_tables: '  ,  ' }, 'SELECT * FROM anything')).not.toThrow();
  });

  it('refuses a query that reads no table at all when a list is configured', () => {
    expect(() => assertTablesAllowed(cfg, 'SELECT 1')).toThrow(ConnectionGuardError);
  });
});

describe('row and timeout ceilings', () => {
  it('caps the step maxRows at the connection maximum', () => {
    expect(resolveMaxRows({ max_rows_per_query: 5 }, 999)).toBe(5);
  });

  it('leaves a step request below the ceiling alone', () => {
    expect(resolveMaxRows({ max_rows_per_query: 5000 }, 100)).toBe(100);
  });

  it('is a ceiling, never a floor', () => {
    expect(resolveMaxRows({ max_rows_per_query: 10_000 }, 10)).toBe(10);
  });

  it('falls back to 1000 when neither is set', () => {
    expect(resolveMaxRows({}, undefined)).toBe(1000);
  });

  it('caps the step timeout at the connection timeout_seconds', () => {
    expect(resolveTimeoutMs({ timeout_seconds: 5 }, 30_000)).toBe(5_000);
    expect(resolveTimeoutMs({ timeout_seconds: 60 }, 30_000)).toBe(30_000);
    expect(resolveTimeoutMs({ timeout_seconds: 5 }, undefined)).toBe(5_000);
    expect(resolveTimeoutMs({}, undefined)).toBe(30_000);
  });
});

describe('TLS options', () => {
  it('verifies by default — the wizard checkbox ships ticked', () => {
    expect(shouldVerifyCert({})).toBe(true);
    expect(tlsOptionFor({ ssl: true })).toEqual({ rejectUnauthorized: true });
    expect(tlsOptionFor({ ssl: true, sslVerifyCert: true })).toEqual({ rejectUnauthorized: true });
  });

  it('stops verifying only on an explicit false', () => {
    expect(tlsOptionFor({ ssl: true, sslVerifyCert: false })).toEqual({ rejectUnauthorized: false });
  });

  it('returns undefined when the connection does not use TLS at all', () => {
    expect(tlsOptionFor({ ssl: false })).toBeUndefined();
    expect(tlsOptionFor({})).toBeUndefined();
  });

  it('inverts to trustServerCertificate for mssql', () => {
    expect(mssqlTlsOptions({ ssl: true })).toEqual({ encrypt: true, trustServerCertificate: false });
    expect(mssqlTlsOptions({ ssl: true, sslVerifyCert: false })).toEqual({ encrypt: true, trustServerCertificate: true });
  });
});

describe('filesystem limits', () => {
  it('permits only the configured extensions', () => {
    const cfg = { allowed_extensions: ['.pdf', '.md'] };
    expect(isFileReadable(cfg, 'report.pdf', 10)).toBe(true);
    expect(isFileReadable(cfg, 'notes.md', 10)).toBe(true);
    expect(isFileReadable(cfg, '.env', 10)).toBe(false);
    expect(isFileReadable(cfg, 'server.pem', 10)).toBe(false);
  });

  it('tolerates extensions written without the leading dot', () => {
    expect(isFileReadable({ allowed_extensions: ['pdf'] }, 'report.pdf', 10)).toBe(true);
  });

  it('permits every extension when none are configured', () => {
    expect(isFileReadable({}, 'anything.xyz', 10)).toBe(true);
  });

  it('honours max_file_size_mb, and keeps a 2 MB default when unset', () => {
    expect(isFileReadable({ max_file_size_mb: 1 }, 'a.txt', 2 * 1024 * 1024)).toBe(false);
    expect(isFileReadable({ max_file_size_mb: 1 }, 'a.txt', 512 * 1024)).toBe(true);
    expect(isFileReadable({}, 'a.txt', 3 * 1024 * 1024)).toBe(false);
    expect(isFileReadable({}, 'a.txt', 1024)).toBe(true);
  });
});
