/**
 * demo-retention.ts — expired demo accounts are deleted, with everything they
 * wrote (public showcase, 2026-09-25).
 *
 * A demo account (users.demo_expires_at, migration 289) lives
 * DEMO_ACCOUNT_TTL_DAYS. Once a day, in demo mode, every account past its
 * expiry is deleted together with its rows:
 *
 *   - its sessions, and with them (ON DELETE CASCADE) messages, run_artifacts
 *     and run_tool_calls, session_snapshots, output_versions and the other
 *     session children; before that, every row keyed by one of its sessions in
 *     any table with a session_id column (quality_scores, retrieval_feedback,
 *     audit_log, output_feedback, human_oversight_reviews, …);
 *   - its uploads: the files on disk and their file_uploads rows;
 *   - workflow_outputs it created, knowledge atoms it owns (their entity refs
 *     and embeddings first), the embeddings of its answers;
 *   - audit_events, security_events and login_attempts about it, its
 *     user_sessions, its profile, its module defaults;
 *   - then every row in any table, in any schema, whose user_id,
 *     owner_user_id, created_by, uploaded_by, decided_by or School
 *     student/teacher/guardian column names it (whatever DEMO_EXTRA_ROUTES or
 *     DEMO_ENABLED_PILLARS let it write); then whatever else a foreign key to
 *     users still holds (deleted, or the reference cleared when it is someone
 *     else's row); and finally the users row.
 *
 * The model-spend ledger keeps its rows — the day's instance total must not
 * drop — but loses the user and session ids. A custom module shared with the
 * community loses its author and stays.
 *
 * An administrator is never deleted, even one that began as a demo account.
 *
 * Also in demo mode: audit, login and security rows older than the TTL (they
 * carry visitors' IP addresses, including visitors who never signed up) and
 * export files older than the TTL are removed — not a deck the presentations
 * table still lists.
 *
 * Every statement stands alone. One that fails is logged by table and the
 * pass goes on; an account whose row cannot be deleted is switched off
 * (disabled_at) and tried again the next day, after the accounts no pass has
 * failed on. Logs carry counts, table and constraint names — never an id, a
 * username or an address.
 */
import path from 'node:path';
import fs from 'fs-extra';
import type { DatabaseAdapter } from '../db/database.js';
import { demoAccountTtlDays, isDemoMode } from '../middleware/demo-mode.js';

/** Columns that name a user as the owner or author of a row. The School ones too: DEMO_ENABLED_PILLARS=school writes them. */
export const USER_OWNER_COLUMNS = [
  'user_id', 'owner_user_id', 'created_by', 'uploaded_by', 'decided_by',
  'student_user_id', 'teacher_user_id', 'guardian_user_id',
] as const;

/** Tables the generic passes leave alone: the account itself, and the spend ledger (anonymised instead). */
const GENERIC_SKIP = new Set(['users', 'sessions', 'llm_spend_ledger']);
const skipGeneric = (schema: string, table: string): boolean => schema === 'public' && GENERIC_SKIP.has(table);

const SESSIONS_OF = 'SELECT id FROM sessions WHERE user_id = ?';
const ATOMS_OF = 'SELECT id FROM knowledge_atoms WHERE owner_user_id = ?';

/**
 * The fixed steps, in order. Params: the user id (every `?`). Exported so a
 * test can read them against the real schema.
 */
export const RETENTION_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
  { table: 'embeddings', sql: `DELETE FROM embeddings WHERE content_type = 'session_output' AND content_id IN (SELECT m.id FROM messages m WHERE m.session_id IN (${SESSIONS_OF}))` },
  { table: 'embeddings', sql: `DELETE FROM embeddings WHERE content_type = 'knowledge_atom' AND content_id IN (${ATOMS_OF})` },
  { table: 'knowledge_entity_refs', sql: `DELETE FROM knowledge_entity_refs WHERE atom_id IN (${ATOMS_OF})` },
  { table: 'retrieval_feedback', sql: `DELETE FROM retrieval_feedback WHERE atom_id IN (${ATOMS_OF})` },
  { table: 'knowledge_atoms', sql: 'DELETE FROM knowledge_atoms WHERE owner_user_id = ?' },
  { table: 'workflow_outputs', sql: 'DELETE FROM workflow_outputs WHERE created_by = ?' },
];

