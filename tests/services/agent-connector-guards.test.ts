/**
 * agent-connector-guards.test.ts — the connector executor's authorization guards.
 *
 * The tool call reaching executeCall() is parsed out of the MODEL'S FREE TEXT,
 * and that text is influenced by whatever the agent read — an inbound
 * /agents/public/query message, a delegated peer task, a fetched document. So
 * every field of a tool call is attacker-controlled input. These guards are what
 * reconcile it against the surface the OPERATOR actually declared.
 *
 * Before them: config.endpoints was advisory (rendered into the prompt, never
 * checked), so a connector advertising `GET /contacts` would dispatch
 * `DELETE /v2/contacts/all` with the operator's Bearer token; and the SQL branch
 * ran model-authored text unparameterised on ANTON's own database, where pg's
 * simple protocol executes multiple statements per round trip.
 */
import { describe, it, expect } from 'vitest';
import {
  matchesDeclaredEndpoint, guardLocalSelect, referencedTables,
  type DeclaredEndpoint,
} from '../../server/services/agent-connector-executor.js';

// ── REST: the declared surface is the whole surface ─────────────────────

const ENDPOINTS: DeclaredEndpoint[] = [
  { method: 'GET', path: '/contacts' },
  { method: 'GET', path: '/contacts/:id' },
  { method: 'POST', path: '/orders' },
];

describe('matchesDeclaredEndpoint', () => {
  it('allows exactly what the operator declared', () => {
    expect(matchesDeclaredEndpoint('GET', '/contacts', ENDPOINTS)).toBe(true);
    expect(matchesDeclaredEndpoint('GET', '/contacts/42', ENDPOINTS)).toBe(true);
    expect(matchesDeclaredEndpoint('POST', '/orders', ENDPOINTS)).toBe(true);
  });

  it('rejects a verb that was never declared for that path', () => {
    // The headline case: a read-only CRM connector asked to DELETE.
    expect(matchesDeclaredEndpoint('DELETE', '/contacts', ENDPOINTS)).toBe(false);
    expect(matchesDeclaredEndpoint('PUT', '/contacts/42', ENDPOINTS)).toBe(false);
    expect(matchesDeclaredEndpoint('POST', '/contacts', ENDPOINTS)).toBe(false);
  });

  it('rejects an undeclared path', () => {
    expect(matchesDeclaredEndpoint('GET', '/admin/users', ENDPOINTS)).toBe(false);
    expect(matchesDeclaredEndpoint('GET', '/v2/contacts/all', ENDPOINTS)).toBe(false);
  });

  it('is not a prefix match — declaring /contacts must not expose /contacts/x/y', () => {
    expect(matchesDeclaredEndpoint('GET', '/contacts/42/secrets', ENDPOINTS)).toBe(false);
  });

  it('a :id segment matches one segment, not a path', () => {
    expect(matchesDeclaredEndpoint('GET', '/contacts/42', ENDPOINTS)).toBe(true);
    expect(matchesDeclaredEndpoint('GET', '/contacts/42/orders', ENDPOINTS)).toBe(false);
    expect(matchesDeclaredEndpoint('GET', '/contacts/', ENDPOINTS)).toBe(true);  // trailing slash == /contacts
  });

  it('supports {id} template syntax as well as :id', () => {
    const eps: DeclaredEndpoint[] = [{ method: 'GET', path: '/users/{id}' }];
    expect(matchesDeclaredEndpoint('GET', '/users/7', eps)).toBe(true);
    expect(matchesDeclaredEndpoint('GET', '/users', eps)).toBe(false);
  });

  it('rejects traversal that would climb out once joined to base_url', () => {
    expect(matchesDeclaredEndpoint('GET', '/contacts/../admin/users', ENDPOINTS)).toBe(false);
    expect(matchesDeclaredEndpoint('GET', '/../etc/passwd', ENDPOINTS)).toBe(false);
  });

  it('does not let a query string smuggle a different path through', () => {
    expect(matchesDeclaredEndpoint('GET', '/admin?x=/contacts', ENDPOINTS)).toBe(false);
    // ...but a query string on a genuinely declared path is fine.
    expect(matchesDeclaredEndpoint('GET', '/contacts?limit=10', ENDPOINTS)).toBe(true);
  });

  it('FAILS CLOSED when the connector declares no endpoints', () => {
    expect(matchesDeclaredEndpoint('GET', '/anything', [])).toBe(false);
    expect(matchesDeclaredEndpoint('GET', '/anything', undefined as unknown as DeclaredEndpoint[])).toBe(false);
  });

  it('ignores malformed endpoint entries rather than treating them as wildcards', () => {
    const junk = [{ method: 'GET' }, { path: '/x' }, null] as unknown as DeclaredEndpoint[];
    expect(matchesDeclaredEndpoint('GET', '/x', junk)).toBe(false);
  });
});

// ── SQL: a single, table-bounded SELECT or nothing ──────────────────────

const TABLES = ['orders', 'customers'];

