/**
 * scripts/demo-account.ts — an administrator's tool for visitors' rights
 * requests on the public demo (docs/deployment/public-demo.md, "Requests from
 * visitors"; privacy review 2026-09-26, code change #29).
 *
 * Run it from the ANTON directory, which holds the .env:
 *
 *   npx tsx scripts/demo-account.ts export <username> > <file>.json
 *       Every row of the account as JSON on stdout (collectAccountRows in
 *       server/services/demo-retention.ts: the rows the daily retention pass
 *       would delete). Credentials, sign-in tokens and key material are shown
 *       as "[redacted]". Messages go to stderr, so the file holds the export
 *       and nothing else.
 *
 *   npx tsx scripts/demo-account.ts delete <username>
 *       Counts what would be deleted and deletes nothing.
 *
 *   npx tsx scripts/demo-account.ts delete <username> --yes
 *       Deletes the demo account now, with everything the daily pass would
 *       delete (deleteDemoAccountNow). Prints row counts only. Never an
 *       administrator, and only a demo account.
 *
 * It refuses to run unless DATABASE_URL is set (the .env or the environment).
 * Exit codes: 0 done; 1 refused, not found, not deleted or an incomplete
 * export; 2 a usage error.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseAdapter } from '../server/db/database.js';
import type { AccountRows } from '../server/services/demo-retention.js';

export const USAGE = `Usage (from the ANTON directory):
  npx tsx scripts/demo-account.ts export <username> > <file>.json
  npx tsx scripts/demo-account.ts delete <username>          (counts only; deletes nothing)
  npx tsx scripts/demo-account.ts delete <username> --yes    (deletes the demo account now)
`;

export interface CliIO {
  /** stdout: the export, or row counts. */
  out(text: string): void;
  /** stderr: everything said to the administrator. */
  err(text: string): void;
}

export interface CliDeps {
  env: NodeJS.ProcessEnv;
  io: CliIO;
  /** Opens the database. Default: a small pool on DATABASE_URL. */
  openDb?(url: string): Promise<DatabaseAdapter>;
  /** Where uploads live. Default: UPLOAD_DIR, else ./uploads (as the server). */
  uploadDir?: string;
  /** The export's timestamp. Default: now. */
  now?: Date;
}

type Command = { kind: 'export' | 'delete'; username: string; yes: boolean };

/** The command line, or the reason it is not one. */
export function parseArgs(argv: readonly string[]): Command | { kind: 'help' } | { kind: 'usage'; error: string } {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };
  const flags = argv.filter((a) => a.startsWith('-'));
  const words = argv.filter((a) => !a.startsWith('-'));
  const unknown = flags.filter((f) => f !== '--yes');
  if (unknown.length > 0) return { kind: 'usage', error: `Unknown option: ${unknown[0]}` };
  const [command, username, ...rest] = words;
  if (command !== 'export' && command !== 'delete') return { kind: 'usage', error: 'The command is export or delete.' };
  if (!username || !username.trim()) return { kind: 'usage', error: 'Name the account: the username.' };
  if (rest.length > 0) return { kind: 'usage', error: 'One username at a time.' };
  const yes = flags.includes('--yes');
  if (yes && command !== 'delete') return { kind: 'usage', error: '--yes goes with delete only.' };
  return { kind: command, username: username.trim(), yes };
}

// ── Redaction ─────────────────────────────────────────────────────────────────

/**
 * Keys (column names, and keys inside JSON values, camelCase read as
 * snake_case) whose value is a credential, a sign-in token or key material.
 * collectAccountRows already redacts the columns it knows; this is the second
 * line, for the tables it reads generically (a credential vault, a wallet, an
 * invitation). Usage counts such as input_tokens or token_count are not
 * secrets and stay.
 */
const SECRET_KEY = new RegExp([
  'passw(or)?d', '(^|_)secrets?($|_)', 'mnemonic', 'privkey', 'private_key', 'encrypt', 'cipher', 'cookie', '^authorization$',
  '(^|_)token$', '(^|_)(token|key|pin|code|otp)_hash$', '^jti$', '(^|_)otp($|_)', '(^|_)pin$',
  '(^|_)(api|secret|signing|encryption|session|auth)_?key$',
  '(^|_)(invite|join|class|access|confirmation|recovery|backup|reset)_codes?$',
  '(^|_)(salt|iv)$', '^auth_config$', '(^|_)credentials?$', '^embedding',
].join('|'), 'i');

