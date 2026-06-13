/**
 * coding-preview-service.ts — ANTON Studio Phase 6 (parity polish): the LIVE
 * LOCAL PREVIEW SERVER.
 *
 * WHAT THIS IS (be honest):
 *   A LOCAL dev-server RUNNER. It spawns ONE long-lived dev server per coding
 *   project (e.g. `node node_modules/vite/bin/vite.js`) in the project's bound
 *   workspace, gives it a localhost preview URL, and exposes start/stop/logs so
 *   the studio "feels as instant as bolt" (CODING_STUDIO_DESIGN_2026-06-13 §E).
 *
 * WHAT THIS IS NOT:
 *   • NOT a sandbox. The spawned process runs with the host's filesystem and
 *     network — there is no container, no network isolation, no resource cap.
 *     Container/sandbox isolation is owned by ANOTHER agent, not this module.
 *   • NOT a shell. argv is spawned directly (shell:false), always.
 *
 * ── KILL-SAFETY (NON-NEGOTIABLE OPERATOR RULE) ──────────────────────────────
 *   This module may ONLY terminate a process via the exact ChildProcess HANDLE
 *   it itself spawned and is currently tracking, with child.kill('SIGTERM').
 *     • NEVER taskkill / kill-by-name / kill-by-port.
 *     • NEVER process.kill(pid) on a pid read from the DB or anywhere else.
 *     • NEVER enumerate/scan processes.
 *   The DB stores a `pid` for INFORMATION ONLY — it is never used to kill.
 *   On a server restart the in-memory handles are gone; a row still marked
 *   'running' then becomes 'unknown' (we cannot prove the old process is alive,
 *   and we will NOT scan for it). "Clear" on an unknown row only updates the DB
 *   row — it kills nothing it does not hold a handle for.
 *
 * ── OPT-IN GATE ─────────────────────────────────────────────────────────────
 *   The ENTIRE feature is gated behind CODING_STUDIO_PREVIEW (default OFF).
 *   When unset/false, startPreview returns a 412-shaped refusal and spawns
 *   NOTHING.
 *
 * Everything external is injectable (spawnImpl, portPicker, the workspace
 * validator) so tests run with a fake spawn and no real ports/processes.
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { DatabaseAdapter } from '../db/database.js';
import { validateWorkspacePath, buildCommandEnv } from './coding-workspace.js';

// ── Tunables ────────────────────────────────────────────────────────────────

/** Ring-buffer cap for captured stdout/stderr (≈64 KB, oldest dropped). */
export const PREVIEW_LOG_CAP_BYTES = 64 * 1024;
/** Default port range we bind-test within when no port is supplied. */
const PREVIEW_PORT_MIN = 4300;
const PREVIEW_PORT_MAX = 4399;
/** Windows .cmd shims that cannot be spawned without a shell (we never shell). */
const WINDOWS_CMD_SHIMS = /^(npm|pnpm|yarn|npx)(\.cmd)?$/i;

export type PreviewStatus = 'starting' | 'running' | 'stopped' | 'crashed' | 'unknown';

// ── Injectable seams ─────────────────────────────────────────────────────────

/**
 * The subset of node:child_process spawn this module uses. Tests inject a fake
 * returning an EventEmitter-ish child with .kill + stdout/stderr emitters.
 */
export type SpawnImpl = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; shell: false; windowsHide: boolean },
) => ChildProcess;

/** Picks a free localhost port. Default = OS-assisted bind test; tests inject. */
export type PortPicker = () => Promise<number>;

export interface PreviewServiceDeps {
  spawnImpl?: SpawnImpl;
  portPicker?: PortPicker;
  /** Test seam — override the workspace validator (default = the real one). */
  validateWorkspace?: typeof validateWorkspacePath;
  /** Test seam — override the platform check (default = process.platform). */
  platform?: NodeJS.Platform;
}

// ── In-memory handle registry (the ONLY thing we ever kill) ──────────────────

