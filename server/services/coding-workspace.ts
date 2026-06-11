/**
 * coding-workspace.ts — Wave 5.2: Coding Large apply-to-workspace + REAL
 * test execution. Converts the prompt-assembly governance skeleton into a
 * verifiable loop:
 *
 *   task execute (LLM) → parseFileBlocks (anton-coding-file-blocks/v1)
 *     → deterministic per-file diff against the bound workspace
 *     → user reviews + explicitly approves → files written (originals
 *       backed up to .anton-coding-backup/<timestamp>/ inside the workspace)
 *     → user explicitly approves a test run → execFile(argv) in the
 *       workspace → REAL results into coding_test_runs.
 *
 * Security posture (the headline):
 *   • Workspace dirs are validated against ALLOWED_FOLDER_PATHS (resolve +
 *     prefix check) at bind time AND on every use — no env default fallback:
 *     if the allowlist is not configured, nothing is writable.
 *   • Every file path from the LLM is workspace-relative; absolute paths,
 *     drive letters, UNC, `..` segments, reserved device names, and writes
 *     into .anton-coding-backup/ or .git/ are rejected at parse time AND
 *     re-checked with resolve+prefix at write time (defense in depth).
 *   • No shell, ever. Test commands are stored as an argv ARRAY and run via
 *     execFile; argv[0] that is itself a shell (cmd/bash/powershell/…) is
 *     refused at configuration time.
 *   • Test runs get a minimal allowlisted environment (script-sandbox
 *     discipline, widened only with what test runners genuinely need:
 *     PATH, HOME/USERPROFILE, TEMP, APPDATA/LOCALAPPDATA). Server secrets
 *     (API keys, DATABASE_URL) and NODE_OPTIONS are never inherited.
 *   • Nothing executes or writes without an explicit user approval carried
 *     in the request — the routes enforce it, this module documents it.
 */

import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { computeDiff, computeStats, type DiffChunk, type DiffStats } from './version-diff.js';

// ── Format contract ─────────────────────────────────────────────────────────

/**
 * The machine-parseable output contract the task-execute prompt mandates.
 * v1: each file is one fenced code block whose first non-blank line is a
 * header comment carrying the workspace-relative path:
 *   // FILE: relative/path.ts       (C-style)
 *   #  FILE: relative/path.py       (hash-comment languages)
 *   <!-- FILE: relative/path.html --> (markup)
 * plus a block-comment form ("slash-star FILE: path star-slash") and an SQL
 * form ("-- FILE: path").
 */
export const FILE_BLOCK_FORMAT_VERSION = 'anton-coding-file-blocks/v1';

export interface ParsedFileBlock {
  /** Normalized workspace-relative path (forward slashes). */
  path: string;
  /** Full file content, normalized to end with exactly one '\n'. */
  content: string;
  /** Info string of the fence (language tag), if any. */
  language?: string;
}

export interface RejectedBlock {
  reason: string;
  /** The raw header path when one was present. */
  path?: string;
}

export interface ParseResult {
  formatVersion: typeof FILE_BLOCK_FORMAT_VERSION;
  files: ParsedFileBlock[];
  /** Blocks that declared a FILE header but were refused. */
  rejected: RejectedBlock[];
  /** Paths that appeared more than once (last block won). */
  duplicates: string[];
  /** Fenced blocks without a FILE header (prose/JSON examples) — ignored. */
  ignoredBlocks: number;
}

const MAX_FILE_CHARS = 1_000_000;       // 1 MB per file (text format)
const MAX_TOTAL_CHARS = 4_000_000;      // 4 MB per response
const MAX_PATH_LENGTH = 512;

const HEADER_PATTERNS: RegExp[] = [
  /^\/\/\s*FILE:\s*(.+?)\s*$/,            // // FILE: path
  /^#\s*FILE:\s*(.+?)\s*$/,                // # FILE: path
  /^<!--\s*FILE:\s*(.+?)\s*-->\s*$/,       // <!-- FILE: path -->
  /^\/\*\s*FILE:\s*(.+?)\s*\*\/\s*$/,      // /* FILE: path */
  /^--\s*FILE:\s*(.+?)\s*$/,               // -- FILE: path (SQL)
];