/** Run after the session-keyed pass and before the generic owner pass. Params: the user id. */
export const RETENTION_ACCOUNT_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
  { table: 'sessions', sql: 'DELETE FROM sessions WHERE user_id = ?' },
  { table: 'audit_events', sql: 'DELETE FROM audit_events WHERE user_id = ?' },
  { table: 'security_events', sql: 'DELETE FROM security_events WHERE user_id = ?' },
  { table: 'user_sessions', sql: 'DELETE FROM user_sessions WHERE user_id = ?' },
  { table: 'user_profiles', sql: 'DELETE FROM user_profiles WHERE id = ?' },
  { table: 'user_module_defaults', sql: 'DELETE FROM user_module_defaults WHERE user_id = ?' },
];

export interface RetentionResult {
  /** Expired demo accounts found this pass. */
  expired: number;
  /** Accounts deleted. */
  deleted: number;
  /** Accounts that could not be deleted (switched off; retried next pass). */
  failed: number;
  /** Upload files removed from disk. */
  filesRemoved: number;
  /** Rows removed per table, summed over the accounts. */
  rowsByTable: Record<string, number>;
  /** Tables where a statement failed, with the database's error code (and, for users, the constraint that held it). */
  errors: Array<{ table: string; code: string; constraint?: string }>;
}

export interface RetentionOptions {
  /** Accounts per pass. Default 200 — a backlog drains over several days. */
  limit?: number;
  /** Where uploads live. Default UPLOAD_DIR or ./uploads (as routes/files.ts). */
  uploadDir?: string;
  /** Where exports are written. Default OUTPUT_DIR or ./outputs (as routes/export.ts). */
  outputDir?: string;
  /** Also prune old audit/login rows and export files. Default true. */
  pruneTraces?: boolean;
  /** Reference time. Default now. */
  now?: Date;
}

interface TableColumns { table_schema: string; table_name: string; column_name: string; data_type: string }

/**
 * Base tables (no views, no partitions) with any of the given columns, of a
 * type that can hold an id — in every schema, not only public (the missions
 * pillar keeps its tables in `missions`).
 */
async function tablesWithColumns(db: DatabaseAdapter, columns: readonly string[]): Promise<TableColumns[]> {
  const placeholders = columns.map(() => '?').join(', ');
  return await db.all<TableColumns>(
    `SELECT c.table_schema, c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN pg_class k ON k.relname = c.table_name
       JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = c.table_schema
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') AND c.table_schema NOT LIKE 'pg\\_%'
        AND k.relkind IN ('r', 'p') AND NOT k.relispartition
        AND c.column_name IN (${placeholders})
        AND c.data_type IN ('text', 'character varying', 'uuid')
      ORDER BY c.table_schema, c.table_name, c.column_name`,
    ...columns,
  );
}

/** A column that references users(id) with a foreign key the users DELETE cannot get past (NO ACTION / RESTRICT). */
interface BlockingForeignKey { table_schema: string; table_name: string; column_name: string; nullable: boolean }

/**
 * Every such column, in any schema. The name list above cannot know them all:
 * a School row (student_growth_profiles.student_user_id) or a mission
 * (missions.missions.created_by) kept the users row from being deleted, and
 * the account was retried, and failed, every day (2026-09-25).
 */
async function blockingForeignKeys(db: DatabaseAdapter): Promise<BlockingForeignKey[]> {
  return await db.all<BlockingForeignKey>(
    `SELECT n.nspname AS table_schema, c.relname AS table_name, a.attname AS column_name, NOT a.attnotnull AS nullable
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.contype = 'f' AND k.confrelid = 'public.users'::regclass
        AND k.confdeltype IN ('a', 'r') AND array_length(k.conkey, 1) = 1
      ORDER BY n.nspname, c.relname, a.attname`,
  );
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;
const qualified = (schema: string, table: string): string => `${quoteIdent(schema)}.${quoteIdent(table)}`;
/** The table as the result and the logs name it: bare in public, schema.table elsewhere. */
const tableLabel = (schema: string, table: string): string => (schema === 'public' ? table : `${schema}.${table}`);

/** The column as text: a uuid column compared with a text id would throw instead of not matching. */
const columnText = (t: TableColumns): string =>
  t.data_type === 'uuid' ? `CAST(${quoteIdent(t.column_name)} AS text)` : quoteIdent(t.column_name);

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' ? code : 'error';
}

