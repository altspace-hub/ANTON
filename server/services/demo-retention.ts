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
 *   - the module prompts it edited (system_prompts rows of author
 *     'user-override' that its runs name and no one else's do), the saved
 *     copies of its sessions' answers (versions, also those written before
 *     versions had an owner);
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
 * drop — but loses the user and session ids, and the time of day. A custom
 * module shared with the community loses its author and stays.
 *
 * An administrator is never deleted, even one that began as a demo account.
 *
 * Also in demo mode: audit, login and security rows older than the TTL (they
 * carry visitors' IP addresses, including visitors who never signed up) and
 * export files older than the TTL are removed — not a deck the presentations
 * table still lists. And rows no pass can reach by account any more are swept:
 * the answer copies, embeddings, scores and memory feedback of sessions that
 * no longer exist (an embedding or a score can land just after its session was
 * deleted), and edited module prompts no run names.
 *
 * Deleting one session (routes/sessions.ts) uses deleteSessionRows below; an
 * administrator deletes one account on request with deleteDemoAccountNow and
 * exports it with collectAccountRows.
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
import { resetPromptVersionCacheForTests } from './prompt-versions.js';

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

/** A session id as POST /api/sessions mints it (crypto.randomUUID). */
const UUID_PATTERN = "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

/** The module-prompt version id a run's config snapshot names (JSON.stringify writes no spaces). */
const promptVersionIn = (column: string): string => `substring(${column} FROM '"modulePromptVersionId":"([0-9a-f]+)"')`;

/**
 * system_prompts has no owner column. An edited module prompt (author
 * 'user-override') is an account's when the account's audit rows or the config
 * snapshots of its runs name it. Params: the user id, three times.
 */
const ACCOUNT_PROMPT_OVERRIDES = `sp.author = 'user-override'
    AND (sp.id IN (SELECT a.system_prompt_version_id FROM audit_log a WHERE a.user_id = ?)
      OR sp.id IN (SELECT ${promptVersionIn('m.config_snapshot')} FROM messages m WHERE m.session_id IN (${SESSIONS_OF}))
      OR sp.id IN (SELECT ${promptVersionIn('s.config')} FROM sessions s WHERE s.user_id = ?))`;

/**
 * ...and it stays while anyone else's run names it: the table is
 * content-addressed, so two people who send the same text share one row.
 * Params: the user id, three times.
 */
const NAMED_BY_NO_OTHER_ACCOUNT = `NOT EXISTS (SELECT 1 FROM audit_log o WHERE o.system_prompt_version_id = sp.id AND o.user_id IS DISTINCT FROM ?)
    AND NOT EXISTS (SELECT 1 FROM messages o JOIN sessions os ON os.id = o.session_id WHERE os.user_id IS DISTINCT FROM ? AND strpos(o.config_snapshot, sp.id) > 0)
    AND NOT EXISTS (SELECT 1 FROM sessions o WHERE o.user_id IS DISTINCT FROM ? AND strpos(o.config, sp.id) > 0)`;

/**
 * The fixed steps, in order. Params: the user id (every `?`). Exported so a
 * test can read them against the real schema.
 */
export const RETENTION_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
  // First: the rows that name them go below.
  { table: 'system_prompts', sql: `DELETE FROM system_prompts sp WHERE ${ACCOUNT_PROMPT_OVERRIDES} AND ${NAMED_BY_NO_OTHER_ACCOUNT}` },
  // Copies of its answers written before versions had an owner (the generic pass takes the owned ones).
  { table: 'versions', sql: `DELETE FROM versions WHERE entity_type IN ('session', 'output') AND entity_id IN (${SESSIONS_OF})` },
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

/**
 * Copies of one session's answers that no foreign key removes with it, and
 * that nothing can reach once it is gone: the automatic and saved versions
 * (entity_id is the session id) and the answer embeddings (content_id is a
 * message id, so they go before the messages do). Every mode. Params: the
 * session id.
 */
export const SESSION_COPY_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
  { table: 'embeddings', sql: "DELETE FROM embeddings WHERE content_type = 'session_output' AND content_id IN (SELECT id FROM messages WHERE session_id = ?)" },
  { table: 'versions', sql: "DELETE FROM versions WHERE entity_type IN ('session', 'output') AND entity_id = ?" },
];

/**
 * The edited module prompts one session's runs name and no other run does.
 * Params: the session id, five times.
 */
