/**
 * script-sandbox.ts — real sandboxed preview execution for generated scripts
 * (Wave 4.11, replaces the `preview_not_configured` stub in coding-scripts.ts).
 *
 * Execution model — honest about what it is and is not:
 *   • execFile with an args ARRAY (never a shell) on a throwaway temp dir
 *   • cwd = the temp dir; the script file + sample data are the only inputs;
 *     no user-supplied paths are ever honored
 *   • minimal environment (PATH + OS essentials only — no API keys, no
 *     DATABASE_URL, nothing from the server process leaks in)
 *   • 10 s timeout, 1 MB output cap, temp dir deleted afterwards
 *   • NOT a container: network access is not blocked and OS-level isolation
 *     is the OS user's. This is a preview convenience for scripts the user
 *     just generated and can read — not a hostile-code sandbox. The limits
 *     object in every response says so.
 *
 * Runtime detection: python (python / python3 / py) for Python scripts,
 * the server's own Node binary (process.execPath) for JavaScript. When the
 * needed runtime is missing the caller gets an honest 'no_runtime' status.
 */

import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type ScriptLanguage = 'python' | 'node';

export const SANDBOX_LIMITS = {
  timeout_ms: 10_000,
  max_output_bytes: 1024 * 1024,
  environment: 'minimal (PATH + OS essentials only — no server env vars or API keys)',
  filesystem: 'cwd = throwaway temp dir (script + data.txt/data.csv only), deleted after the run',
  network: 'NOT blocked — this is a local preview process, not a container; only run scripts you have read',
} as const;

export interface SandboxRunResult {
  ran: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  /** Spawn-level failure (runtime missing mid-run, EPERM, …) */
  spawnError?: string;
}

export interface PreviewAttempt extends SandboxRunResult {
  attempt: 1 | 2;
}

export interface PreviewResult {
  /** ok = first run passed; fixed = passed after ONE auto-fix round;
   *  failed = both attempts failed; no_runtime = python/node not on PATH. */
  status: 'ok' | 'fixed' | 'failed' | 'no_runtime';
  /** "ran against sample data ✓ / failed ✗" badge for the UI. */
  badge: 'passed' | 'fixed' | 'failed' | 'unavailable';
  language: ScriptLanguage;
  attempts: PreviewAttempt[];
  /** The corrected script when the auto-fix round produced one. */
  fixedScript?: string;
  limits: typeof SANDBOX_LIMITS;
  message: string;
}

// Injectable for tests — same call shape as node:child_process.execFile.
export type ExecFileImpl = typeof nodeExecFile;

export interface SandboxDeps {
  execFileImpl?: ExecFileImpl;
}

// ── Language detection ─────────────────────────────────────────────────────

