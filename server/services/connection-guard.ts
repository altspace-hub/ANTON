/**
 * connection-guard.ts
 * The per-connection guardrails the Connection wizard collects, in the one place
 * that the live execution paths call.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These controls used to live in `server/connections/{api,database,filesystem}-adapter.ts`.
 * Those files were imported by NOTHING — verified by grepping the whole repo for
 * `connections/*-adapter` and for their exported symbols (`callEndpoint`,
 * `executeQuery`, `listFiles`, `readFile`, `writeFile`): zero call sites. Meanwhile the
 * paths that actually run a connection — `workflow-executor.ts` and the duplicate step
 * runner in `routes/workflows.ts` — reimplemented the fetch/pg/mysql/mssql calls and
 * skipped every check.
 *
 * The measured consequence, before this module (driven through
 * executeScheduledWorkflow with a stubbed fetch/pg):
 *
 *   - a connection whose allowed_endpoints was [{GET,/allowed}] happily issued
 *     `DELETE https://api.example.com/NOT-in-the-allowlist`, and the run reported success;
 *   - a connection with ssl:true, sslVerifyCert:true built its pg Client with
 *     `ssl: { rejectUnauthorized: false }` — certificate verification off, silently, in
 *     direct contradiction of the checkbox the user ticked;
 *   - `DELETE FROM secrets WHERE 1=1` ran on a connection with no write permission;
 *   - max_rows_per_query:5 was ignored in favour of the step's maxRows:999;
 *   - allowed_tables was read by no code anywhere in the repository.
 *
 * So the wizard was collecting six security settings and storing them, and the product
 * enforced none of them. That is worse than not offering them: it invites an operator to
 * believe a boundary exists.
 *
 * FAIL-OPEN vs FAIL-CLOSED
 * ------------------------
 * Deliberately split, and the split is the whole design:
 *
 *   - An UNSET control does not restrict. An empty allowed_endpoints / allowed_tables,
 *     or rate_limit 0, means "no extra restriction" — which is exactly the status quo, so
 *     turning enforcement on cannot break an existing installation that never configured
 *     anything. The wizard labels say so ("leave blank for all", "0 = unlimited").
 *   - A SET control is enforced strictly, and violating it throws. Anyone who typed a
 *     value into those boxes asked for a boundary and now gets one.
 *
 * The one control that is enforced by DEFAULT is read-only SQL (see assertQueryPermitted)
 * — because the query text is template-interpolated with workflow context, which can
 * contain data fetched by an earlier step, and because the escape hatch is explicit.
 *
 * Pure functions with no I/O, so they are cheap to test directly and cheap to call from
 * both step runners.
 */

import { referencedTables } from './agent-connector-executor.js';

export interface EndpointRule {
  method: string;
  path: string;
}

/** A configuration/authorisation refusal, as opposed to a transport failure. */
export class ConnectionGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionGuardError';
  }
}

type Cfg = Record<string, unknown>;

// ── API: endpoint allowlist ────────────────────────────────────────────────

function parseEndpointRules(cfg: Cfg): EndpointRule[] {
  const raw = cfg.allowed_endpoints;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ method: String(r.method ?? '*'), path: String(r.path ?? '') }))
    .filter((r) => r.path !== '');
}

function matchesRule(rule: EndpointRule, method: string, path: string): boolean {
  const methodOk = rule.method === '*' || rule.method.toUpperCase() === method.toUpperCase();
  if (!methodOk) return false;
  if (rule.path === '*') return true;
  if (rule.path.endsWith('/*')) return path.startsWith(rule.path.slice(0, -2));
  return rule.path === path;
}

/**
 * Enforce the connection's endpoint allowlist.
 *
 * Empty list ⇒ no path restriction. The call is still bounded by the connection's
 * base_url and the https-only check in the step runners, so this is a narrowing control
 * within an already-approved host, not the only thing standing between a workflow and
 * the open internet.
 */
export function assertEndpointAllowed(cfg: Cfg, method: string, path: string): void {
  const rules = parseEndpointRules(cfg);
  if (rules.length === 0) return;

  if (!rules.some((r) => matchesRule(r, method, path))) {
    throw new ConnectionGuardError(
      `Endpoint "${method.toUpperCase()} ${path}" is not in this connection's allowed_endpoints. ` +
      `Permitted: ${rules.map((r) => `${r.method} ${r.path}`).join(', ')}.`
    );
  }
}