const SESSION_PROMPT_OVERRIDES = `DELETE FROM system_prompts sp
  WHERE sp.author = 'user-override'
    AND (sp.id IN (SELECT a.system_prompt_version_id FROM audit_log a WHERE a.session_id = ?)
      OR sp.id IN (SELECT ${promptVersionIn('m.config_snapshot')} FROM messages m WHERE m.session_id = ?))
    AND NOT EXISTS (SELECT 1 FROM audit_log o WHERE o.system_prompt_version_id = sp.id AND o.session_id IS DISTINCT FROM ?)
    AND NOT EXISTS (SELECT 1 FROM messages o WHERE o.session_id <> ? AND strpos(o.config_snapshot, sp.id) > 0)
    AND NOT EXISTS (SELECT 1 FROM sessions o WHERE o.id <> ? AND strpos(o.config, sp.id) > 0)`;

/**
 * How old an orphan must be before the sweep takes it. An answer's embedding
 * or quality score can be written a moment after its session is deleted, and
 * a prompt version is written just before the run rows that name it.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Rows of sessions and messages that no longer exist, which no pass can reach
 * by account (retrieval_feedback and quality_scores have no owner column), and
 * edited module prompts that no run names. Only ids shaped like a session id:
 * an 'output' version saved before its session existed is keyed by module id,
 * a Risk Atlas score by the atlas id; a code review's score is keyed by the
 * review. Params: the cut-off time (every `?`).
 */
