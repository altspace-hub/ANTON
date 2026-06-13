/**
 * coding-studio-provisioner.ts — ANTON Studio Phase 3.
 *
 * On activation a Studio project gets write/exec to exactly
 * coding-studio/<project-slug>/ AND a SEPARATE Postgres database
 * (the user's LOCKED decision — a separate DATABASE, not schema-per-project;
 * a separate DB gives "cannot see anton/fc_* tables" for free) owned by a
 * least-privilege role:
 *
 *     CREATE ROLE studio_<slug> LOGIN PASSWORD '<random>' NOSUPERUSER ...;
 *     CREATE DATABASE proj_<slug> OWNER studio_<slug>;
 *     REVOKE CONNECT ON DATABASE anton FROM studio_<slug>;   -- belt + braces
 *
 * The grant IS the bind row (coding_projects.directory_path) + the scoped DSN
 * in the credential vault. DROP DATABASE + DROP ROLE on project delete.
 *
 * ── HONEST SECURITY NOTES (also surfaced in the route + report) ─────────────
 *   • The sandbox network is NOT blocked and this is execFile-in-a-local-
 *     process, NOT a container. cargo/pip/npm need network; a malicious
 *     build.rs / setup.py runs ARBITRARY CODE with the server user's
 *     privileges and network. A true jail needs Docker / Firejail / bwrap /
 *     a VM (P6, environment_mode='docker' is reserved for this).
 *   • There are NO CPU / memory / disk / process caps yet — only a wall-clock
 *     timeout + a 1 MB output cap (coding-workspace.ts TEST_RUN_LIMITS). A
 *     fork-bomb or a runaway target/ dir is unmitigated. FOLLOW-UP: a
 *     coding-studio/ disk-usage check + CARGO_TARGET_DIR cleanup.
 *   • The generated DB password is NEVER logged. It exists only in the
 *     CREATE ROLE DDL (run once) and the encrypted vault DSN.
 *
 * SQL note: CREATE DATABASE / DROP DATABASE CANNOT run inside a transaction
 * and cannot bind an identifier as a parameter. We therefore run the DDL on a
 * dedicated pooled client (PostgresAdapter.getPool()) with the role/db names
 * built from a STRICTLY-VALIDATED slug (never LLM text) and quoted as
 * identifiers + the password quoted as a string literal. If the connecting
 * role LACKS CREATEDB we return a CLEAR, actionable error — we do NOT silently
 * fall back to a schema or to the server DB.
 */

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { DatabaseAdapter } from '../db/database.js';
import { encrypt, decrypt } from './credential-vault.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('coding-studio-provisioner');

// ── Slug + identifier derivation (NEVER from LLM text) ──────────────────────

/**
 * Derive a stable, SQL-identifier-safe slug from the coding project id.
 * The project id is a server-minted UUID (randomUUID) — never LLM text — so
 * this is purely a normalisation, but we validate defensively anyway. We keep
 * only [a-z0-9] from a lowercased id and cap the length so the resulting
 * `proj_<slug>` / `studio_<slug>` stay well under Postgres's 63-byte
 * identifier limit.
 */