// ── API: rate limit ────────────────────────────────────────────────────────

const rateWindows = new Map<string, { count: number; windowStart: number }>();

/** Test hook — the window map is module state, so tests must be able to clear it. */
export function resetRateLimits(): void {
  rateWindows.clear();
}

/**
 * Enforce `rate_limit` requests per rolling 60s window, per connection.
 * 0 / absent / non-numeric ⇒ unlimited, matching the wizard's "0 = unlimited" label.
 */
export function assertWithinRateLimit(connectionId: string, cfg: Cfg, now: number = Date.now()): void {
  const limit = Number(cfg.rate_limit ?? 0);
  if (!Number.isFinite(limit) || limit <= 0) return;

  const win = rateWindows.get(connectionId);
  if (!win || now - win.windowStart >= 60_000) {
    rateWindows.set(connectionId, { count: 1, windowStart: now });
    return;
  }
  if (win.count >= limit) {
    throw new ConnectionGuardError(
      `Rate limit exceeded for this connection: max ${limit} request(s) per minute.`
    );
  }
  win.count += 1;
}

// ── API: timeout ceiling ───────────────────────────────────────────────────

/**
 * The effective request timeout: the step's value, capped by the connection's
 * `timeout_seconds` when one is configured. An unset connection timeout leaves the
 * step's own value (or the 30s default) untouched.
 */
export function resolveTimeoutMs(cfg: Cfg, stepTimeoutMs?: number): number {
  const stepMs = Number.isFinite(Number(stepTimeoutMs)) && Number(stepTimeoutMs) > 0
    ? Number(stepTimeoutMs)
    : undefined;
  const connSeconds = Number(cfg.timeout_seconds ?? 0);
  const connMs = Number.isFinite(connSeconds) && connSeconds > 0 ? connSeconds * 1000 : undefined;

  if (stepMs !== undefined && connMs !== undefined) return Math.min(stepMs, connMs);
  return stepMs ?? connMs ?? 30_000;
}

// ── Database: SQL shape ────────────────────────────────────────────────────

/**
 * Strip string literals and comments so the separator check cannot be fooled by a `;`
 * that is only ever data.
 *
 * A sibling of this helper exists (unexported) in agent-connector-executor.ts for the
 * model-authored-SQL threat model. Kept separate rather than reaching into that module's
 * internals: these are different callers with different tolerances, and the shared piece
 * that genuinely must not drift — table extraction — is imported, not copied.
 */