/** Deletes one expired demo account and its rows. True when the users row is gone. */
async function deleteDemoAccount(
  db: DatabaseAdapter,
  user: { id: string; username: string },
  ctx: {
    sessionTables: TableColumns[]; ownerTables: TableColumns[]; foreignKeys: BlockingForeignKey[];
    uploadDir: string; result: RetentionResult;
  },
): Promise<boolean> {
  const { result } = ctx;
  const count = (table: string, n: number) => {
    if (n > 0) result.rowsByTable[table] = (result.rowsByTable[table] ?? 0) + n;
  };
  const step = async (table: string, sql: string, ...params: unknown[]): Promise<boolean> => {
    try {
      const r = await db.run(sql, ...params);
      count(table, r.changes);
      return true;
    } catch (err) {
      result.errors.push({ table, code: errorCode(err) });
      return false;
    }
  };

  // Uploads: the file on disk, then its row. basename() keeps the path inside the directory.
  const uploads = await db.all<{ id: string }>('SELECT id FROM file_uploads WHERE uploaded_by = ?', user.id).catch(() => [] as Array<{ id: string }>);
  const root = path.resolve(ctx.uploadDir);
  for (const upload of uploads) {
    const file = path.join(root, path.basename(upload.id));
    try {
      if (await fs.pathExists(file)) {
        await fs.remove(file);
        result.filesRemoved++;
      }
    } catch {
      result.errors.push({ table: 'upload_file', code: 'unlink' });
    }
  }
  await step('file_uploads', 'DELETE FROM file_uploads WHERE uploaded_by = ?', user.id);

  for (const s of RETENTION_STEPS) {
    const params = (s.sql.match(/\?/g) ?? []).map(() => user.id);
    await step(s.table, s.sql, ...params);
  }

  // Every row keyed by one of the account's sessions, in any table.
  for (const t of ctx.sessionTables) {
    if (skipGeneric(t.table_schema, t.table_name)) continue;
    await step(tableLabel(t.table_schema, t.table_name), `DELETE FROM ${qualified(t.table_schema, t.table_name)} WHERE ${columnText(t)} IN (${SESSIONS_OF})`, user.id);
  }

  // The ledger keeps the spend, not the person.
  if (ctx.sessionTables.some((t) => t.table_name === 'llm_spend_ledger') || ctx.ownerTables.some((t) => t.table_name === 'llm_spend_ledger')) {
    await step('llm_spend_ledger', 'UPDATE llm_spend_ledger SET user_id = NULL, session_id = NULL WHERE user_id = ?', user.id);
  }

  await step('login_attempts', 'DELETE FROM login_attempts WHERE username = ?', user.username);
  for (const s of RETENTION_ACCOUNT_STEPS) await step(s.table, s.sql, user.id);

  // A custom module shared with the community is other visitors' too: it
  // loses its author instead of disappearing (migration 290 keeps it on
  // purpose; an unowned row is admin-managed).
  if (ctx.ownerTables.some((t) => t.table_schema === 'public' && t.table_name === 'custom_modules' && t.column_name === 'user_id')) {
    await step('custom_modules (shared, kept)', 'UPDATE custom_modules SET user_id = NULL WHERE user_id = ? AND is_shared_with_community = 1', user.id);
  }

  // Whatever else names the account as owner or author. Twice: a row that a
  // foreign key held the first time is usually free once its child is gone.
  const ownerSql = (t: TableColumns): string => `DELETE FROM ${qualified(t.table_schema, t.table_name)} WHERE ${columnText(t)} = ?`;
  const pending: TableColumns[] = [];
  for (const t of ctx.ownerTables) {
    if (skipGeneric(t.table_schema, t.table_name)) continue;
    try {
      count(tableLabel(t.table_schema, t.table_name), (await db.run(ownerSql(t), user.id)).changes);
    } catch {
      pending.push(t);
    }
  }
  for (const t of pending) {
    await step(tableLabel(t.table_schema, t.table_name), ownerSql(t), user.id);
  }

  // Every foreign key to users the DELETE below cannot get past, whatever
  // its column is called: an owner's row goes, a reference in someone else's
  // row (approved_by, scored_by) is cleared when it may be. Twice, as above.
  const fkSql = (fk: BlockingForeignKey): string => {
    const target = qualified(fk.table_schema, fk.table_name);
    const col = quoteIdent(fk.column_name);
    const owner = (USER_OWNER_COLUMNS as readonly string[]).includes(fk.column_name);
    return !owner && fk.nullable
      ? `UPDATE ${target} SET ${col} = NULL WHERE ${col} = ?`
      : `DELETE FROM ${target} WHERE ${col} = ?`;
  };
  const fkPending: BlockingForeignKey[] = [];
  for (const fk of ctx.foreignKeys) {
    if (skipGeneric(fk.table_schema, fk.table_name)) continue;
    try {
      count(tableLabel(fk.table_schema, fk.table_name), (await db.run(fkSql(fk), user.id)).changes);
    } catch {
      fkPending.push(fk);
    }
  }
  for (const fk of fkPending) {
    await step(tableLabel(fk.table_schema, fk.table_name), fkSql(fk), user.id);
  }

  try {
    // Only an account that is still an expired demo account: a row an admin
    // turned into an ordinary account meanwhile is left alone, and so is an
    // administrator (the query that found it says why).
    const r = await db.run(
      "DELETE FROM users WHERE id = ? AND demo_expires_at IS NOT NULL AND demo_expires_at <= NOW() AND role <> 'admin'",
      user.id,
    );
    count('users', r.changes);
    return r.changes > 0;
  } catch (err) {
    // The constraint names the table still holding the account (never an id).
    const constraint = (err as { constraint?: unknown })?.constraint;
    result.errors.push({ table: 'users', code: errorCode(err), ...(typeof constraint === 'string' ? { constraint } : {}) });
    // It cannot sign in or keep a session while it waits for the next pass.
    await db.run('UPDATE users SET disabled_at = COALESCE(disabled_at, NOW()) WHERE id = ?', user.id).catch(() => undefined);
    await db.run('DELETE FROM user_sessions WHERE user_id = ?', user.id).catch(() => undefined);
    return false;
  }
}

