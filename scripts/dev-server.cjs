/**
 * Dev-server launcher: `tsx watch server/index.ts` with stdin DETACHED.
 *
 * With an open stdin — any interactive terminal, and also under
 * concurrently (`pnpm run dev`) — the first dynamic import of a large
 * not-yet-cached package under `tsx watch` blocks until stdin closes,
 * which in a terminal is never. The blocked import parks the main thread
 * and freezes the WHOLE server event loop (every HTTP request hangs).
 * Diagnosed 2026-08-13 with the Claude Agent SDK import (the sdk: engine
 * appeared to hang forever); minimal repro: import blocked 39s under an
 * open stdin pipe and completed the instant the pipe closed, 249ms with
 * stdin ignored.
 *
 * Detaching stdin removes the ingredient. File-watch restarts are
 * unaffected — only tsx's interactive "press r to rerun" key is lost
 * (Ctrl+C still works; the terminal signals the process group).
 *
 * Lifecycle log (2026-09-23): the dev server was found down twice with
 * nothing to say why — the server logs to its terminal only. This launcher
 * writes logs/dev-server-lifecycle.log (gitignored, *.log) and hands the path
 * to the server as ANTON_LIFECYCLE_LOG, which adds its own lines (listening,
 * shutdown signal, survived crashes, a five-minute heartbeat with memory use).
 * See server/lib/lifecycle-log.ts for how to read it.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const LOG_DIR = path.join(repoRoot, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'dev-server-lifecycle.log');
const LOG_MAX_BYTES = 1024 * 1024;

function lifecycle(event) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} launcher pid=${process.pid} ${event}\n`);
  } catch {
    // Diagnostics must never stop the dev server from starting.
  }
}

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'dev-server-lifecycle.1.log'));
  }
} catch {
  // As above.
}
lifecycle(`start node=${process.version}`);

const child = spawn(
  process.execPath,
  [tsxCli, 'watch', 'server/index.ts'],
  {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: repoRoot,
    env: { ...process.env, ANTON_LIFECYCLE_LOG: LOG_FILE },
  },
);

// Record the signal, then leave shutdown to the child: it receives the same
// console event, and its exit ends this process below. A listener replaces
// Node's default exit-on-signal, so fall back to exiting if the child has not
// gone within ten seconds. SIGHUP is Windows' "console window closed";
// SIGBREAK is Ctrl+Break.
const SIGNAL_EXIT_FALLBACK_MS = 10_000;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    lifecycle(`received ${signal}`);
    setTimeout(() => {
      lifecycle(`child still running ${SIGNAL_EXIT_FALLBACK_MS}ms after ${signal} — launcher exiting`);
      process.exit(1);
    }, SIGNAL_EXIT_FALLBACK_MS);
  });
}

child.on('exit', (code, signal) => {
  lifecycle(`tsx watch exited code=${code} signal=${signal}`);
  process.exit(signal ? 1 : (code ?? 1));
});