describe('guardLocalSelect', () => {
  it('allows a plain SELECT against a declared table', () => {
    expect(guardLocalSelect('SELECT id, total FROM orders WHERE id = 1', TABLES).ok).toBe(true);
  });

  it('allows a JOIN when every table is declared', () => {
    expect(guardLocalSelect('SELECT * FROM orders JOIN customers ON x', TABLES).ok).toBe(true);
  });

  it('rejects a JOIN that reaches an undeclared table', () => {
    // The old substring check passed this: "orders" appears, so it was allowed.
    const r = guardLocalSelect('SELECT * FROM user_sessions JOIN orders ON x', TABLES);
    expect(r.ok).toBe(false);
  });

  it('BLOCKS the multi-statement escalation that made this critical', () => {
    // pg runs db.all(sql) with no values, so it uses the SIMPLE protocol and
    // executes every statement in the string. The old blocklist matched only
    // `;\s*(DROP|DELETE|...)` — DO was absent, and a comment defeated the \s*.
    const attack = "SELECT 1;/**/DO $$BEGIN EXECUTE 'CREATE TABLE pwn AS SELECT * FROM user_sessions'; END$$;--orders";
    const r = guardLocalSelect(attack, TABLES);
    expect(r.ok).toBe(false);
  });

  it('rejects any statement separator, not just known-bad keywords', () => {
    for (const q of [
      'SELECT 1; DROP TABLE orders',
      'SELECT 1; GRANT ALL ON orders TO PUBLIC',
      'SELECT 1; COPY orders TO PROGRAM \'sh\'',
      'SELECT 1; CALL something()',
      'SELECT 1; SET ROLE postgres',
    ]) {
      expect(guardLocalSelect(q, TABLES).ok, q).toBe(false);
    }
  });

  it('the separator ban stands ALONE — a second statement over allowed tables only', () => {
    // Deliberately passes every OTHER guard: starts with SELECT, no comments,
    // and both tables are declared. Only the separator ban rejects it. Without
    // this case the ban is not independently pinned, because the other guards
    // happen to catch the more obvious payloads.
    const r = guardLocalSelect('SELECT * FROM orders; SELECT * FROM customers', TABLES);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/separator/i);
  });

  it('rejects comments, which were how the old allowlist was satisfied', () => {
    expect(guardLocalSelect('SELECT * FROM user_sessions --orders', TABLES).ok).toBe(false);
    expect(guardLocalSelect('SELECT * FROM user_sessions /*orders*/', TABLES).ok).toBe(false);
  });

  it('rejects non-SELECT statements outright', () => {
    for (const q of ['DELETE FROM orders', 'UPDATE orders SET x=1', 'DO $$BEGIN END$$', 'INSERT INTO orders VALUES (1)']) {
      expect(guardLocalSelect(q, TABLES).ok, q).toBe(false);
    }
  });

  it('FAILS CLOSED when the connector declares no tables', () => {
    // Previously an empty allowlist SKIPPED the check, so the agent could read
    // every table in ANTON's database — credentials, sessions, identities.
    const r = guardLocalSelect('SELECT * FROM user_sessions', []);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no readable tables/i);
  });

  it('rejects a SELECT that reads from nothing declared at all', () => {
    expect(guardLocalSelect('SELECT 1', TABLES).ok).toBe(false);
  });

  it('accepts a schema-qualified reference to a declared table', () => {
    expect(guardLocalSelect('SELECT * FROM public.orders', TABLES).ok).toBe(true);
  });

  it('allows a CTE that stays within declared tables', () => {
    expect(guardLocalSelect('WITH x AS (SELECT * FROM orders) SELECT * FROM x', TABLES).ok).toBe(true);
  });
});

describe('referencedTables', () => {
  it('extracts FROM and JOIN targets', () => {
    expect(referencedTables('SELECT * FROM a JOIN b ON 1 LEFT JOIN c ON 2').map(s => s.toLowerCase()))
      .toEqual(['a', 'b', 'c']);
  });

  it('is not fooled by a table name inside a string literal or comment', () => {
    expect(referencedTables("SELECT 'FROM orders' FROM secrets").map(s => s.toLowerCase()))
      .toEqual(['secrets']);
    expect(referencedTables('SELECT * FROM secrets --FROM orders').map(s => s.toLowerCase()))
      .toEqual(['secrets']);
  });
});

describe('CTE aliases are not laundering', () => {
  it('a CTE named after an allowed table cannot hide a read of a forbidden one', () => {
    // The CTE body is still scanned, so user_sessions surfaces and is rejected.
    const r = guardLocalSelect(
      'WITH orders AS (SELECT * FROM user_sessions) SELECT * FROM orders', TABLES);
    expect(r.ok).toBe(false);
  });

  it('handles RECURSIVE and multiple CTEs', () => {
    expect(guardLocalSelect(
      'WITH RECURSIVE a AS (SELECT * FROM orders), b AS (SELECT * FROM customers) SELECT * FROM a JOIN b ON 1',
      TABLES).ok).toBe(true);
    expect(guardLocalSelect(
      'WITH a AS (SELECT * FROM orders), b AS (SELECT * FROM user_sessions) SELECT * FROM a',
      TABLES).ok).toBe(false);
  });
});