export function stripSqlNoise(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Read-only unless the connection was explicitly granted 'write'.
 *
 * Enforced by DEFAULT, unlike the other controls here, for two reasons. The step is
 * called "Database query" and its registry description says "Parameterised query" — a
 * step that can also DROP is not what the label promises. And the SQL is built by
 * `resolveTemplate(queryTemplate, context)`, i.e. by string interpolation of workflow
 * context that an earlier api_call or file_read step may have populated from outside the
 * machine; SELECT-only plus the separator ban is what stops that interpolation becoming a
 * second statement.
 *
 * A trailing semicolon is tolerated (it is idiomatic and harmless); an interior one is
 * not, because `db.query(text)` with no values dispatches over the simple protocol, which
 * executes multiple statements in one round trip.
 */
export function assertQueryPermitted(permissions: readonly string[], sql: string): void {
  const query = String(sql ?? '').trim();
  if (!query) throw new ConnectionGuardError('Database query step has an empty query.');

  const canWrite = Array.isArray(permissions) && permissions.includes('write');

  const body = stripSqlNoise(query).trim().replace(/;+\s*$/, '');
  if (body.includes(';')) {
    throw new ConnectionGuardError(
      'Database query must be a single statement — remove the ";" separator.'
    );
  }

  if (canWrite) return;

  if (!/^SELECT\s/i.test(query) && !/^WITH\s/i.test(query)) {
    throw new ConnectionGuardError(
      'Only SELECT queries are permitted on this connection. ' +
      'Recreate the connection with the "Write" permission enabled to allow modifications.'
    );
  }
}

// ── Database: table allowlist ──────────────────────────────────────────────

function parseAllowedTables(cfg: Cfg): string[] {
  const raw = cfg.allowed_tables;
  const list = Array.isArray(raw)
    ? raw.map((t) => String(t))
    : String(raw ?? '').split(',');
  return list.map((t) => t.trim()).filter((t) => t.length > 0);
}

/**
 * Every table the query reads must be in `allowed_tables`.
 * Blank ⇒ every table, exactly as the wizard's own label promises.
 *
 * Table extraction is imported from agent-connector-executor so the two allowlists in the
 * product agree on what "the tables this query touches" means — including its handling of
 * CTE names, which are query-local aliases rather than relations.
 */
export function assertTablesAllowed(cfg: Cfg, sql: string): void {
  const allowedList = parseAllowedTables(cfg);
  if (allowedList.length === 0) return;

  const allowed = new Set(allowedList.map((t) => t.toLowerCase()));
  const referenced = referencedTables(String(sql ?? ''));

  if (referenced.length === 0) {
    throw new ConnectionGuardError(
      `This connection restricts access to: ${allowedList.join(', ')} — the query must read from one of them.`
    );
  }
  for (const t of referenced) {
    const bare = t.includes('.') ? t.split('.').pop()! : t;
    if (!allowed.has(t.toLowerCase()) && !allowed.has(bare.toLowerCase())) {
      throw new ConnectionGuardError(
        `Table "${t}" is not in this connection's allowed_tables. Permitted: ${allowedList.join(', ')}.`
      );
    }
  }
}

// ── Database: row ceiling ──────────────────────────────────────────────────

/**
 * The connection's `max_rows_per_query` is a ceiling on the step's own maxRows, never a
 * floor — a step asking for more than the connection permits gets the connection's number.
 */
export function resolveMaxRows(cfg: Cfg, stepMaxRows?: number): number {
  const step = Number.isFinite(Number(stepMaxRows)) && Number(stepMaxRows) > 0
    ? Number(stepMaxRows)
    : 1000;
  const cap = Number(cfg.max_rows_per_query ?? 0);
  return Number.isFinite(cap) && cap > 0 ? Math.min(step, cap) : step;
}

// ── Database: TLS ──────────────────────────────────────────────────────────

/**
 * Whether the operator asked for the server certificate to be verified.
 *
 * `sslVerifyCert` is written by the wizard's "Verify SSL certificate" checkbox, which is
 * ticked by default — so absent means verify. Only an explicit `false` (the operator
 * unticking it for a self-signed certificate) turns verification off.
 *
 * The db-drivers under services/db-drivers already read it exactly this way, which is why
 * the pre-fix behaviour was so misleading: pressing Test used the driver and honoured the
 * checkbox, while running the workflow used a hand-rolled client that hardcoded
 * `rejectUnauthorized: false`. The connection that failed its test could still run.
 */
export function shouldVerifyCert(cfg: Cfg): boolean {
  return cfg.sslVerifyCert !== false;
}

/** pg / mysql `ssl` option. `false`/`undefined` when the connection does not use TLS. */
export function tlsOptionFor(cfg: Cfg): { rejectUnauthorized: boolean } | undefined {
  if (!cfg.ssl) return undefined;
  return { rejectUnauthorized: shouldVerifyCert(cfg) };
}

/** mssql `options` block. trustServerCertificate is the inverse of "verify". */
export function mssqlTlsOptions(cfg: Cfg): { encrypt: boolean; trustServerCertificate: boolean } {
  return {
    encrypt: Boolean(cfg.ssl),
    trustServerCertificate: !shouldVerifyCert(cfg),
  };
}

// ── Filesystem ─────────────────────────────────────────────────────────────

/** Default read ceiling for a workflow file_read step when the connection sets none. */
export const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export function maxFileBytes(cfg: Cfg): number {
  const mb = Number(cfg.max_file_size_mb ?? 0);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : DEFAULT_MAX_FILE_BYTES;
}

/**
 * Whether a file may be read through this connection.
 *
 * Returns a boolean rather than throwing: file_read walks a directory, and one oversized
 * or out-of-scope file should be skipped, not abort the step. An empty
 * `allowed_extensions` means every extension, per the wizard's "none = all allowed".
 */
export function isFileReadable(cfg: Cfg, fileName: string, sizeBytes: number): boolean {
  const rawExts = cfg.allowed_extensions;
  const exts = Array.isArray(rawExts)
    ? rawExts.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : [];

  if (exts.length > 0) {
    const lower = fileName.toLowerCase();
    if (!exts.some((ext) => lower.endsWith(ext.startsWith('.') ? ext : `.${ext}`))) return false;
  }
  return sizeBytes <= maxFileBytes(cfg);
}