/** How routes/presentations.ts names a generated deck. */
const PRESENTATION_FILE = /^presentation_[\w-]+\.pptx$/;

/**
 * Top-level OUTPUT_DIR files a table still points at (the presentations a
 * row lists), or null when that cannot be read — then every deck is kept.
 */
async function keptOutputFiles(db: DatabaseAdapter): Promise<Set<string> | null> {
  try {
    const rows = await db.all<{ filename: string | null }>('SELECT filename FROM presentations WHERE filename IS NOT NULL');
    return new Set(rows.map((r) => r.filename).filter((f): f is string => typeof f === 'string').map((f) => path.basename(f)));
  } catch {
    return null;
  }
}

/** Audit, login and security rows and export files older than the TTL. */
async function pruneOldTraces(db: DatabaseAdapter, days: number, outputDir: string, result: RetentionResult, now: Date): Promise<void> {
  const traces: Array<{ table: string; sql: string }> = [
    { table: 'audit_events', sql: "DELETE FROM audit_events WHERE occurred_at < NOW() - make_interval(days => ?)" },
    { table: 'login_attempts', sql: "DELETE FROM login_attempts WHERE attempted_at < NOW() - make_interval(days => ?)" },
    { table: 'security_events', sql: "DELETE FROM security_events WHERE created_at < NOW() - make_interval(days => ?)" },
  ];
  for (const t of traces) {
    try {
      const r = await db.run(t.sql, days);
      if (r.changes > 0) result.rowsByTable[`${t.table} (older than ${days}d)`] = r.changes;
    } catch (err) {
      result.errors.push({ table: t.table, code: errorCode(err) });
    }
  }

  // Exported documents are copies of visitors' answers, with no owner recorded.
  // A deck the presentations table still lists is a kept file, not a copy:
  // deleting it left a 'ready' row whose download answered 404 for good.
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const dir = path.resolve(outputDir);
  const names = await fs.readdir(dir).catch(() => null);
  if (!names) return;
  const kept = await keptOutputFiles(db);
  let removed = 0;
  for (const name of names) {
    if (kept === null ? PRESENTATION_FILE.test(name) : kept.has(name)) continue;
    const file = path.join(dir, name);
    try {
      const st = await fs.stat(file);
      if (st.isFile() && st.mtimeMs < cutoff) {
        await fs.remove(file);
        removed++;
      }
    } catch {
      // Gone already, or not ours to read — the next pass tries again.
    }
  }
  if (removed > 0) result.rowsByTable[`export files (older than ${days}d)`] = removed;
}