export function detectLanguage(script: string, hint?: string): ScriptLanguage {
  if (hint === 'python' || hint === 'node') return hint;
  const py = /^\s*(import\s+\w|from\s+\w+\s+import|def\s+\w+\s*\(|print\s*\()/m;
  const js = /\b(require\s*\(|console\.\w+|=>|const\s+\w+\s*=|let\s+\w+\s*=|module\.exports)/;
  if (py.test(script) && !js.test(script)) return 'python';
  if (js.test(script) && !py.test(script)) return 'node';
  // Script Lite generates Python by default — honest tie-breaker.
  return py.test(script) ? 'python' : js.test(script) ? 'node' : 'python';
}

// ── Runtime resolution ─────────────────────────────────────────────────────

const PYTHON_CANDIDATES = process.platform === 'win32'
  ? ['python', 'py', 'python3']
  : ['python3', 'python'];

async function probeRuntime(cmd: string, execFileImpl: ExecFileImpl): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFileImpl(cmd, ['--version'], { timeout: 4_000, windowsHide: true }, (err) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

/** Returns the runtime executable for the language, or null when unavailable. */
export async function resolveRuntime(language: ScriptLanguage, deps: SandboxDeps = {}): Promise<string | null> {
  if (language === 'node') return process.execPath; // we ARE node
  const execFileImpl = deps.execFileImpl ?? nodeExecFile;
  for (const candidate of PYTHON_CANDIDATES) {
    if (await probeRuntime(candidate, execFileImpl)) return candidate;
  }
  return null;
}

// ── Minimal environment ────────────────────────────────────────────────────

const ENV_KEEP = [
  'PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'windir',
  'COMSPEC', 'ComSpec', 'TEMP', 'TMP', 'HOME', 'USERPROFILE',
  'LANG', 'LC_ALL', 'PATHEXT',
];

export function buildMinimalEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENV_KEEP) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  env.PYTHONIOENCODING = 'utf-8';
  env.NO_COLOR = '1';
  return env;
}

// ── Single sandboxed run ───────────────────────────────────────────────────

const OUTPUT_CHAR_CAP = 20_000; // chars echoed back per stream

function truncate(s: string): string {
  return s.length > OUTPUT_CHAR_CAP ? `${s.slice(0, OUTPUT_CHAR_CAP)}\n… [truncated]` : s;
}

export async function runScriptInSandbox(params: {
  script: string;
  dataSample?: string;
  language: ScriptLanguage;
  runtime: string;
  timeoutMs?: number;
}, deps: SandboxDeps = {}): Promise<SandboxRunResult> {
  const execFileImpl = deps.execFileImpl ?? nodeExecFile;
  const timeoutMs = Math.min(params.timeoutMs ?? SANDBOX_LIMITS.timeout_ms, SANDBOX_LIMITS.timeout_ms);
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'anton-script-preview-'));
  const scriptFile = path.join(tmpDir, params.language === 'python' ? 'script.py' : 'script.js');
  const started = Date.now();
  try {
    await writeFile(scriptFile, params.script, 'utf-8');
    if (params.dataSample && params.dataSample.trim()) {
      // Generated scripts commonly read data.csv or data.txt — provide both.
      await writeFile(path.join(tmpDir, 'data.csv'), params.dataSample, 'utf-8');
      await writeFile(path.join(tmpDir, 'data.txt'), params.dataSample, 'utf-8');
    }

    return await new Promise<SandboxRunResult>((resolve) => {
      execFileImpl(
        params.runtime,
        [scriptFile],
        {
          cwd: tmpDir,
          timeout: timeoutMs,
          maxBuffer: SANDBOX_LIMITS.max_output_bytes,
          env: buildMinimalEnv(),
          windowsHide: true,
        },
        (err: ExecFileException | null,
         stdout: string | Buffer, stderr: string | Buffer) => {
          const durationMs = Date.now() - started;
          const out = truncate(String(stdout ?? ''));
          const errOut = truncate(String(stderr ?? ''));
          if (!err) {
            resolve({ ran: true, stdout: out, stderr: errOut, exitCode: 0, durationMs, timedOut: false });
            return;
          }
          const timedOut = !!err.killed && durationMs >= timeoutMs - 250;
          const exitCode = typeof err.code === 'number' ? err.code : null;
          // ENOENT etc. = spawn-level failure (the process never ran)
          const spawnFailed = typeof err.code === 'string';
          resolve({
            ran: !spawnFailed,
            stdout: out,
            stderr: errOut,
            exitCode,
            durationMs,
            timedOut,
            spawnError: spawnFailed ? `${err.code}: ${err.message}` : undefined,
          });
        },
      );
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
  }
}

// ── Preview with ONE auto-fix round ────────────────────────────────────────

/**
 * Execute the script; on failure, ask `fixScript` (the caller wires the
 * module's / utility model) for a corrected script and re-run exactly once.
 * Both attempts' results are returned honestly — nothing is hidden.
 */
export async function runPreviewWithAutofix(params: {
  script: string;
  dataSample?: string;
  languageHint?: string;
  /** One-shot fixer: gets the failing script + error output, returns a corrected script or null. */
  fixScript?: (script: string, errorOutput: string) => Promise<string | null>;
}, deps: SandboxDeps = {}): Promise<PreviewResult> {
  const language = detectLanguage(params.script, params.languageHint);
  const runtime = await resolveRuntime(language, deps);
  if (!runtime) {
    return {
      status: 'no_runtime',
      badge: 'unavailable',
      language,
      attempts: [],
      limits: SANDBOX_LIMITS,
      message: language === 'python'
        ? 'No Python runtime found on this machine (tried python / py / python3) — install Python to enable preview runs.'
        : 'No JavaScript runtime available for preview.',
    };
  }

  const first = await runScriptInSandbox({ script: params.script, dataSample: params.dataSample, language, runtime }, deps);
  const attempts: PreviewAttempt[] = [{ attempt: 1, ...first }];

  if (first.ran && first.exitCode === 0 && !first.timedOut) {
    return {
      status: 'ok', badge: 'passed', language, attempts, limits: SANDBOX_LIMITS,
      message: `Ran against sample data ✓ (exit 0, ${first.durationMs} ms)`,
    };
  }

  // ── ONE auto-fix round ────────────────────────────────────────────────
  const errorOutput = [
    first.timedOut ? `Timed out after ${SANDBOX_LIMITS.timeout_ms} ms` : '',
    first.spawnError ?? '',
    first.stderr,
    first.stdout ? `stdout:\n${first.stdout}` : '',
  ].filter(Boolean).join('\n').slice(0, 8_000);

  let fixed: string | null = null;
  if (params.fixScript) {
    try {
      fixed = await params.fixScript(params.script, errorOutput);
    } catch {
      fixed = null; // fixer unavailable → report the first failure honestly
    }
  }

  if (!fixed || !fixed.trim() || fixed.trim() === params.script.trim()) {
    return {
      status: 'failed', badge: 'failed', language, attempts, limits: SANDBOX_LIMITS,
      message: `Failed ✗ (${first.timedOut ? 'timeout' : `exit ${first.exitCode ?? 'spawn error'}`})${params.fixScript ? ' — auto-fix produced no usable correction' : ''}`,
    };
  }

  const second = await runScriptInSandbox({ script: fixed, dataSample: params.dataSample, language, runtime }, deps);
  attempts.push({ attempt: 2, ...second });

  if (second.ran && second.exitCode === 0 && !second.timedOut) {
    return {
      status: 'fixed', badge: 'fixed', language, attempts, fixedScript: fixed, limits: SANDBOX_LIMITS,
      message: `Ran against sample data ✓ after one auto-fix round (exit 0, ${second.durationMs} ms)`,
    };
  }
  return {
    status: 'failed', badge: 'failed', language, attempts, fixedScript: fixed, limits: SANDBOX_LIMITS,
    message: `Failed ✗ — original run and the one auto-fix retry both failed (exit ${second.exitCode ?? 'spawn error'})`,
  };
}

/** Extract the first fenced code block from an LLM response, or null. */
export function extractCodeBlock(text: string): string | null {
  const m = text.match(/```(?:python|py|javascript|js|node)?\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}