export const ORPHAN_STEPS: ReadonlyArray<{ table: string; sql: string }> = [
  {
    table: 'versions (orphaned)',
    sql: `DELETE FROM versions v WHERE v.entity_type IN ('session', 'output') AND v.entity_id ~* ${UUID_PATTERN}
      AND (v.created_at IS NULL OR v.created_at < ?) AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = v.entity_id)`,
  },
  {
    table: 'embeddings (orphaned)',
    sql: `DELETE FROM embeddings e WHERE e.content_type = 'session_output'
      AND (e.created_at IS NULL OR e.created_at < ?) AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = e.content_id)`,
  },
  {
    table: 'retrieval_feedback (orphaned)',
    sql: `DELETE FROM retrieval_feedback r WHERE r.session_id ~* ${UUID_PATTERN}
      AND r.injected_at < ? AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = r.session_id)`,
  },
  {
    table: 'quality_scores (orphaned)',
    sql: `DELETE FROM quality_scores q WHERE q.session_id ~* ${UUID_PATTERN} AND q.module_id <> 'code-review-explain'
      AND (q.scored_at IS NULL OR q.scored_at < ?) AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = q.session_id)`,
  },
  {
    table: 'system_prompts (unnamed)',
    sql: `DELETE FROM system_prompts sp WHERE sp.author = 'user-override' AND sp.created_at < ?
      AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.system_prompt_version_id = sp.id)
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE strpos(m.config_snapshot, sp.id) > 0)
      AND NOT EXISTS (SELECT 1 FROM sessions s WHERE strpos(s.config, sp.id) > 0)`,
  },
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
  /** Also sweep orphans older than ORPHAN_MIN_AGE_MS (ORPHAN_STEPS). Default true. */
  sweepOrphans?: boolean;
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

  // The ledger keeps the spend, not the person — nor the time of day, which
  // could tie a row back to a visit. Truncated in UTC, the day the caps count
  // in: a bare `AT TIME ZONE 'UTC'` would be read back in the server's zone
  // and could move the row to the day before.
  if (ctx.sessionTables.some((t) => t.table_name === 'llm_spend_ledger') || ctx.ownerTables.some((t) => t.table_name === 'llm_spend_ledger')) {
    await step('llm_spend_ledger', "UPDATE llm_spend_ledger SET user_id = NULL, session_id = NULL, created_at = date_trunc('day', created_at, 'UTC') WHERE user_id = ?", user.id);
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

  if (opts.sweepOrphans !== false) await sweepOrphans(db, new Date(now.getTime() - ORPHAN_MIN_AGE_MS), result);
  if (opts.pruneTraces !== false) await pruneOldTraces(db, demoAccountTtlDays(), outputDir, result, now);
  forgetDeletedPromptVersions(result.rowsByTable);
  return result;
}

/** Rows of sessions that no longer exist (ORPHAN_STEPS), written before `cutoff`. */
async function sweepOrphans(db: DatabaseAdapter, cutoff: Date, result: RetentionResult): Promise<void> {
  for (const s of ORPHAN_STEPS) {
    try {
      const params = (s.sql.match(/\?/g) ?? []).map(() => cutoff.toISOString());
      const r = await db.run(s.sql, ...params);
      if (r.changes > 0) result.rowsByTable[s.table] = (result.rowsByTable[s.table] ?? 0) + r.changes;
    } catch (err) {
      result.errors.push({ table: s.table, code: errorCode(err) });
    }
  }
}

/**
 * The prompt-version resolver caches ids: after a row is deleted here, a later
 * run with the same text would be handed the id of a row that is gone.
 */
function forgetDeletedPromptVersions(rowsByTable: Record<string, number>): void {
  if (Object.keys(rowsByTable).some((t) => t.startsWith('system_prompts'))) resetPromptVersionCacheForTests();
}

export interface SessionRowsResult {
  rowsByTable: Record<string, number>;
  errors: Array<{ table: string; code: string }>;
}

/**
 * The rows deleting one session must take with it, beyond what a foreign key
 * cascades (messages, run_artifacts, snapshots, output_versions, …). Run after
 * the caller has checked the session is theirs and before the sessions row is
 * deleted.
 *
 * Always the copies of its answers (SESSION_COPY_STEPS). With `allSessionRows`
 * (the public demo, where a deleted session is removed at once) also every row
 * keyed by it in any table — the same set the account pass removes: the
 * edited module prompts only its runs name, its module output
 * (workflow_outputs.execution_id), and every session_id row, audit log, scores,
 * ratings, sign-offs and memory feedback included. The spend ledger keeps the
 * row and loses the session id; the user id stays, the daily caps read it.
 * Elsewhere those rows are kept: the audit log and the learning signals are
 * the instance owner's.
 */
export async function deleteSessionRows(
  db: DatabaseAdapter,
  sessionId: string,
  opts: { allSessionRows: boolean },
): Promise<SessionRowsResult> {
  const result: SessionRowsResult = { rowsByTable: {}, errors: [] };
  const step = async (table: string, sql: string, ...params: unknown[]): Promise<void> => {
    try {
      const r = await db.run(sql, ...params);
      if (r.changes > 0) result.rowsByTable[table] = (result.rowsByTable[table] ?? 0) + r.changes;
    } catch (err) {
      result.errors.push({ table, code: errorCode(err) });
    }
  };

  // First: the audit rows and messages that name them go below.
  if (opts.allSessionRows) {
    await step('system_prompts', SESSION_PROMPT_OVERRIDES, sessionId, sessionId, sessionId, sessionId, sessionId);
  }
  for (const s of SESSION_COPY_STEPS) await step(s.table, s.sql, sessionId);

  if (opts.allSessionRows) {
    await step('workflow_outputs', 'DELETE FROM workflow_outputs WHERE execution_id = ?', sessionId);
    const sessionTables = await tablesWithColumns(db, ['session_id']).catch(() => [] as TableColumns[]);
    for (const t of sessionTables) {
      if (skipGeneric(t.table_schema, t.table_name)) continue;
      await step(tableLabel(t.table_schema, t.table_name), `DELETE FROM ${qualified(t.table_schema, t.table_name)} WHERE ${columnText(t)} = ?`, sessionId);
    }
    if (sessionTables.some((t) => t.table_schema === 'public' && t.table_name === 'llm_spend_ledger')) {
      await step('llm_spend_ledger', 'UPDATE llm_spend_ledger SET session_id = NULL WHERE session_id = ?', sessionId);
    }
  }

  forgetDeletedPromptVersions(result.rowsByTable);
  return result;
}

export interface DeleteNowResult extends RetentionResult {
  /** Why nothing was deleted: no such account, an administrator, or not a demo account. */
  refused?: 'not_found' | 'admin' | 'not_demo_account';
}

/**
 * Deletes one demo account at once, with everything the daily pass would
 * delete (an erasure request, or a visitor who asks to leave). Never an
 * administrator, and only a demo account (demo_expires_at set): an ordinary
 * account on a shared server is not this tool's to delete. The account is
 * switched off and signed out first, so it cannot write while it goes.
 */
export async function deleteDemoAccountNow(
  db: DatabaseAdapter,
  userId: string,
  opts: { uploadDir?: string } = {},
): Promise<DeleteNowResult> {
  const result: DeleteNowResult = { expired: 0, deleted: 0, failed: 0, filesRemoved: 0, rowsByTable: {}, errors: [] };
  const user = await db.get<{ id: string; username: string; role: string | null; demo: boolean }>(
    'SELECT id, username, role, demo_expires_at IS NOT NULL AS demo FROM users WHERE id = ?',
    userId,
  );
  if (!user) return { ...result, refused: 'not_found' };
  if (user.role === 'admin') return { ...result, refused: 'admin' };
  if (!user.demo) return { ...result, refused: 'not_demo_account' };

  await db.run(
    "UPDATE users SET demo_expires_at = LEAST(demo_expires_at, NOW()), disabled_at = COALESCE(disabled_at, NOW()) WHERE id = ? AND role <> 'admin' AND demo_expires_at IS NOT NULL",
    user.id,
  );
  await db.run('DELETE FROM user_sessions WHERE user_id = ?', user.id);
  result.expired = 1;

  const sessionTables = await tablesWithColumns(db, ['session_id']);
  const ownerTables = await tablesWithColumns(db, USER_OWNER_COLUMNS);
  const foreignKeys = await blockingForeignKeys(db).catch(() => [] as BlockingForeignKey[]);
  const uploadDir = opts.uploadDir ?? (process.env.UPLOAD_DIR || './uploads');
  const ok = await deleteDemoAccount(db, user, { sessionTables, ownerTables, foreignKeys, uploadDir, result });
  if (ok) result.deleted++; else result.failed++;
  forgetDeletedPromptVersions(result.rowsByTable);
  return result;
}

/** Columns an export never carries: credentials, bearer tokens, key material, vectors. */
const EXPORT_REDACTED = /^(password_hash|mfa_secret|secret|token|access_token|share_token|embedding|embedding_vec)$|_encrypted$/i;

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = EXPORT_REDACTED.test(k) && v !== null ? '[redacted]' : v;
  return out;
}

