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
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const child = spawn(
  process.execPath,
  [tsxCli, 'watch', 'server/index.ts'],
  { stdio: ['ignore', 'inherit', 'inherit'], cwd: repoRoot },
);
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