export function deriveProjectSlug(projectId: string): string {
  const cleaned = String(projectId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // A UUID without dashes is 32 hex chars; cap at 24 to leave room for prefixes.
  const slug = cleaned.slice(0, 24);
  if (slug.length < 8) {
    // Defensive: an id that normalises to <8 chars is not a UUID — refuse.
    throw new Error('cannot derive a safe project slug from the project id');
  }
  return slug;
}

/** proj_<slug> — the per-project database name. */
export function projectDbName(slug: string): string {
  return `proj_${slug}`;
}

/** studio_<slug> — the least-privilege owner role name. */
export function projectRoleName(slug: string): string {
  return `studio_${slug}`;
}

/**
 * Quote a Postgres IDENTIFIER (double-quote, escape embedded quotes). The slug
 * is already [a-z0-9]-only so this is belt-and-braces, but identifier quoting
 * is the correct discipline for DDL that cannot be parameterised.
 */
export function quoteIdent(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`refusing to use unsafe identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a Postgres string LITERAL (single-quote, escape embedded quotes). */
export function quoteLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** A fresh, high-entropy DB password. Hex (no shell/SQL metacharacters). */
export function generateDbPassword(): string {
  return randomBytes(24).toString('hex'); // 48 hex chars, 192 bits
}

// ── DDL builders (PURE — fully unit-testable, no DB, no secrets logged) ──────

export interface ProvisionDdl {
  /** CREATE ROLE … LOGIN PASSWORD … (the ONLY statement carrying the password). */
  createRole: string;
  /** CREATE DATABASE … OWNER … (must run outside a transaction). */
  createDatabase: string;
  /** Hardening statements run while connected to the SERVER db (anton). */
  hardenServerDb: string[];
}

/**
 * Build the provisioning DDL for a project. The role is created NOSUPERUSER
 * NOCREATEDB NOCREATEROLE NOINHERIT and owns its own fresh database; CONNECT
 * on the server (anton) database is revoked so the role cannot even open a
 * connection to ANTON's own tables. A separate database means it shares no
 * schema with anton/fc_* by construction — the locked-decision payoff.
 */
export function buildProvisionDdl(params: {
  roleName: string;
  dbName: string;
  password: string;
  /** The database name the ANTON server itself connects to (from DATABASE_URL). */
  serverDbName: string;
}): ProvisionDdl {
  const role = quoteIdent(params.roleName);
  const db = quoteIdent(params.dbName);
  const serverDb = quoteIdent(params.serverDbName);
  const pw = quoteLiteral(params.password);

  return {
    createRole:
      `CREATE ROLE ${role} LOGIN PASSWORD ${pw} ` +
      `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`,
    createDatabase: `CREATE DATABASE ${db} OWNER ${role}`,
    hardenServerDb: [
      // Cannot connect to ANTON's own DB at all (defence in depth — the role
      // also has no grants there, but an explicit REVOKE is unambiguous).
      `REVOKE CONNECT ON DATABASE ${serverDb} FROM ${role}`,
      // Do not inherit PUBLIC's implicit CONNECT either.
      `REVOKE ALL ON DATABASE ${serverDb} FROM ${role}`,
    ],
  };
}

/** Build the teardown DDL (drop the DB first — a role owning a DB can't be dropped). */
export function buildTeardownDdl(params: { roleName: string; dbName: string }): {
  dropDatabase: string;
  dropRole: string;
} {
  const role = quoteIdent(params.roleName);
  const db = quoteIdent(params.dbName);
  return {
    // WITH (FORCE) terminates other sessions (PG 13+) so a leftover connection
    // doesn't block teardown. Both use IF EXISTS so delete is idempotent.
    dropDatabase: `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`,
    dropRole: `DROP ROLE IF EXISTS ${role}`,
  };
}

/**
 * Build the scoped DSN that points at proj_<slug> AS studio_<slug>. Derived
 * from the SERVER DSN (host/port) with the user/password/database swapped. The
 * password is URL-encoded. This value is stored ENCRYPTED in the vault and is
 * the ONLY secret deliberately injected into a run env (as PROJECT_DATABASE_URL).
 */
export function buildScopedDsn(params: {
  serverDsn: string;
  roleName: string;
  dbName: string;
  password: string;
}): string {
  const u = new URL(params.serverDsn);
  u.username = encodeURIComponent(params.roleName);
  u.password = encodeURIComponent(params.password);
  u.pathname = `/${params.dbName}`;
  return u.toString();
}

/** The database name the server itself uses, parsed from its DSN. */
export function serverDbNameFromDsn(serverDsn: string): string {
  const u = new URL(serverDsn);
  const name = u.pathname.replace(/^\//, '');
  if (!name) throw new Error('DATABASE_URL has no database name in its path');
  return name;
}

// ── CREATEDB capability probe ───────────────────────────────────────────────

export interface CreatedbCapability {
  ok: boolean;
  /** rolcreatedb || rolsuper — either lets us CREATE DATABASE. */
  canCreateDb: boolean;
  canCreateRole: boolean;
  role: string;
}

/**
 * Whether the role the ANTON server connects as can CREATE DATABASE + CREATE
 * ROLE. Pure check against pg_roles for the current_user. Surfaced to the
 * route so a no-CREATEDB cluster gets a CLEAR, actionable error instead of a
 * silent fallback.
 */
export async function probeCreatedbCapability(db: DatabaseAdapter): Promise<CreatedbCapability> {
  const row = await db.get<{ rolname: string; rolcreatedb: boolean; rolcreaterole: boolean; rolsuper: boolean }>(
    `SELECT rolname, rolcreatedb, rolcreaterole, rolsuper
       FROM pg_roles WHERE rolname = current_user`,
  );
  const canCreateDb = !!(row?.rolcreatedb || row?.rolsuper);
  const canCreateRole = !!(row?.rolcreaterole || row?.rolsuper);
  return { ok: canCreateDb && canCreateRole, canCreateDb, canCreateRole, role: row?.rolname ?? 'unknown' };
}

export const CREATEDB_HINT =
  'The ANTON Postgres role lacks CREATEDB/CREATEROLE, so a per-project database cannot be provisioned. ' +
  'Grant it (ALTER ROLE anton CREATEDB CREATEROLE;) as a superuser, or point ANTON at a provisioning role ' +
  'that has them. ANTON will NOT silently fall back to a shared schema — the per-project database is the ' +
  'isolation boundary you asked for.';

// ── Vault storage of the scoped DSN ─────────────────────────────────────────
//
// We reuse the AES-256-GCM encrypt()/decrypt() primitives. The DSN lives in a
// dedicated table (migration 238) keyed by coding_project_id so it is trivially
// dropped with the project; the encrypted blob NEVER reaches an LLM prompt, an
// API response, or a log line.

export interface StudioProvisionRecord {
  coding_project_id: string;
  db_name: string;
  role_name: string;
  /** decrypted only inside the run-env builder; never returned to API/LLM. */
  scoped_dsn: string | null;
  provisioned_at: string | null;
}

/** Store (or replace) the encrypted scoped DSN for a project. */
export async function storeScopedDsn(
  db: DatabaseAdapter,
  params: { codingProjectId: string; dbName: string; roleName: string; scopedDsn: string },
): Promise<void> {
  const enc = encrypt(params.scopedDsn);
  await db.run(
    `INSERT INTO coding_studio_databases
       (coding_project_id, db_name, role_name, scoped_dsn_encrypted, provisioned_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT (coding_project_id) DO UPDATE SET
       db_name = excluded.db_name,
       role_name = excluded.role_name,
       scoped_dsn_encrypted = excluded.scoped_dsn_encrypted,
       provisioned_at = NOW()`,
    params.codingProjectId, params.dbName, params.roleName, enc,
  );
}

/** Metadata only (no secret) — safe for API responses. */
export async function getProvisionMeta(
  db: DatabaseAdapter,
  codingProjectId: string,
): Promise<Omit<StudioProvisionRecord, 'scoped_dsn'> | null> {
  const row = await db.get<{ coding_project_id: string; db_name: string; role_name: string; provisioned_at: string | null }>(
    `SELECT coding_project_id, db_name, role_name, provisioned_at
       FROM coding_studio_databases WHERE coding_project_id = ?`,
    codingProjectId,
  );
  if (!row) return null;
  return { coding_project_id: row.coding_project_id, db_name: row.db_name, role_name: row.role_name, provisioned_at: row.provisioned_at };
}

/**
 * INTERNAL: resolve the decrypted scoped DSN for a project. Used ONLY by the
 * run-env builder to inject PROJECT_DATABASE_URL. Never logged, never returned
 * to API consumers.
 */
export async function resolveScopedDsn(db: DatabaseAdapter, codingProjectId: string): Promise<string | null> {
  const row = await db.get<{ scoped_dsn_encrypted: string }>(
    `SELECT scoped_dsn_encrypted FROM coding_studio_databases WHERE coding_project_id = ?`,
    codingProjectId,
  );
  if (!row?.scoped_dsn_encrypted) return null;
  return decrypt(row.scoped_dsn_encrypted);
}

/** Remove the vault row (called inside the delete path after DROP DATABASE). */
export async function deleteProvisionRecord(db: DatabaseAdapter, codingProjectId: string): Promise<void> {
  await db.run(`DELETE FROM coding_studio_databases WHERE coding_project_id = ?`, codingProjectId);
}

// ── DDL execution on a dedicated client (CREATE DATABASE ⇒ no transaction) ───

/**
 * A minimal "raw SQL on one pooled client" shape. PostgresAdapter exposes
 * getPool(); we accept either the adapter (and pull the pool) or an injected
 * runner so tests can mock the DDL entirely (no real database).
 */
export interface RawDdlRunner {
  /** Run a single DDL statement (no params — identifiers are pre-quoted). */
  exec(sql: string): Promise<void>;
}

/** Build a RawDdlRunner from a PostgresAdapter's pool (one statement = one query). */
export function ddlRunnerFromAdapter(db: DatabaseAdapter): RawDdlRunner {
  const maybePool = (db as unknown as { getPool?: () => pg.Pool }).getPool;
  if (typeof maybePool !== 'function') {
    throw new Error('per-project database provisioning requires the PostgreSQL adapter');
  }
  const pool = maybePool.call(db);
  return {
    async exec(sql: string): Promise<void> {
      // Raw query: NO placeholder conversion, NO translation — the DDL is built
      // from validated identifiers + a quoted literal, exactly as Postgres needs.
      await pool.query(sql);
    },
  };
}

export interface ProvisionResult {
  dbName: string;
  roleName: string;
  /** the scoped DSN — caller stores it encrypted; NEVER logged. */
  scopedDsn: string;
}

/**
 * Run the full provisioning DDL (role → database → harden). CREATE DATABASE
 * runs OUTSIDE any transaction (each exec is its own statement). On a partial
 * failure we attempt best-effort cleanup of the role so a retry is clean.
 * The password is generated here and only ever appears in the createRole DDL +
 * the returned (to-be-encrypted) DSN — never in a log.
 */
export async function provisionProjectDatabase(params: {
  runner: RawDdlRunner;
  serverDsn: string;
  slug: string;
}): Promise<ProvisionResult> {
  const dbName = projectDbName(params.slug);
  const roleName = projectRoleName(params.slug);
  const password = generateDbPassword();
  const serverDbName = serverDbNameFromDsn(params.serverDsn);

  const ddl = buildProvisionDdl({ roleName, dbName, password, serverDbName });

  // 1. role (carries the password — run first; idempotent-ish via cleanup below)
  try {
    await params.runner.exec(ddl.createRole);
  } catch (err) {
    // If the role already exists from a half-finished prior run, drop + recreate.
    log.warn({ roleName }, 'create_role_failed_retrying_after_drop');
    await params.runner.exec(buildTeardownDdl({ roleName, dbName }).dropRole).catch(() => { /* best-effort */ });
    await params.runner.exec(ddl.createRole);
  }

  // 2. database (CANNOT be inside a transaction — its own statement)
  try {
    await params.runner.exec(ddl.createDatabase);
  } catch (err) {
    // Roll back the role we just created so the operation is atomic-ish.
    await params.runner.exec(buildTeardownDdl({ roleName, dbName }).dropRole).catch(() => { /* best-effort */ });
    throw err;
  }

  // 3. harden the server DB against the new role
  for (const stmt of ddl.hardenServerDb) {
    await params.runner.exec(stmt);
  }

  const scopedDsn = buildScopedDsn({ serverDsn: params.serverDsn, roleName, dbName, password });
  log.info({ dbName, roleName }, 'studio_database_provisioned'); // NB: no password, no DSN
  return { dbName, roleName, scopedDsn };
}

/** Tear down a project's database + role (idempotent — IF EXISTS). */
export async function teardownProjectDatabase(params: {
  runner: RawDdlRunner;
  dbName: string;
  roleName: string;
}): Promise<void> {
  const ddl = buildTeardownDdl({ dbName: params.dbName, roleName: params.roleName });
  // DB first (a role owning a DB cannot be dropped), then the role.
  await params.runner.exec(ddl.dropDatabase);
  await params.runner.exec(ddl.dropRole);
  log.info({ dbName: params.dbName, roleName: params.roleName }, 'studio_database_torn_down');
}