/** Values that are secrets wherever they appear: password hashes, signed tokens, provider API keys. */
const SECRET_VALUES: readonly RegExp[] = [
  /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}/g,
  /\$argon2(?:id|i|d)\$[^\s"']+/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
];

export const REDACTED = '[redacted]';

const snakeCase = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Whether a column or JSON key holds a secret. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(snakeCase(key));
}

function redactText(text: string): string {
  let out = text;
  for (const re of SECRET_VALUES) out = out.replace(re, REDACTED);
  return out;
}

/** A value ready for JSON: secrets redacted by key and by shape, all the way down. */
export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) && v !== null && v !== undefined ? REDACTED : redactValue(v);
    }
    return out;
  }
  return value;
}

// ── The export ────────────────────────────────────────────────────────────────

export interface AccountExport {
  format: 'anton-demo-account-export';
  version: 1;
  exportedAt: string;
  account: { id: string; username: string };
  note: string;
  /** Rows per table (schema.table outside public). */
  rowCounts: Record<string, number>;
  tables: Record<string, unknown[]>;
  /** Tables that could not be read: the export is incomplete while this is not empty. */
  unreadTables: Array<{ table: string; code: string }>;
}

export function buildExport(rows: AccountRows, now: Date): AccountExport {
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  for (const table of Object.keys(rows.tables).sort()) {
    tables[table] = rows.tables[table].map(redactValue);
    rowCounts[table] = tables[table].length;
  }
  return {
    format: 'anton-demo-account-export',
    version: 1,
    exportedAt: now.toISOString(),
    account: { id: rows.userId, username: rows.username },
    note: 'Every row this account wrote or that names it, as ANTON stores it. Passwords, sign-in tokens and key material are shown as [redacted].',
    rowCounts,
    tables,
    unreadTables: rows.errors.map((e) => ({ table: e.table, code: e.code })),
  };
}

// ── Finding the account ───────────────────────────────────────────────────────

interface AccountRow { id: string; username: string; role: string | null; demo: boolean }

type Lookup = { found: AccountRow } | { missing: true } | { ambiguous: number };

/** The account by its exact username, else by the same name in another case when only one account has it. */
export async function findAccount(db: DatabaseAdapter, username: string): Promise<Lookup> {
  const columns = 'id, username, role, demo_expires_at IS NOT NULL AS demo';
  const exact = await db.all<AccountRow>(`SELECT ${columns} FROM users WHERE username = ?`, username);
  if (exact.length === 1) return { found: exact[0] };
  const folded = await db.all<AccountRow>(`SELECT ${columns} FROM users WHERE LOWER(username) = LOWER(?)`, username);
  if (folded.length === 1) return { found: folded[0] };
  return folded.length === 0 ? { missing: true } : { ambiguous: folded.length };
}

// ── The CLI ───────────────────────────────────────────────────────────────────

async function defaultOpenDb(url: string): Promise<DatabaseAdapter> {
  const { PostgresAdapter } = await import('../server/db/adapters/postgresql-adapter.js');
  return new PostgresAdapter({ connectionString: url, maxConnections: 2 });
}