export interface AccountRows {
  userId: string;
  username: string;
  /** Rows per table (schema.table outside public), as the daily pass would find them. */
  tables: Record<string, Array<Record<string, unknown>>>;
  /** Tables that could not be read, with the database's error code. */
  errors: Array<{ table: string; code: string }>;
}

/**
 * Every row the daily pass would delete for this account, read-only, for an
 * access or portability request: the same session-keyed and owner tables, the
 * account's embeddings, answer copies and edited module prompts (also those
 * other people's runs share). Credentials, tokens and vectors are redacted.
 * Null when there is no such account.
 */
export async function collectAccountRows(db: DatabaseAdapter, userId: string): Promise<AccountRows | null> {
  const user = await db.get<Record<string, unknown> & { id: string; username: string }>('SELECT * FROM users WHERE id = ?', userId);
  if (!user) return null;
  const out: AccountRows = { userId: user.id, username: user.username, tables: { users: [redactRow(user)] }, errors: [] };
  const seen = new Map<string, Set<string>>();
  const read = async (table: string, sql: string, ...params: unknown[]): Promise<void> => {
    try {
      const rows = await db.all<Record<string, unknown>>(sql, ...params);
      for (const row of rows) {
        const clean = redactRow(row);
        const key = JSON.stringify(clean);
        const keys = seen.get(table) ?? new Set<string>();
        if (keys.has(key)) continue;
        keys.add(key);
        seen.set(table, keys);
        (out.tables[table] ??= []).push(clean);
      }
    } catch (err) {
      out.errors.push({ table, code: errorCode(err) });
    }
  };

  await read('sessions', 'SELECT * FROM sessions WHERE user_id = ?', user.id);
  await read('user_profiles', 'SELECT * FROM user_profiles WHERE id = ?', user.id);
  await read('login_attempts', 'SELECT * FROM login_attempts WHERE username = ?', user.username);
  await read('system_prompts', `SELECT sp.* FROM system_prompts sp WHERE ${ACCOUNT_PROMPT_OVERRIDES}`, user.id, user.id, user.id);
  await read('versions', `SELECT * FROM versions WHERE user_id = ? OR (entity_type IN ('session', 'output') AND entity_id IN (${SESSIONS_OF}))`, user.id, user.id);
  await read(
    'embeddings',
    `SELECT * FROM embeddings WHERE (content_type = 'session_output' AND content_id IN (SELECT m.id FROM messages m WHERE m.session_id IN (${SESSIONS_OF})))
        OR (content_type = 'knowledge_atom' AND content_id IN (${ATOMS_OF}))`,
    user.id, user.id,
  );
  await read('workflow_outputs', `SELECT * FROM workflow_outputs WHERE created_by = ? OR execution_id IN (${SESSIONS_OF})`, user.id, user.id);

  for (const t of await tablesWithColumns(db, ['session_id'])) {
    await read(tableLabel(t.table_schema, t.table_name), `SELECT * FROM ${qualified(t.table_schema, t.table_name)} WHERE ${columnText(t)} IN (${SESSIONS_OF})`, user.id);
  }
  for (const t of await tablesWithColumns(db, USER_OWNER_COLUMNS)) {
    if (t.table_schema === 'public' && (t.table_name === 'users' || t.table_name === 'sessions')) continue;
    await read(tableLabel(t.table_schema, t.table_name), `SELECT * FROM ${qualified(t.table_schema, t.table_name)} WHERE ${columnText(t)} = ?`, user.id);
  }
  return out;
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