interface LiveHandle {
  child: ChildProcess;
  projectId: string;
  port: number;
  startedAt: Date;
  /** Bounded ring buffer of combined stdout+stderr. */
  logBuffer: string;
}

/**
 * Module-level registry of the children THIS process spawned. Module-level (not
 * per-service-instance) so shutdownAllPreviews() can SIGTERM exactly the handles
 * we own on graceful exit, and so a second service instance never double-spawns.
 */
const liveHandles = new Map<string, LiveHandle>();

// ── Result shapes ─────────────────────────────────────────────────────────────

export interface PreviewRow {
  coding_project_id: string;
  status: PreviewStatus;
  port: number | null;
  pid: number | null;
  command: string | null;
  preview_url: string | null;
  last_log: string | null;
  started_at: string | null;
  stopped_at: string | null;
  updated_at: string | null;
}

export interface PreviewView {
  status: PreviewStatus;
  port: number | null;
  pid: number | null;
  preview_url: string | null;
  command: string[] | null;
  last_log: string | null;
  /** True iff this process is currently tracking a live child handle. */
  has_live_handle: boolean;
  started_at: string | null;
  stopped_at: string | null;
}

export interface StartResult {
  ok: boolean;
  /** When ok=false, the HTTP-ish code the route should surface (412 = gated off). */
  code?: number;
  error?: string;
  view?: PreviewView;
}