/** One retention pass. Safe to run at any time; does nothing to ordinary accounts. */
export async function runDemoRetention(db: DatabaseAdapter, opts: RetentionOptions = {}): Promise<RetentionResult> {
  const result: RetentionResult = { expired: 0, deleted: 0, failed: 0, filesRemoved: 0, rowsByTable: {}, errors: [] };
  const limit = opts.limit ?? 200;
  const uploadDir = opts.uploadDir ?? (process.env.UPLOAD_DIR || './uploads');
  const outputDir = opts.outputDir ?? (process.env.OUTPUT_DIR || './outputs');
  const now = opts.now ?? new Date();

  // Not an administrator: an owner who promoted a visitor's account to help
  // run the demo would otherwise lose it, and with it every instance-wide row
  // it authored (other users' model restrictions, module pins), at expiry.
  // Accounts a pass already failed on (switched off, below) come last, so they
  // cannot fill the batch and keep every newer expiry from being deleted.
  const expired = await db.all<{ id: string; username: string }>(
    `SELECT id, username FROM users
      WHERE demo_expires_at IS NOT NULL AND demo_expires_at <= ? AND role <> 'admin'
      ORDER BY (disabled_at IS NOT NULL), demo_expires_at ASC
      LIMIT ?`,
    now.toISOString(), limit,
  );
  result.expired = expired.length;

  if (expired.length > 0) {
    const sessionTables = await tablesWithColumns(db, ['session_id']);
    const ownerTables = await tablesWithColumns(db, USER_OWNER_COLUMNS);
    const foreignKeys = await blockingForeignKeys(db).catch(() => [] as BlockingForeignKey[]);
    for (const user of expired) {
      const ok = await deleteDemoAccount(db, user, { sessionTables, ownerTables, foreignKeys, uploadDir, result });
      if (ok) result.deleted++; else result.failed++;
    }
  }

  if (opts.pruneTraces !== false) await pruneOldTraces(db, demoAccountTtlDays(), outputDir, result, now);
  return result;
}

export interface DemoRetentionHandle {
  runOnce(): Promise<RetentionResult | null>;
  stop(): void;
}

/**
 * The daily pass, in demo mode only: first a few minutes after boot, then
 * every 24 hours. Passes never overlap. Timers are unref'd.
 */
export function startDemoRetention(db: DatabaseAdapter, opts: { intervalMs?: number; firstDelayMs?: number } = {}): DemoRetentionHandle | null {
  if (!isDemoMode()) return null;
  const intervalMs = opts.intervalMs ?? 24 * 60 * 60 * 1000;
  const firstDelayMs = opts.firstDelayMs ?? 5 * 60 * 1000;
  let running = false;

  const runOnce = async (): Promise<RetentionResult | null> => {
    if (running) return null;
    running = true;
    try {
      const r = await runDemoRetention(db);
      const tables = Object.entries(r.rowsByTable).map(([t, n]) => `${t}=${n}`).join(' ');
      console.log(`[demo-retention] expired=${r.expired} deleted=${r.deleted} failed=${r.failed} files=${r.filesRemoved}${tables ? ` rows: ${tables}` : ''}`);
      if (r.errors.length > 0) {
        console.warn(`[demo-retention] ${r.errors.length} statement(s) failed: ${r.errors.map((e) => `${e.table}(${e.code}${e.constraint ? ` ${e.constraint}` : ''})`).join(' ')}`);
      }
      if (r.failed > 0) {
        console.warn(`[demo-retention] ${r.failed} expired account(s) could not be deleted and stay switched off — a table still references them (see the constraint names above)`);
      }
      return r;
    } catch (err) {
      console.warn('[demo-retention] pass failed:', err instanceof Error ? err.message : 'error');
      return null;
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => { void runOnce(); }, firstDelayMs);
  first.unref();
  const interval = setInterval(() => { void runOnce(); }, intervalMs);
  interval.unref();
  console.log(`[demo-retention] registered — demo accounts are deleted ${demoAccountTtlDays()} days after sign-up`);

  return {
    runOnce,
    stop() {
      clearTimeout(first);
      clearInterval(interval);
    },
  };
}