function matchFileHeader(line: string): string | null {
  for (const re of HEADER_PATTERNS) {
    const m = line.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Parse anton-coding-file-blocks/v1 file blocks out of an LLM response.
 * Deterministic: same input → same output. Handles nested fences via
 * CommonMark fence-length rules (a block opened with N backticks only
 * closes on a fence of ≥ N backticks).
 */
export function parseFileBlocks(text: string): ParseResult {
  const lines = text.split('\n');
  const byPath = new Map<string, ParsedFileBlock>();
  const rejected: RejectedBlock[] = [];
  const duplicates: string[] = [];
  let ignoredBlocks = 0;
  let totalChars = 0;

  let inFence = false;
  let fenceLen = 0;
  let fenceLang = '';
  let buffer: string[] = [];

  const closeBlock = (): void => {
    // Skip leading blank lines, then require the FILE header.
    let idx = 0;
    while (idx < buffer.length && buffer[idx].trim() === '') idx++;
    const headerPath = idx < buffer.length ? matchFileHeader(buffer[idx].trim()) : null;
    if (headerPath === null) {
      ignoredBlocks++;
      return;
    }
    const validated = validateRelativePath(headerPath);
    if (!validated.ok) {
      rejected.push({ reason: validated.reason, path: headerPath });
      return;
    }
    const raw = buffer.slice(idx + 1).join('\n');
    const content = raw.replace(/\n+$/, '') + '\n';
    if (content.length > MAX_FILE_CHARS) {
      rejected.push({ reason: `file exceeds ${MAX_FILE_CHARS} characters`, path: validated.normalized });
      return;
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      rejected.push({ reason: `total parsed content exceeds ${MAX_TOTAL_CHARS} characters — block skipped`, path: validated.normalized });
      return;
    }
    if (byPath.has(validated.normalized)) duplicates.push(validated.normalized);
    byPath.set(validated.normalized, {
      path: validated.normalized,
      content,
      language: fenceLang || undefined,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!inFence) {
      const open = line.match(/^(`{3,})\s*([^`\s]*)\s*$/);
      if (open) {
        inFence = true;
        fenceLen = open[1].length;
        fenceLang = open[2] || '';
        buffer = [];
      }
      continue;
    }
    const close = line.match(/^(`{3,})\s*$/);
    if (close && close[1].length >= fenceLen) {
      closeBlock();
      inFence = false;
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  // An unterminated fence is NOT applied — truncated responses must not
  // half-write a file. Record it honestly if it carried a header.
  if (inFence && buffer.length > 0) {
    const first = buffer.find((l) => l.trim() !== '');
    const headerPath = first ? matchFileHeader(first.trim()) : null;
    if (headerPath !== null) {
      rejected.push({ reason: 'unterminated code fence (response truncated?) — not applied', path: headerPath });
    }
  }

  return {
    formatVersion: FILE_BLOCK_FORMAT_VERSION,
    files: Array.from(byPath.values()),
    rejected,
    duplicates,
    ignoredBlocks,
  };
}

// ── Path validation (the attack surface) ────────────────────────────────────

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const FORBIDDEN_TOP_DIRS = new Set(['.anton-coding-backup', '.git']);

export type PathValidation =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

/**
 * Validate an LLM-supplied workspace-relative path. Rejects absolute paths
 * (POSIX, drive-letter, drive-relative, UNC), traversal (`..`), null bytes,
 * reserved Windows device names, illegal characters, and writes into the
 * backup dir or .git. Returns a normalized forward-slash relative path.
 */
export function validateRelativePath(raw: string): PathValidation {
  let p = String(raw ?? '').trim();
  // Strip one layer of wrapping quotes/backticks the LLM may add.
  p = p.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!p) return { ok: false, reason: 'empty path' };
  if (p.length > MAX_PATH_LENGTH) return { ok: false, reason: `path longer than ${MAX_PATH_LENGTH} characters` };
  // eslint-disable-next-line no-control-regex
  if (/[\0-\x1f]/.test(p)) return { ok: false, reason: 'control characters in path' };
  if (/^[a-zA-Z]:/.test(p)) return { ok: false, reason: 'absolute/drive-letter paths are not allowed' };
  if (p.startsWith('/') || p.startsWith('\\')) return { ok: false, reason: 'absolute paths are not allowed' };
  if (p.endsWith('/') || p.endsWith('\\')) return { ok: false, reason: 'path must name a file, not a directory' };

  const segments = p.split(/[\\/]+/);
  const kept: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return { ok: false, reason: 'path traversal (..) is not allowed' };
    if (WINDOWS_RESERVED.test(seg)) return { ok: false, reason: `reserved device name in path: ${seg}` };
    if (/[<>:"|?*]/.test(seg)) return { ok: false, reason: 'illegal characters in path' };
    kept.push(seg);
  }
  if (kept.length === 0) return { ok: false, reason: 'empty path' };
  if (FORBIDDEN_TOP_DIRS.has(kept[0].toLowerCase())) {
    return { ok: false, reason: `writes into ${kept[0]}/ are not allowed` };
  }
  return { ok: true, normalized: kept.join('/') };
}

/**
 * Final defense at write time: resolve the (already-validated) relative
 * path against the workspace and verify the result stays inside it.
 * Returns the absolute target path, or null if it escapes.
 */
export function resolveTargetPath(workspaceAbs: string, normalizedRel: string): string | null {
  const base = path.resolve(workspaceAbs);
  const abs = path.resolve(base, normalizedRel);
  if (abs === base) return null; // the workspace dir itself is not a file target
  return abs.startsWith(base + path.sep) ? abs : null;
}

/**
 * Symlink-aware escape check (defense in depth on top of the lexical
 * resolveTargetPath). A pre-existing symlink anywhere in the workspace could
 * make a lexically-inside path resolve, physically, OUTSIDE the allowlist.
 *
 * We realpath the deepest EXISTING ancestor of the target (the target itself
 * and intermediate dirs may not exist yet — ENOENT walks up) and the workspace
 * root, then require the realpathed ancestor to stay within the realpathed
 * workspace. Returns true when the write is safe.
 *
 * Exported for tests.
 */
export async function isWriteWithinWorkspaceReal(workspaceAbs: string, targetAbs: string): Promise<boolean> {
  let realBase: string;
  try {
    realBase = await realpath(workspaceAbs);
  } catch {
    // Workspace root must resolve — validateWorkspacePath already proved it
    // exists, so a failure here is an unexpected race; fail closed.
    return false;
  }

  // Walk up from the target's parent to the nearest existing ancestor.
  let probe = path.dirname(targetAbs);
  // Guard against an unbounded loop; the loop terminates at the filesystem root.
  for (let i = 0; i < 4096; i++) {
    try {
      const realProbe = await realpath(probe);
      // The realpathed nearest-existing ancestor must be the workspace root or
      // strictly inside it.
      if (realProbe === realBase || realProbe.startsWith(realBase + path.sep)) {
        // Also verify the not-yet-created tail (probe→target) carries no `..`
        // that would climb back out lexically — resolveTargetPath already did,
        // but recompute defensively against realProbe.
        const rel = path.relative(probe, targetAbs);
        const realTarget = path.resolve(realProbe, rel);
        return realTarget === realBase || realTarget.startsWith(realBase + path.sep);
      }
      return false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const parent = path.dirname(probe);
        if (parent === probe) return false; // reached root without resolving
        probe = parent;
        continue;
      }
      return false; // any other error (EACCES, ELOOP…) → fail closed
    }
  }
  return false;
}

// ── Workspace (ALLOWED_FOLDER_PATHS) validation ─────────────────────────────

export interface WorkspaceValidation {
  ok: boolean;
  /** Resolved absolute path when ok. */
  resolved?: string;
  error?: string;
  allowedBases: string[];
  exists?: boolean;
}

/** ALLOWED_FOLDER_PATHS, resolved. NO default — unset means nothing is writable. */
export function getAllowedBases(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ALLOWED_FOLDER_PATHS ?? '';
  return raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => path.resolve(p));
}

/**
 * Validate a candidate workspace directory: absolute, inside an allowed
 * base (resolve + prefix check — the CLAUDE.md pattern), and an existing
 * directory. Called at bind time AND on every use.
 */
export async function validateWorkspacePath(
  dirPath: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkspaceValidation> {
  const allowedBases = getAllowedBases(env);
  if (!dirPath || !String(dirPath).trim()) {
    return { ok: false, error: 'No workspace directory bound to this project.', allowedBases };
  }
  if (allowedBases.length === 0) {
    return {
      ok: false,
      error: 'ALLOWED_FOLDER_PATHS is not configured — add your workspace root to it in .env to enable workspace writes.',
      allowedBases,
    };
  }
  if (!path.isAbsolute(dirPath)) {
    return { ok: false, error: 'Workspace path must be absolute.', allowedBases };
  }
  const resolved = path.resolve(dirPath);
  const inside = allowedBases.some((base) => resolved === base || resolved.startsWith(base + path.sep));
  if (!inside) {
    return { ok: false, error: 'Workspace is outside ALLOWED_FOLDER_PATHS.', allowedBases, resolved };
  }
  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) {
      return { ok: false, error: 'Workspace path exists but is not a directory.', allowedBases, resolved, exists: true };
    }
  } catch {
    return { ok: false, error: 'Workspace directory does not exist.', allowedBases, resolved, exists: false };
  }
  return { ok: true, resolved, allowedBases, exists: true };
}

// ── Deterministic diff ──────────────────────────────────────────────────────

export type FileAction = 'create' | 'modify' | 'unchanged';

export interface FileDiff {
  path: string;
  action: FileAction;
  stats: DiffStats;
  chunks: DiffChunk[];
}

/** Reuses the line-based diff from version-diff.ts — pure and deterministic. */
export function buildFileDiff(relPath: string, oldContent: string | null, newContent: string): FileDiff {
  if (oldContent === null) {
    const newLines = newContent.replace(/\n$/, '').split('\n');
    return {
      path: relPath,
      action: 'create',
      stats: {
        linesAdded: newLines.length, linesRemoved: 0, linesModified: 0,
        linesUnchanged: 0, similarity: 0, sectionsChanged: [],
      },
      chunks: [{ type: 'added', newLines }],
    };
  }
  if (oldContent === newContent) {
    return {
      path: relPath,
      action: 'unchanged',
      stats: { linesAdded: 0, linesRemoved: 0, linesModified: 0, linesUnchanged: oldContent.split('\n').length, similarity: 1, sectionsChanged: [] },
      chunks: [],
    };
  }
  const chunks = computeDiff(oldContent, newContent);
  return { path: relPath, action: 'modify', stats: computeStats(chunks, oldContent, newContent), chunks };
}

/**
 * Compact unchanged runs to head/tail context lines so previews stay small.
 * Deterministic.
 */
export function compactChunks(chunks: DiffChunk[], context = 3): DiffChunk[] {
  return chunks.map((c) => {
    if (c.type !== 'unchanged' || !c.lines || c.lines.length <= context * 2 + 1) return c;
    const omitted = c.lines.length - context * 2;
    return {
      ...c,
      lines: [
        ...c.lines.slice(0, context),
        `… ${omitted} unchanged lines …`,
        ...c.lines.slice(c.lines.length - context),
      ],
    };
  });
}

// ── Apply (write with backup) ───────────────────────────────────────────────

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface AppliedFileResult {
  path: string;
  action: FileAction;
  hash_before: string | null;
  hash_after: string;
  backed_up: boolean;
}

export interface ApplyResult {
  /** Workspace-relative backup dir, e.g. '.anton-coding-backup/2026-06-11T...' */
  backupDir: string;
  files: AppliedFileResult[];
  written: number;
  unchanged: number;
}

/**
 * Write parsed files into the workspace. Every target is re-resolved and
 * prefix-checked; originals are copied to .anton-coding-backup/<timestamp>/
 * (preserving relative structure) before being overwritten; a manifest.json
 * in the backup dir records the application for manual revert.
 *
 * Caller MUST have validated the workspace via validateWorkspacePath and
 * obtained explicit user approval.
 */
export async function applyFilesToWorkspace(params: {
  workspaceAbs: string;
  files: Array<{ path: string; content: string }>;
  applicationId: string;
}): Promise<ApplyResult> {
  const { workspaceAbs, files, applicationId } = params;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `.anton-coding-backup/${stamp}`;
  const backupAbs = path.join(workspaceAbs, '.anton-coding-backup', stamp);

  const results: AppliedFileResult[] = [];
  let written = 0;
  let unchanged = 0;
  let backupDirCreated = false;

  for (const file of files) {
    // Defense in depth: re-validate even though preview validated already.
    const validated = validateRelativePath(file.path);
    if (!validated.ok) throw new Error(`refusing to write ${file.path}: ${validated.reason}`);
    const target = resolveTargetPath(workspaceAbs, validated.normalized);
    if (!target) throw new Error(`refusing to write ${file.path}: escapes the workspace`);

    // Defense in depth: a pre-existing symlink in the workspace could make a
    // lexically-inside path resolve physically outside the allowlist. Verify
    // the realpathed nearest-existing ancestor stays inside the workspace.
    if (!(await isWriteWithinWorkspaceReal(workspaceAbs, target))) {
      throw new Error(`refusing to write ${file.path}: resolves outside the workspace via a symlink`);
    }

    let before: string | null = null;
    try {
      before = await readFile(target, 'utf8');
    } catch { /* new file */ }

    if (before !== null && before === file.content) {
      unchanged++;
      results.push({
        path: validated.normalized, action: 'unchanged',
        hash_before: sha256(before), hash_after: sha256(before), backed_up: false,
      });
      continue;
    }

    let backedUp = false;
    if (before !== null) {
      const backupTarget = path.join(backupAbs, ...validated.normalized.split('/'));
      await mkdir(path.dirname(backupTarget), { recursive: true });
      await copyFile(target, backupTarget);
      backedUp = true;
      backupDirCreated = true;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
    written++;
    results.push({
      path: validated.normalized,
      action: before === null ? 'create' : 'modify',
      hash_before: before === null ? null : sha256(before),
      hash_after: sha256(file.content),
      backed_up: backedUp,
    });
  }

  // Manifest (even when only new files were created — it records what to
  // delete for a manual revert).
  if (results.some((r) => r.action !== 'unchanged')) {
    await mkdir(backupAbs, { recursive: true });
    backupDirCreated = true;
    await writeFile(
      path.join(backupAbs, 'manifest.json'),
      JSON.stringify({
        application_id: applicationId,
        applied_at: new Date().toISOString(),
        note: 'Files with action=modify have their pre-application originals stored alongside this manifest. Files with action=create did not exist before — delete them to revert.',
        files: results,
      }, null, 2),
      'utf8',
    );
  }

  return { backupDir: backupDirCreated ? backupRel : '', files: results, written, unchanged };
}

// ── Test command (argv array) validation ────────────────────────────────────

const SHELL_BINARIES = new Set([
  'cmd', 'cmd.exe', 'command', 'command.com',
  'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh',
  'wsl', 'wsl.exe',
]);

export type ArgvValidation = { ok: true; argv: string[] } | { ok: false; reason: string };

/**
 * Validate a user-configured test command. Must be a non-empty array of
 * strings (argv — command + args, never a shell string). argv[0] may not be
 * a shell: the whole point is that the command runs via execFile with no
 * shell interpretation. Configure the runner directly, e.g.
 * ["node","--run","test"] or ["node","node_modules/vitest/vitest.mjs","run"].
 */
export function validateTestArgv(input: unknown): ArgvValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: 'test command must be a non-empty array of strings (argv: command + args)' };
  }
  if (input.length > 32) return { ok: false, reason: 'too many arguments (max 32)' };
  for (const item of input) {
    if (typeof item !== 'string' || item.length === 0) {
      return { ok: false, reason: 'every argv element must be a non-empty string' };
    }
    if (item.length > 500) return { ok: false, reason: 'argv element longer than 500 characters' };
    // eslint-disable-next-line no-control-regex
    if (/[\0\r\n]/.test(item)) return { ok: false, reason: 'control characters in argv' };
  }
  const argv = input as string[];
  const cmdBase = path.basename(argv[0]).toLowerCase();
  if (SHELL_BINARIES.has(cmdBase)) {
    return {
      ok: false,
      reason: `"${argv[0]}" is a shell — configure the test runner directly (no shell strings). ` +
        'Examples: ["node","--run","test"], ["node","node_modules/vitest/vitest.mjs","run"], ["pytest","-q"].',
    };
  }
  return { ok: true, argv };
}

// ── Test-run environment (allowlist, documented) ────────────────────────────

/**
 * Environment allowlist for test runs. Script-sandbox discipline, widened
 * with ONLY what test runners genuinely need:
 *   • PATH/PATHEXT + OS essentials — find node/python and their shims
 *   • HOME/USERPROFILE + TEMP/TMP — tools write caches and temp files
 *   • APPDATA/LOCALAPPDATA/XDG_* — npm/pnpm/yarn/pip cache locations
 * Everything else — API keys, DATABASE_URL, NODE_OPTIONS (could inject
 * --inspect/--require), tokens — is deliberately NOT inherited.
 */
export const TEST_ENV_KEEP = [
  'PATH', 'Path', 'PATHEXT',
  'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'windir', 'COMSPEC', 'ComSpec',
  'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME',
  'LANG', 'LC_ALL', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
  'USER', 'LOGNAME', 'SHELL',
] as const;

export function buildTestEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of TEST_ENV_KEEP) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  env.CI = 'true';
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  return env;
}

// ── Real test execution ─────────────────────────────────────────────────────

export const TEST_RUN_LIMITS = {
  timeout_ms: 5 * 60 * 1000,           // 5-minute hard timeout
  max_output_bytes: 1024 * 1024,        // 1 MB capture cap (execFile maxBuffer)
  output_tail_chars: 16_000,            // stored/echoed tail per stream
  environment: 'allowlist only (PATH/HOME/TEMP/APPDATA + OS essentials; CI=true) — no server env vars, API keys, or NODE_OPTIONS',
  execution: 'execFile with an argv array in the workspace dir — never a shell',
} as const;

export type ExecFileImpl = typeof nodeExecFile;

export interface TestRunResult {
  ran: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  stdoutTail: string;
  stderrTail: string;
  outputTruncated: boolean;
  spawnError?: string;
  /** Honest operator hint for known platform gotchas (npm .cmd shims on Windows). */
  hint?: string;
}

function tail(s: string): string {
  return s.length > TEST_RUN_LIMITS.output_tail_chars
    ? `… [earlier output truncated]\n${s.slice(-TEST_RUN_LIMITS.output_tail_chars)}`
    : s;
}

const WINDOWS_CMD_SHIMS = /^(npm|pnpm|yarn|npx)(\.cmd)?$/i;

/**
 * Run the user-configured test command in the workspace via execFile.
 * No shell — argv[0] is spawned directly with argv.slice(1) as arguments.
 */
export async function runProjectTests(params: {
  argv: string[];
  cwd: string;
  timeoutMs?: number;
  execFileImpl?: ExecFileImpl;
}): Promise<TestRunResult> {
  const execFileImpl = params.execFileImpl ?? nodeExecFile;
  const timeoutMs = Math.min(params.timeoutMs ?? TEST_RUN_LIMITS.timeout_ms, TEST_RUN_LIMITS.timeout_ms);
  const started = Date.now();

  return new Promise<TestRunResult>((resolve) => {
    execFileImpl(
      params.argv[0],
      params.argv.slice(1),
      {
        cwd: params.cwd,
        timeout: timeoutMs,
        maxBuffer: TEST_RUN_LIMITS.max_output_bytes,
        env: buildTestEnv(),
        windowsHide: true,
      },
      (err: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
        const durationMs = Date.now() - started;
        const stdoutTail = tail(String(stdout ?? ''));
        const stderrTail = tail(String(stderr ?? ''));
        if (!err) {
          resolve({ ran: true, exitCode: 0, durationMs, timedOut: false, stdoutTail, stderrTail, outputTruncated: false });
          return;
        }
        const timedOut = !!err.killed && durationMs >= timeoutMs - 250;
        if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          resolve({
            ran: true, exitCode: null, durationMs, timedOut: false,
            stdoutTail, stderrTail, outputTruncated: true,
            spawnError: `output exceeded the ${TEST_RUN_LIMITS.max_output_bytes}-byte capture cap — run was terminated`,
          });
          return;
        }
        const spawnFailed = typeof err.code === 'string';
        let hint: string | undefined;
        if (spawnFailed && process.platform === 'win32' && WINDOWS_CMD_SHIMS.test(path.basename(params.argv[0]))) {
          hint = 'On Windows, npm/pnpm/yarn/npx are .cmd shims that cannot be spawned without a shell (and ANTON never uses a shell). ' +
            'Use ["node","--run","<script>"] (Node 22+ runs package.json scripts directly) or invoke the runner binary, e.g. ["node","node_modules/vitest/vitest.mjs","run"].';
        }
        resolve({
          ran: !spawnFailed,
          exitCode: typeof err.code === 'number' ? err.code : null,
          durationMs,
          timedOut,
          stdoutTail,
          stderrTail,
          outputTruncated: false,
          spawnError: spawnFailed ? `${err.code}: ${err.message}` : undefined,
          hint,
        });
      },
    );
  });
}

// ── Test-summary parsing (heuristic, honest about recognition) ──────────────

export interface TestSummary {
  pass_count: number;
  fail_count: number;
  skip_count: number;
  /** false = counts could not be parsed from the output; only the exit code is authoritative. */
  recognized: boolean;
}

/**
 * Best-effort extraction of pass/fail/skip counts from common runner output
 * (vitest, jest, mocha, pytest, go test, cargo). The exit code remains the
 * authority on pass/fail; when nothing matches, recognized=false and all
 * counts are 0 — never fabricated.
 */
export function parseTestSummary(output: string): TestSummary {
  const text = output.slice(-TEST_RUN_LIMITS.output_tail_chars);
  let pass = 0; let fail = 0; let skip = 0; let recognized = false;

  // vitest/jest summary lines: "Tests  3 failed | 39 passed (42)" /
  // "Tests:       1 failed, 41 passed, 42 total"
  const summaryLine = text.match(/Tests:?\s+([^\n]*)/g)?.pop();
  const scope = summaryLine ?? text;

  const passM = [...scope.matchAll(/(\d+)\s+pass(?:ed|ing)?\b/gi)].pop();
  const failM = [...scope.matchAll(/(\d+)\s+fail(?:ed|ing|ures?)?\b/gi)].pop();
  const skipM = [...scope.matchAll(/(\d+)\s+(?:skipped|pending|todo|ignored)\b/gi)].pop();

  if (passM) { pass = parseInt(passM[1], 10); recognized = true; }
  if (failM) { fail = parseInt(failM[1], 10); recognized = true; }
  if (skipM) { skip = parseInt(skipM[1], 10); recognized = true; }

  return { pass_count: pass, fail_count: fail, skip_count: skip, recognized };
}

// ── Application record construction (pure — easy to test) ───────────────────

export interface ApplicationFileEntry {
  path: string;
  action: FileAction;
  bytes: number;
  hash_new: string;
  hash_before: string | null;
  hash_after?: string;
  content?: string;
}

export interface ApplicationRecord {
  files: ApplicationFileEntry[];
  diff_summary: {
    per_file: Record<string, DiffStats & { action: FileAction }>;
    totals: { files: number; create: number; modify: number; unchanged: number; lines_added: number; lines_removed: number; lines_modified: number };
  };
}

/**
 * Build the persistable application record from parsed files + their
 * current-workspace diffs. content is retained while 'proposed' so approve
 * writes exactly what was reviewed.
 */
export function buildApplicationRecord(
  files: ParsedFileBlock[],
  diffs: FileDiff[],
  oldContents: Map<string, string | null>,
): ApplicationRecord {
  const perFile: ApplicationRecord['diff_summary']['per_file'] = {};
  const totals = { files: files.length, create: 0, modify: 0, unchanged: 0, lines_added: 0, lines_removed: 0, lines_modified: 0 };
  const diffByPath = new Map(diffs.map((d) => [d.path, d]));

  const entries: ApplicationFileEntry[] = files.map((f) => {
    const diff = diffByPath.get(f.path);
    const action: FileAction = diff?.action ?? 'create';
    if (diff) {
      perFile[f.path] = { ...diff.stats, action };
      totals.lines_added += diff.stats.linesAdded;
      totals.lines_removed += diff.stats.linesRemoved;
      totals.lines_modified += diff.stats.linesModified;
    }
    totals[action]++;
    const before = oldContents.get(f.path) ?? null;
    return {
      path: f.path,
      action,
      bytes: Buffer.byteLength(f.content, 'utf8'),
      hash_new: sha256(f.content),
      hash_before: before === null ? null : sha256(before),
      content: f.content,
    };
  });

  return { files: entries, diff_summary: { per_file: perFile, totals } };
}