export interface StopResult {
  ok: boolean;
  error?: string;
  /** Honest note: 'killed' (had a handle) vs 'no-handle' (only marked stopped). */
  note: 'killed' | 'no-handle' | 'not-running';
  view?: PreviewView;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gateEnabled(): boolean {
  const v = (process.env.CODING_STUDIO_PREVIEW ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/** Append to a bounded ring buffer (drop oldest, keep the tail). */
function appendLog(handle: LiveHandle, chunk: string): void {
  handle.logBuffer += chunk;
  if (handle.logBuffer.length > PREVIEW_LOG_CAP_BYTES) {
    handle.logBuffer = handle.logBuffer.slice(handle.logBuffer.length - PREVIEW_LOG_CAP_BYTES);
  }
}

/** A short, single-line, PII-free tail for the DB `last_log` at-a-glance hint. */
function lastLogLine(buffer: string): string {
  const lines = buffer.split(/\r?\n/).filter((l) => l.trim() !== '');
  const last = lines.length > 0 ? lines[lines.length - 1] : '';
  return last.slice(0, 500);
}

/**
 * Default port picker: ask the OS for a free port by binding :0 briefly, then
 * close. We never scan/enumerate processes — the OS hands us a free port.
 */
async function defaultPortPicker(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen({ port: 0, host: '127.0.0.1' }, () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close(() => reject(new Error('could not determine a free port')));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

function isValidExplicitPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function toView(row: PreviewRow | undefined, projectId: string): PreviewView {
  const hasHandle = liveHandles.has(projectId);
  if (!row) {
    return {
      status: hasHandle ? 'running' : 'stopped',
      port: null, pid: null, preview_url: null, command: null, last_log: null,
      has_live_handle: hasHandle, started_at: null, stopped_at: null,
    };
  }
  // Reconcile: DB says running/starting but no live handle in THIS process →
  // honest 'unknown' (server likely restarted; we will NOT scan/kill for it).
  let status = row.status;
  if ((status === 'running' || status === 'starting') && !hasHandle) status = 'unknown';
  let command: string[] | null = null;
  if (row.command) {
    try {
      const parsed = JSON.parse(row.command);
      if (Array.isArray(parsed)) command = parsed.map((s) => String(s));
    } catch { command = null; }
  }
  return {
    status,
    port: row.port,
    pid: row.pid,
    preview_url: row.preview_url,
    command,
    last_log: row.last_log,
    has_live_handle: hasHandle,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
  };
}

async function readRow(db: DatabaseAdapter, projectId: string): Promise<PreviewRow | undefined> {
  return db.get<PreviewRow>(
    `SELECT coding_project_id, status, port, pid, command, preview_url, last_log,
            started_at::text AS started_at, stopped_at::text AS stopped_at, updated_at::text AS updated_at
       FROM coding_preview_servers
      WHERE coding_project_id = ?`,
    projectId,
  );
}

/** Upsert the durable status row (parameterized; no string concat). */
async function upsertRow(
  db: DatabaseAdapter,
  projectId: string,
  fields: {
    status: PreviewStatus;
    port?: number | null;
    pid?: number | null;
    command?: string | null;
    preview_url?: string | null;
    last_log?: string | null;
    started_at?: Date | null;
    stopped_at?: Date | null;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO coding_preview_servers
       (coding_project_id, status, port, pid, command, preview_url, last_log, started_at, stopped_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON CONFLICT (coding_project_id) DO UPDATE SET
       status = EXCLUDED.status,
       port = EXCLUDED.port,
       pid = EXCLUDED.pid,
       command = EXCLUDED.command,
       preview_url = EXCLUDED.preview_url,
       last_log = EXCLUDED.last_log,
       started_at = EXCLUDED.started_at,
       stopped_at = EXCLUDED.stopped_at,
       updated_at = NOW()`,
    projectId,
    fields.status,
    fields.port ?? null,
    fields.pid ?? null,
    fields.command ?? null,
    fields.preview_url ?? null,
    fields.last_log ?? null,
    fields.started_at ? fields.started_at.toISOString() : null,
    fields.stopped_at ? fields.stopped_at.toISOString() : null,
  );
}

/** Just update status + last_log + stopped_at (used by exit handlers / clears). */
async function patchStatus(
  db: DatabaseAdapter,
  projectId: string,
  status: PreviewStatus,
  opts: { last_log?: string | null; stopped_at?: Date | null } = {},
): Promise<void> {
  await db.run(
    `UPDATE coding_preview_servers
        SET status = ?, last_log = COALESCE(?, last_log),
            stopped_at = ?, updated_at = NOW()
      WHERE coding_project_id = ?`,
    status,
    opts.last_log ?? null,
    opts.stopped_at ? opts.stopped_at.toISOString() : null,
    projectId,
  );
}

interface CodingProjectDirRow { directory_path: string | null; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start (or no-op if already live) the project's preview dev server.
 *
 * Gated by CODING_STUDIO_PREVIEW — when off, returns { ok:false, code:412 } and
 * spawns NOTHING. Validates the project's bound workspace dir via the same
 * ALLOWED_FOLDER_PATHS validator the rest of Studio uses; spawns argv[0] with no
 * shell in that dir; tracks the handle; captures output into a bounded ring
 * buffer; writes the durable 'running' row.
 */
export async function startPreview(
  db: DatabaseAdapter,
  projectId: string,
  opts: { argv: string[]; port?: number },
  deps: PreviewServiceDeps = {},
): Promise<StartResult> {
  if (!gateEnabled()) {
    return {
      ok: false,
      code: 412,
      error: 'Live preview is disabled. Set CODING_STUDIO_PREVIEW=true to enable the local dev-server runner.',
    };
  }

  const spawnImpl: SpawnImpl = deps.spawnImpl ?? (nodeSpawn as unknown as SpawnImpl);
  const portPicker = deps.portPicker ?? defaultPortPicker;
  const validate = deps.validateWorkspace ?? validateWorkspacePath;
  const platform = deps.platform ?? process.platform;

  // Already running with a live handle → idempotent no-op (don't double-spawn).
  if (liveHandles.has(projectId)) {
    const row = await readRow(db, projectId);
    return { ok: true, view: toView(row, projectId) };
  }

  // argv hygiene.
  if (!Array.isArray(opts.argv) || opts.argv.length === 0 || opts.argv.some((a) => typeof a !== 'string' || a.length === 0)) {
    return { ok: false, code: 400, error: 'argv must be a non-empty array of non-empty strings (command + args).' };
  }
  if (opts.argv.length > 32) {
    return { ok: false, code: 400, error: 'too many arguments (max 32).' };
  }

  // Windows .cmd shim guard — npm/pnpm/yarn/npx are .cmd shims that CANNOT be
  // spawned without a shell, and we never use a shell. Refuse honestly (mirrors
  // coding-workspace's runProjectTests guidance) instead of silently failing.
  const base = basenameLower(opts.argv[0]);
  if (platform === 'win32' && WINDOWS_CMD_SHIMS.test(base)) {
    return {
      ok: false,
      code: 400,
      error:
        `"${opts.argv[0]}" is a Windows .cmd shim and cannot be spawned without a shell (ANTON never uses a shell). ` +
        'Invoke the dev server binary via node instead, e.g. ["node","node_modules/vite/bin/vite.js","--port","<port>"].',
    };
  }

  // Validate the bound workspace dir (the dev server runs here).
  const proj = await db.get<CodingProjectDirRow>(
    'SELECT directory_path FROM coding_projects WHERE id = ?',
    projectId,
  );
  if (!proj) return { ok: false, code: 404, error: 'Coding project not found.' };
  const ws = await validate(proj.directory_path);
  if (!ws.ok || !ws.resolved) {
    return { ok: false, code: 400, error: ws.error ?? 'Workspace directory is not valid for preview.' };
  }
  const workspaceAbs = ws.resolved;

  // Pick a port.
  let port: number;
  if (opts.port !== undefined) {
    if (!isValidExplicitPort(opts.port)) return { ok: false, code: 400, error: 'port must be an integer in [1,65535].' };
    port = opts.port;
  } else {
    try {
      port = await portPicker();
    } catch {
      return { ok: false, code: 500, error: 'could not find a free port for the preview server.' };
    }
  }

  const previewUrl = `http://localhost:${port}`;
  const commandJson = JSON.stringify(opts.argv);

  // Mark 'starting' before spawning so a crash-on-spawn is visible.
  await upsertRow(db, projectId, {
    status: 'starting', port, pid: null, command: commandJson,
    preview_url: previewUrl, last_log: null, started_at: new Date(), stopped_at: null,
  });

  // Spawn — NO SHELL, minimal env (the Studio command env strips server secrets).
  let child: ChildProcess;
  try {
    child = spawnImpl(opts.argv[0], opts.argv.slice(1), {
      cwd: workspaceAbs,
      env: buildCommandEnv(null),
      shell: false,
      windowsHide: true,
    });
  } catch (err) {
    await patchStatus(db, projectId, 'crashed', {
      last_log: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
      stopped_at: new Date(),
    });
    return { ok: false, code: 500, error: 'failed to spawn the preview server (see status).' };
  }

  const handle: LiveHandle = { child, projectId, port, startedAt: new Date(), logBuffer: '' };
  liveHandles.set(projectId, handle);

  // Capture output into the bounded ring buffer.
  child.stdout?.on('data', (d: Buffer | string) => appendLog(handle, d.toString()));
  child.stderr?.on('data', (d: Buffer | string) => appendLog(handle, d.toString()));

  // 'error' (spawn-time ENOENT etc.) — the handle never really came up.
  child.on('error', (err: Error) => {
    appendLog(handle, `\n[spawn error] ${err.message}\n`);
    liveHandles.delete(projectId);
    void patchStatus(db, projectId, 'crashed', { last_log: lastLogLine(handle.logBuffer), stopped_at: new Date() });
  });

  // 'exit' — clear the handle and record stopped (0) / crashed (non-zero).
  child.on('exit', (codeNum: number | null, signal: NodeJS.Signals | null) => {
    liveHandles.delete(projectId);
    const cleanExit = codeNum === 0 || signal === 'SIGTERM' || signal === 'SIGINT';
    void patchStatus(db, projectId, cleanExit ? 'stopped' : 'crashed', {
      last_log: lastLogLine(handle.logBuffer),
      stopped_at: new Date(),
    });
  });

  // The process is now tracked and (per node) spawned. pid may be undefined for
  // a moment on some platforms — record what we have honestly.
  await upsertRow(db, projectId, {
    status: 'running', port, pid: child.pid ?? null, command: commandJson,
    preview_url: previewUrl, last_log: null, started_at: handle.startedAt, stopped_at: null,
  });

  const row = await readRow(db, projectId);
  return { ok: true, view: toView(row, projectId) };
}

/**
 * Stop the preview server.
 *
 * ONLY ever child.kill('SIGTERM') on the EXACT tracked handle. If there is no
 * live handle (e.g. the server restarted and the handle was lost), we DO NOT
 * try to find or kill anything — we just mark the DB row 'stopped' and say so.
 */
export async function stopPreview(
  db: DatabaseAdapter,
  projectId: string,
): Promise<StopResult> {
  const handle = liveHandles.get(projectId);
  if (!handle) {
    const existing = await readRow(db, projectId);
    if (!existing) {
      return { ok: true, note: 'not-running', view: toView(undefined, projectId) };
    }
    // No live handle to kill. NEVER taskkill / kill-by-pid. Just mark stopped.
    await patchStatus(db, projectId, 'stopped', { stopped_at: new Date() });
    const row = await readRow(db, projectId);
    return {
      ok: true,
      note: 'no-handle',
      error: 'No live preview handle in this server process (it was likely restarted). Marked stopped in the database; nothing was killed.',
      view: toView(row, projectId),
    };
  }

  // The ONE allowed kill: SIGTERM on the exact handle we spawned and hold.
  try {
    handle.child.kill('SIGTERM');
  } catch {
    // If kill throws (already gone), fall through — the exit handler will/has
    // cleaned up. Drop the handle defensively.
  }
  liveHandles.delete(projectId);
  // Record stopped now (the exit handler also records it; this makes the
  // synchronous response honest even before 'exit' fires).
  await patchStatus(db, projectId, 'stopped', {
    last_log: lastLogLine(handle.logBuffer),
    stopped_at: new Date(),
  });
  const row = await readRow(db, projectId);
  return { ok: true, note: 'killed', view: toView(row, projectId) };
}

/** Reconciled status (DB row + whether a live handle exists in THIS process). */
export async function getPreviewStatus(
  db: DatabaseAdapter,
  projectId: string,
): Promise<PreviewView> {
  const row = await readRow(db, projectId);
  return toView(row, projectId);
}

/** The in-memory ring buffer (full log tail) + the reconciled status. */
export async function getPreviewLogs(
  db: DatabaseAdapter,
  projectId: string,
): Promise<{ status: PreviewStatus; has_live_handle: boolean; logs: string }> {
  const handle = liveHandles.get(projectId);
  const view = await getPreviewStatus(db, projectId);
  return {
    status: view.status,
    has_live_handle: !!handle,
    // Only this process's live buffer is available; if the handle is gone the
    // in-memory log is gone too (honest — we don't fabricate historical logs).
    logs: handle ? handle.logBuffer : '',
  };
}

/**
 * Graceful-exit hook: SIGTERM ONLY the handles THIS module owns. Never scans,
 * never kills anything it does not hold. Safe to call multiple times.
 */
export function shutdownAllPreviews(): void {
  for (const [projectId, handle] of liveHandles.entries()) {
    try {
      handle.child.kill('SIGTERM');
    } catch {
      /* already gone — nothing to do */
    }
    liveHandles.delete(projectId);
  }
}

/** Test-only: how many live handles this module currently tracks. */
export function liveHandleCountForTests(): number {
  return liveHandles.size;
}

/** Test-only: drop tracked handles WITHOUT killing (for clean test isolation). */
export function clearHandlesForTests(): void {
  liveHandles.clear();
}

function basenameLower(p: string): string {
  const parts = p.split(/[\\/]+/);
  return (parts[parts.length - 1] || p).toLowerCase();
}