/** Runs one command. Returns the exit code; never exits the process itself. */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const { io } = deps;
  const parsed = parseArgs(argv);
  if (parsed.kind === 'help') {
    io.err(USAGE);
    return argv.length === 0 ? 2 : 0;
  }
  if (parsed.kind === 'usage') {
    io.err(`${parsed.error}\n${USAGE}`);
    return 2;
  }

  const url = (deps.env.DATABASE_URL ?? '').trim();
  if (!url) {
    io.err('Refused: DATABASE_URL is not set. Run this from the ANTON directory (its .env names the database), or set DATABASE_URL.\n');
    return 1;
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    io.err('Refused: DATABASE_URL is not a PostgreSQL connection string.\n');
    return 1;
  }

  const db = await (deps.openDb ?? defaultOpenDb)(url);
  try {
    const lookup = await findAccount(db, parsed.username);
    if ('missing' in lookup) {
      io.err('No account has that username.\n');
      return 1;
    }
    if ('ambiguous' in lookup) {
      io.err(`${lookup.ambiguous} accounts have that username in different letter case. Give it exactly as stored.\n`);
      return 1;
    }
    const user = lookup.found;
    const { collectAccountRows, deleteDemoAccountNow } = await import('../server/services/demo-retention.js');

    if (parsed.kind === 'export') {
      const rows = await collectAccountRows(db, user.id);
      if (!rows) {
        io.err('No account has that username.\n');
        return 1;
      }
      const doc = buildExport(rows, deps.now ?? new Date());
      io.out(`${JSON.stringify(doc, null, 2)}\n`);
      const total = Object.values(doc.rowCounts).reduce((a, b) => a + b, 0);
      io.err(`Exported ${total} row(s) from ${Object.keys(doc.rowCounts).length} table(s).\n`);
      if (doc.unreadTables.length > 0) {
        io.err(`INCOMPLETE: ${doc.unreadTables.length} table(s) could not be read (listed under unreadTables). Do not send this as the complete copy.\n`);
        return 1;
      }
      return 0;
    }

    // delete
    if (user.role === 'admin') {
      io.err('Refused: that account is an administrator. This tool never deletes an administrator.\n');
      return 1;
    }
    if (!user.demo) {
      io.err('Refused: that is not a demo account (it has no expiry). This tool deletes demo accounts only.\n');
      return 1;
    }
    if (!parsed.yes) {
      const rows = await collectAccountRows(db, user.id);
      const rowCounts: Record<string, number> = {};
      for (const [table, list] of Object.entries(rows?.tables ?? {})) rowCounts[table] = list.length;
      io.out(`${JSON.stringify({ dryRun: true, deleted: false, rowCounts }, null, 2)}\n`);
      io.err('Nothing was deleted. Re-run with --yes to delete the account now.\n');
      return 1;
    }

    const uploadDir = deps.uploadDir ?? (deps.env.UPLOAD_DIR || undefined);
    const r = await deleteDemoAccountNow(db, user.id, uploadDir ? { uploadDir } : {});
    if (r.refused) {
      io.err(r.refused === 'admin'
        ? 'Refused: that account is an administrator. This tool never deletes an administrator.\n'
        : r.refused === 'not_demo_account'
          ? 'Refused: that is not a demo account (it has no expiry). This tool deletes demo accounts only.\n'
          : 'No account has that username.\n');
      return 1;
    }
    const deleted = r.deleted === 1;
    io.out(`${JSON.stringify({ deleted, rowsByTable: r.rowsByTable, filesRemoved: r.filesRemoved, failedStatements: r.errors }, null, 2)}\n`);
    if (!deleted) {
      io.err('The account could not be deleted: a table still holds it (see failedStatements). It is switched off and signed out, and the daily retention pass tries again.\n');
      return 1;
    }
    io.err(r.errors.length > 0
      ? `The account is deleted; ${r.errors.length} statement(s) failed on the way (see failedStatements).\n`
      : 'The account is deleted.\n');
    return 0;
  } finally {
    await db.close().catch(() => undefined);
  }
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(entry).toLowerCase();
}

if (isMain()) {
  // stdout carries the export and nothing else: whatever a module logs while
  // it loads or runs goes to stderr.
  const writeOut = process.stdout.write.bind(process.stdout);
  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  const flushOut = (): Promise<void> => new Promise((resolve) => { writeOut('', () => resolve()); });

  (async () => {
    const dotenv = await import('dotenv');
    dotenv.config({ quiet: true });
    return await runCli(process.argv.slice(2), {
      env: process.env,
      io: { out: (text) => { writeOut(text); }, err: (text) => { process.stderr.write(text); } },
    });
  })()
    .then(async (code) => {
      await flushOut();
      process.exit(code);
    })
    .catch(async (err: unknown) => {
      process.stderr.write(`Failed: ${err instanceof Error ? err.message : 'error'}\n`);
      await flushOut();
      process.exit(1);
    });
}
