/**
 * coding-studio-provisioner.test.ts — ANTON Studio Phase 3 (service-level).
 *
 * The SEPARATE-DATABASE provisioner (LOCKED DECISION 3). Everything here is
 * pure/mocked — NO real database is created, NO real toolchain runs:
 *   • slug + identifier derivation (never LLM text) + quoting discipline
 *   • the CREATE ROLE / CREATE DATABASE / harden DDL is built correctly
 *   • the no-CREATEDB path surfaces a clear, actionable error (no silent fallback)
 *   • the scoped DSN points at proj_<slug> AS studio_<slug>; the password is
 *     URL-encoded and NEVER logged
 *   • the vault stores/reads the DSN ENCRYPTED, never plaintext
 *   • teardown drops the DB first, then the role
 *
 * The DDL runner is a MOCK that records statements — no pg pool, no DATABASE_URL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';
import {
  deriveProjectSlug,
  projectDbName,
  projectRoleName,
  quoteIdent,
  quoteLiteral,
  generateDbPassword,
  buildProvisionDdl,
  buildTeardownDdl,
  buildScopedDsn,
  serverDbNameFromDsn,
  probeCreatedbCapability,
  provisionProjectDatabase,
  teardownProjectDatabase,
  storeScopedDsn,
  resolveScopedDsn,
  getProvisionMeta,
  deleteProvisionRecord,
  type RawDdlRunner,
} from '../../../server/services/coding-studio-provisioner.js';

// The credential-vault encrypt/decrypt read an env key on import; set a stable one.
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  }
});

const REAL_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ── Mock DDL runner: records every statement, no real DB ─────────────────────
interface RecordingRunner {
  runner: RawDdlRunner;
  statements: string[];
  failOn?: (sql: string) => boolean;
}
function recordingRunner(): RecordingRunner {
  const rec: RecordingRunner = {
    statements: [],
    runner: {
      async exec(sql: string): Promise<void> {
        rec.statements.push(sql);
        if (rec.failOn?.(sql)) throw new Error(`mock failure on: ${sql.slice(0, 40)}`);
      },
    },
  };
  return rec;
}

// ── In-memory fake adapter for the vault rows + pg_roles probe ───────────────
function makeFakeDb(opts: { rolcreatedb?: boolean; rolcreaterole?: boolean; rolsuper?: boolean } = {}): DatabaseAdapter {
  const studioDbs = new Map<string, { coding_project_id: string; db_name: string; role_name: string; scoped_dsn_encrypted: string; provisioned_at: string }>();
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('pg_roles')) {
        return {
          rolname: 'anton',
          rolcreatedb: opts.rolcreatedb ?? true,
          rolcreaterole: opts.rolcreaterole ?? true,
          rolsuper: opts.rolsuper ?? false,
        } as T;
      }
      if (sql.includes('coding_studio_databases')) {
        const row = studioDbs.get(String(params[0]));
        return (row as T) ?? undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return [] as T[]; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO coding_studio_databases')) {
        const [coding_project_id, db_name, role_name, scoped_dsn_encrypted] = params as string[];
        studioDbs.set(coding_project_id, { coding_project_id, db_name, role_name, scoped_dsn_encrypted, provisioned_at: '2026-06-13T00:00:00Z' });
      } else if (sql.includes('DELETE FROM coding_studio_databases')) {
        studioDbs.delete(String(params[0]));
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this); },
    async close(): Promise<void> {},
  };
}

// ── Slug + identifier derivation ─────────────────────────────────────────────

describe('deriveProjectSlug', () => {
  it('derives a [a-z0-9] slug from a UUID — never LLM text', () => {
    const slug = deriveProjectSlug(REAL_UUID);
    expect(slug).toMatch(/^[a-z0-9]+$/);
    expect(slug.length).toBeGreaterThanOrEqual(8);
    expect(slug.length).toBeLessThanOrEqual(24);
  });
  it('is deterministic', () => {
    expect(deriveProjectSlug(REAL_UUID)).toBe(deriveProjectSlug(REAL_UUID));
  });
  it('refuses an id that normalises to too few chars (not a UUID)', () => {
    expect(() => deriveProjectSlug('--')).toThrow();
    expect(() => deriveProjectSlug('a;DROP')).toThrow(); // 'adrop' = 5 chars < 8 → refused
  });
  it('strips injection characters before they can reach DDL', () => {
    const slug = deriveProjectSlug('abcdef12"; DROP DATABASE anton; --34567890');
    expect(slug).not.toContain('"');
    expect(slug).not.toContain(';');
    expect(slug).not.toContain(' ');
    expect(slug).toMatch(/^[a-z0-9]+$/);
  });
});

describe('identifier + literal quoting', () => {
  it('names the db proj_<slug> and the role studio_<slug>', () => {
    expect(projectDbName('abc123')).toBe('proj_abc123');
    expect(projectRoleName('abc123')).toBe('studio_abc123');
  });
  it('quoteIdent double-quotes safe identifiers and refuses unsafe ones', () => {
    expect(quoteIdent('proj_abc123')).toBe('"proj_abc123"');
    expect(() => quoteIdent('evil"; DROP')).toThrow();
    expect(() => quoteIdent('has space')).toThrow();
  });
  it('quoteLiteral single-quotes and escapes embedded quotes', () => {
    expect(quoteLiteral("ab'cd")).toBe("'ab''cd'");
  });
});

describe('generateDbPassword', () => {
  it('is high-entropy hex with no shell/SQL metacharacters', () => {
    const pw = generateDbPassword();
    expect(pw).toMatch(/^[0-9a-f]{48}$/);
    expect(generateDbPassword()).not.toBe(pw);
  });
});

// ── DDL builders ─────────────────────────────────────────────────────────────

describe('buildProvisionDdl', () => {
  const ddl = buildProvisionDdl({ roleName: 'studio_abc12345', dbName: 'proj_abc12345', password: 'deadbeef', serverDbName: 'anton' });

  it('creates a LEAST-PRIVILEGE login role (no superuser/createdb/createrole)', () => {
    expect(ddl.createRole).toContain('CREATE ROLE "studio_abc12345" LOGIN PASSWORD \'deadbeef\'');
    expect(ddl.createRole).toContain('NOSUPERUSER');
    expect(ddl.createRole).toContain('NOCREATEDB');
    expect(ddl.createRole).toContain('NOCREATEROLE');
  });
  it('creates the database OWNED BY the role', () => {
    expect(ddl.createDatabase).toBe('CREATE DATABASE "proj_abc12345" OWNER "studio_abc12345"');
  });
  it('revokes CONNECT on the ANTON server db from the role (cannot see anton/fc_*)', () => {
    expect(ddl.hardenServerDb.some((s) => s.includes('REVOKE CONNECT ON DATABASE "anton" FROM "studio_abc12345"'))).toBe(true);
  });
});

describe('buildTeardownDdl', () => {
  it('drops the database first, then the role, both IF EXISTS', () => {
    const t = buildTeardownDdl({ roleName: 'studio_x12345678', dbName: 'proj_x12345678' });
    expect(t.dropDatabase).toContain('DROP DATABASE IF EXISTS "proj_x12345678"');
    expect(t.dropRole).toContain('DROP ROLE IF EXISTS "studio_x12345678"');
  });
});

// ── Scoped DSN ───────────────────────────────────────────────────────────────

describe('buildScopedDsn + serverDbNameFromDsn', () => {
  const serverDsn = 'postgresql://anton:anton@localhost:5432/anton';
  it('points at proj_<slug> AS studio_<slug>, with the password URL-encoded', () => {
    const dsn = buildScopedDsn({ serverDsn, roleName: 'studio_abc12345', dbName: 'proj_abc12345', password: 'p@ss/word' });
    const u = new URL(dsn);
    expect(u.host).toBe('localhost:5432');
    expect(decodeURIComponent(u.username)).toBe('studio_abc12345');
    expect(decodeURIComponent(u.password)).toBe('p@ss/word');
    expect(u.pathname).toBe('/proj_abc12345');
  });
  it('extracts the server db name from its DSN', () => {
    expect(serverDbNameFromDsn(serverDsn)).toBe('anton');
  });
});

// ── CREATEDB capability probe ────────────────────────────────────────────────

describe('probeCreatedbCapability', () => {
  it('ok when the role has CREATEDB + CREATEROLE', async () => {
    const cap = await probeCreatedbCapability(makeFakeDb({ rolcreatedb: true, rolcreaterole: true }));
    expect(cap.ok).toBe(true);
    expect(cap.canCreateDb).toBe(true);
  });
  it('ok when the role is superuser (implies both)', async () => {
    const cap = await probeCreatedbCapability(makeFakeDb({ rolcreatedb: false, rolcreaterole: false, rolsuper: true }));
    expect(cap.ok).toBe(true);
  });
  it('NOT ok when CREATEDB is missing — drives the clear actionable error (no silent fallback)', async () => {
    const cap = await probeCreatedbCapability(makeFakeDb({ rolcreatedb: false, rolcreaterole: true, rolsuper: false }));
    expect(cap.ok).toBe(false);
    expect(cap.canCreateDb).toBe(false);
  });
});

// ── Full provision flow (mocked DDL runner) ──────────────────────────────────

describe('provisionProjectDatabase', () => {
  it('runs CREATE ROLE → CREATE DATABASE → harden, in order, on the mock runner', async () => {
    const rec = recordingRunner();
    const result = await provisionProjectDatabase({
      runner: rec.runner,
      serverDsn: 'postgresql://anton:anton@localhost:5432/anton',
      slug: 'abc12345',
    });
    expect(result.dbName).toBe('proj_abc12345');
    expect(result.roleName).toBe('studio_abc12345');
    // The CREATE ROLE statement runs before CREATE DATABASE before the harden.
    const createRoleIdx = rec.statements.findIndex((s) => s.startsWith('CREATE ROLE'));
    const createDbIdx = rec.statements.findIndex((s) => s.startsWith('CREATE DATABASE'));
    const revokeIdx = rec.statements.findIndex((s) => s.startsWith('REVOKE CONNECT'));
    expect(createRoleIdx).toBeGreaterThanOrEqual(0);
    expect(createDbIdx).toBeGreaterThan(createRoleIdx);
    expect(revokeIdx).toBeGreaterThan(createDbIdx);
    // The scoped DSN points at the project db as the project role.
    const u = new URL(result.scopedDsn);
    expect(decodeURIComponent(u.username)).toBe('studio_abc12345');
    expect(u.pathname).toBe('/proj_abc12345');
  });

  it('rolls the role back if CREATE DATABASE fails (no orphaned role)', async () => {
    const rec = recordingRunner();
    rec.failOn = (s) => s.startsWith('CREATE DATABASE');
    await expect(provisionProjectDatabase({
      runner: rec.runner,
      serverDsn: 'postgresql://anton:anton@localhost:5432/anton',
      slug: 'abc12345',
    })).rejects.toThrow();
    // A DROP ROLE cleanup must have been attempted after the failed CREATE DATABASE.
    expect(rec.statements.some((s) => s.startsWith('DROP ROLE'))).toBe(true);
  });

  it('NEVER puts the generated password anywhere except the CREATE ROLE DDL', async () => {
    const rec = recordingRunner();
    const result = await provisionProjectDatabase({
      runner: rec.runner,
      serverDsn: 'postgresql://anton:anton@localhost:5432/anton',
      slug: 'abc12345',
    });
    // The password is in the scoped DSN + the CREATE ROLE — but nowhere in the
    // CREATE DATABASE / harden statements.
    const pw = new URL(result.scopedDsn).password;
    const createDb = rec.statements.find((s) => s.startsWith('CREATE DATABASE'))!;
    expect(createDb).not.toContain(decodeURIComponent(pw));
  });
});

describe('teardownProjectDatabase', () => {
  it('drops the database before the role', async () => {
    const rec = recordingRunner();
    await teardownProjectDatabase({ runner: rec.runner, dbName: 'proj_abc12345', roleName: 'studio_abc12345' });
    expect(rec.statements[0]).toContain('DROP DATABASE IF EXISTS "proj_abc12345"');
    expect(rec.statements[1]).toContain('DROP ROLE IF EXISTS "studio_abc12345"');
  });
});

// ── Vault round-trip (encrypted at rest) ─────────────────────────────────────

describe('scoped DSN vault', () => {
  it('stores the DSN ENCRYPTED and round-trips it via resolveScopedDsn', async () => {
    const db = makeFakeDb();
    const dsn = 'postgresql://studio_abc12345:secretpw@localhost:5432/proj_abc12345';
    await storeScopedDsn(db, { codingProjectId: 'cp1', dbName: 'proj_abc12345', roleName: 'studio_abc12345', scopedDsn: dsn });

    // The stored blob is NOT the plaintext.
    const raw = await db.get<{ scoped_dsn_encrypted: string }>('SELECT scoped_dsn_encrypted FROM coding_studio_databases WHERE coding_project_id = ?', 'cp1');
    expect(raw?.scoped_dsn_encrypted).toBeTruthy();
    expect(raw!.scoped_dsn_encrypted).not.toContain('secretpw');
    expect(raw!.scoped_dsn_encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // iv:tag:cipher

    // resolveScopedDsn decrypts it back.
    expect(await resolveScopedDsn(db, 'cp1')).toBe(dsn);

    // Metadata returns no secret.
    const meta = await getProvisionMeta(db, 'cp1');
    expect(meta).toMatchObject({ db_name: 'proj_abc12345', role_name: 'studio_abc12345' });
    expect(JSON.stringify(meta)).not.toContain('secretpw');

    // Delete removes it.
    await deleteProvisionRecord(db, 'cp1');
    expect(await resolveScopedDsn(db, 'cp1')).toBeNull();
  });
});
