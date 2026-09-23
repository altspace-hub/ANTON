/**
 * lifecycle-log.ts — a record of why the dev server stopped.
 *
 * The server logs to its terminal only, so when it was found down (2026-09-22,
 * and again 09-23 after a Windows restart) nothing said when or why. The dev
 * launcher (scripts/dev-server.cjs) sets ANTON_LIFECYCLE_LOG to a file and
 * writes its own start/exit lines there; the server appends its side: listening,
 * shutdown signal, survived crashes, and a heartbeat with memory use.
 *
 * Reading it (Windows):
 *   - `listening` from a new pid with no `shutdown`/`exit` from the old one is
 *     a tsx-watch restart: tsx ends the old server with TerminateProcess,
 *     which runs no handler.
 *   - `launcher start` with no `listening` after it: the server failed while
 *     starting (a syntax error mid-edit, PostgreSQL not up yet) and tsx is
 *     waiting for a file change — the terminal shows why.
 *   - `shutdown` + `exit`: a signal the server handled.
 *   - the log simply stops after a heartbeat, and no `launcher` line follows:
 *     the whole tree was killed — a reboot, a closed session, a force-kill,
 *     memory exhaustion. The Windows System event log (IDs 1074 / 6006 / 6008
 *     / 41) tells those apart.
 *
 * Unset (production, tests) the log writes nothing. Lines carry event names,
 * error kinds and codes, code locations and sizes — never an error's message,
 * which can quote request data.
 */
import { appendFileSync } from 'node:fs';
import type { Server } from 'node:net';
import { logger } from './logger.js';

type Field = string | number | boolean | null | undefined;

const MAX_LOCATION_CHARS = 200;
const HEARTBEAT_MS = 5 * 60_000;

function logPath(): string | undefined {
  const p = process.env.ANTON_LIFECYCLE_LOG;
  return p && p.trim() ? p : undefined;
}

function format(value: Field): string {
  const s = String(value);
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}

/** Append one line: `<ISO time> server pid=<pid> <event> key=value …`. Never throws. */
export function lifecycleLog(event: string, fields: Record<string, Field> = {}): void {
  const file = logPath();
  if (!file) return;
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${format(v)}`);
  const line = [new Date().toISOString(), `server pid=${process.pid}`, event, ...parts].join(' ');
  try {
    appendFileSync(file, `${line}\n`);
  } catch {
    // A diagnostics file must never take the server down.
  }
}

/**
 * The parts of an error worth keeping on disk: its kind, its code and where in
 * the code it was thrown. Not the message — "invalid input syntax for type uuid:
 * <what the user typed>" is a message; the terminal log has it in full.
 */
export function errorFields(err: unknown): Record<string, Field> {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return { error: err.name, code, at: firstFrame(err.stack) };
  }
  return { error: typeof err };
}

/** The first stack frame as `file:line:col`, relative to the repository — a location, never data. */
function firstFrame(stack: string | undefined): string | undefined {
  const frame = stack?.split('\n').slice(1).find((l) => /\bat\b/.test(l));
  const loc = frame && /\(?([^()\s]+:\d+:\d+)\)?\s*$/.exec(frame)?.[1];
  if (!loc) return undefined;
  const rel = loc.replace(/\\/g, '/').replace(/^file:\/\/\/?/, '');
  const cwd = process.cwd().replace(/\\/g, '/');
  return (rel.startsWith(cwd) ? rel.slice(cwd.length + 1) : rel).slice(0, MAX_LOCATION_CHARS);
}

/** Every five minutes, record that the server is alive and how much memory it holds. */
export function startLifecycleHeartbeat(intervalMs = HEARTBEAT_MS): NodeJS.Timeout | undefined {
  if (!logPath()) return undefined;
  const mb = (bytes: number) => Math.round(bytes / 1_048_576);
  const timer = setInterval(() => {
    const m = process.memoryUsage();
    lifecycleLog('heartbeat', {
      uptimeMin: Math.round(process.uptime() / 60),
      rssMb: mb(m.rss),
      heapUsedMb: mb(m.heapUsed),
    });
  }, intervalMs);
  timer.unref();
  return timer;
}

/**
 * A server that cannot bind its port must exit, not linger.
 *
 * Without an 'error' listener, a failed listen() (EADDRINUSE — a second dev
 * server, or a stale one still holding the port) reaches the catch-all
 * uncaughtException handler, which keeps the process alive; its intervals then
 * hold it open while nothing listens, which looks exactly like "the server is
 * down". Errors after the server is listening are logged and left alone.
 *
 * Inside the desktop app the server runs in Electron's own process (electron/
 * main.ts imports it), and an ANTON already on the port is one the app can use:
 * exiting there would close the app. So under Electron it is logged, not fatal.
 */
export function exitOnListenError(
  server: Server,
  port: number | string,
  exit: (code: number) => void = (code) => process.exit(code),
  inElectron: boolean = !!process.versions.electron,
): void {
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (server.listening) {
      logger.error({ err }, 'HTTP server error');
      return;
    }
    const hint = err.code === 'EADDRINUSE'
      ? `port ${port} is already in use — another ANTON server is probably running`
      : `could not listen on port ${port}`;
    lifecycleLog('listen-failed', { port, ...errorFields(err) });
    if (inElectron) {
      logger.error({ err, port }, `Server not started: ${hint} — the desktop app will use the one already running`);
      return;
    }
    logger.fatal({ err, port }, `Server not started: ${hint}`);
    exit(1);
  });
}
