// ── ANTON Studio — REAL GIT (Studio P6 parity) ────────────────────────────
//
// branch-per-release / commit-per-task over a Studio project's bound workspace.
// CODING_STUDIO_DESIGN_2026-06-13.md §E.3: the git_* columns exist but nothing
// ever created branches/commits — backups were a flat .anton-coding-backup/ dir.
// This wires git into the autonomous orchestrator: ensureRepo at first advance,
// a release branch on entering a release, a commit after each task goes green.
//
// Security posture (mirrors coding-workspace.ts EXACTLY):
//   • NO shell, ever. Every git call is execFile('git', [argv…], {cwd}) —
//     argv as an array, never a shell string, never shell:true. Injectable
//     execFileImpl so tests record argv and return canned stdout (no real spawn).
//   • The workspace dir is validated against the SAME allowed bases as the rest
//     of Studio (getAllowedBases / validateWorkspacePath from coding-workspace)
//     BEFORE any FS or git touch — no env-default fallback, fail-closed.
//   • No secrets are ever logged. git config sets a LOCAL (not --global) author.
//   • A git failure is bookkeeping, not the product: callers treat it as
//     non-fatal (the orchestrator logs git_error and continues).

import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseAdapter } from '../db/database.js';
import { validateWorkspacePath, type ExecFileImpl } from './coding-workspace.js';

// ── Constants ─────────────────────────────────────────────────────────────

/** Local (per-repo) commit identity — never --global. */
const STUDIO_GIT_NAME = 'ANTON Studio';
const STUDIO_GIT_EMAIL = 'studio@anton.local';

/** Wall-clock cap per git invocation (git is local + fast; a hang is a bug). */
const GIT_TIMEOUT_MS = 30_000;
/** Capture cap — a porcelain status / short log is tiny; guard against runaway. */
const GIT_MAX_BUFFER = 8 * 1024 * 1024; // 8 MB

/** Branch-slug clamp — keep refs short + filesystem-safe. */
const MAX_SLUG_LEN = 48;
const MAX_BRANCH_LEN = 80;

/** ASCII unit separator used between %h and %s in git log (no shell quoting). */
const LOG_SEP = '\x1f';

const GITIGNORE_CONTENT = `# ANTON Studio — generated .gitignore (do not commit build artifacts / deps).
node_modules/
.anton-coding-backup/
dist/
build/
target/
__pycache__/
*.pyc
.venv/
venv/
.env
.env.local
`;

/**
 * Path equality for the repo-root check. `git rev-parse --show-toplevel` returns
 * a forward-slash absolute path; compare it to the resolved workspace, normalising
 * separators + trailing slash, case-insensitively on Windows.
 */
function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => {
    let n = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
    if (process.platform === 'win32') n = n.toLowerCase();
    return n;
  };
  return norm(a) === norm(b);
}

// ── Exec helper (no shell, injectable) ──────────────────────────────────────

interface GitExecResult {
  /** True when git exited 0. */
  ok: boolean;
  stdout: string;
  stderr: string;
  /** execFile error code (number exit code, or a spawn-error string like 'ENOENT'). */
  code: number | string | null;
}

/**
 * Run one git invocation in the workspace via execFile — NEVER a shell.
 * argv[0] is the binary ('git'); the rest are passed verbatim. Resolves (never
 * rejects) with a GitExecResult so callers branch on ok without try/catch noise.
 */
function runGit(
  workspaceAbs: string,
  args: string[],
  execFileImpl: ExecFileImpl,
): Promise<GitExecResult> {
  return new Promise<GitExecResult>((resolve) => {
    execFileImpl(
      'git',
      args,
      {
        cwd: workspaceAbs,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
        // Keep git non-interactive: never prompt for credentials / pager.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat' },
      },
      (err: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
        const out = String(stdout ?? '');
        const errOut = String(stderr ?? '');
        if (!err) { resolve({ ok: true, stdout: out, stderr: errOut, code: 0 }); return; }
        resolve({
          ok: false,
          stdout: out,
          stderr: errOut,
          code: typeof err.code === 'number' || typeof err.code === 'string' ? err.code : null,
        });
      },
    );
  });
}

/** A git error surfaced to callers — message carries the trimmed stderr (no secrets). */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

// ── Path validation (reuse coding-workspace, do NOT reinvent the allowlist) ──

/**
 * Validate that workspaceAbs is bound, absolute, and inside the SAME allowed
 * bases coding-workspace enforces (ALLOWED_FOLDER_PATHS + the Studio root).
 * Returns the resolved absolute dir or throws GitError — fail closed.
 */
async function ensureAllowedWorkspace(workspaceAbs: string | null | undefined): Promise<string> {
  const v = await validateWorkspacePath(workspaceAbs);
  if (!v.ok || !v.resolved) {
    throw new GitError(v.error ?? 'workspace is not available or not permitted');
  }
  return v.resolved;
}

// ── Slug / branch naming (deterministic, ref-safe) ──────────────────────────

/**
 * Slugify a release name into a short, git-ref-safe token: lowercase, ASCII
 * alphanumerics + hyphens, no leading/trailing/double hyphens, length-clamped.
 * Empty input → 'release'.
 */
export function slugifyReleaseName(name: string): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, '');
  return slug || 'release';
}

/** The branch name for a release: studio/r<NN>-<slug>, zero-padded, clamped. */
export function releaseBranchName(releaseNumber: number, releaseName: string): string {
  const n = Number.isFinite(releaseNumber) && releaseNumber > 0 ? Math.floor(releaseNumber) : 1;
  const nn = String(n).padStart(2, '0');
  const slug = slugifyReleaseName(releaseName);
  return `studio/r${nn}-${slug}`.slice(0, MAX_BRANCH_LEN).replace(/-+$/g, '');
}

/** A conventional commit message for a finished task. */
export function taskCommitMessage(taskNumber: number | string, title: string): string {
  const num = String(taskNumber ?? '').trim();
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'task';
  const scope = num ? `task ${num}` : 'task';
  return `feat(${scope}): ${clean}`;
}

// ── Public results ──────────────────────────────────────────────────────────

export interface EnsureRepoResult {
  /** True if THIS call ran `git init` (a new repo was created). */
  initialized: boolean;
  /** True if the dir was already a git work tree before this call. */
  alreadyRepo: boolean;
}

export interface CheckoutBranchResult {
  branch: string;
  /** True if the branch already existed and we switched to it. */
  switchedExisting: boolean;
}

export interface CommitTaskResult {
  committed: boolean;
  hash: string | null;
  /** True when there was nothing staged to commit — an honest no-op, NOT an error. */
  nothingToCommit: boolean;
}

export interface GitCommitSummary {
  hash: string;
  subject: string;
}

export interface GitStatusSummary {
  isRepo: boolean;
  branch: string | null;
  /** Commits ahead of upstream (0 when no upstream / not a repo). */
  ahead: number;
  /** Count of tracked-modified + untracked entries in the work tree. */
  dirtyFiles: number;
  lastCommits: GitCommitSummary[];
  /** Set when not a repo, to explain the empty shape to the UI. */
  note?: string;
}

// ── ensureRepo ───────────────────────────────────────────────────────────────

/**
 * Make the workspace a git repo if it is not one already: `git init`, set a
 * LOCAL author identity, and write a sane .gitignore (only if absent). Persists
 * coding_projects.git_initialized = 1 when db + codingProjectId are supplied.
 * Idempotent — a no-op (alreadyRepo) on an existing work tree.
 */
export async function ensureRepo(
  workspaceAbs: string,
  execFileImpl: ExecFileImpl = nodeExecFile,
  db?: DatabaseAdapter,
  codingProjectId?: string,
): Promise<EnsureRepoResult> {
  const resolved = await ensureAllowedWorkspace(workspaceAbs);

  // "Inside a work tree" is NOT enough — a Studio workspace nested under another
  // repo (e.g. CODING_STUDIO_ROOT under the ANTON repo) would otherwise make the
  // studio operate on the ENCLOSING repo (its `git add -A` / branch / commit hit
  // the parent). Only treat it as already-a-repo when the workspace IS the repo
  // ROOT; otherwise `git init` a DEDICATED (nested) repo so the studio is isolated.
  const inside = await runGit(resolved, ['rev-parse', '--is-inside-work-tree'], execFileImpl);
  let alreadyRepo = false;
  if (inside.ok && inside.stdout.trim() === 'true') {
    const top = await runGit(resolved, ['rev-parse', '--show-toplevel'], execFileImpl);
    alreadyRepo = top.ok && samePath(top.stdout.trim(), resolved);
  }

  let initialized = false;
  if (!alreadyRepo) {
    const init = await runGit(resolved, ['init'], execFileImpl);
    if (!init.ok) {
      throw new GitError(`git init failed: ${init.stderr.trim() || init.code}`);
    }
    initialized = true;

    // LOCAL identity (never --global) so commits do not depend on the operator's
    // global git config and never mutate it.
    const cfgName = await runGit(resolved, ['config', 'user.name', STUDIO_GIT_NAME], execFileImpl);
    if (!cfgName.ok) throw new GitError(`git config user.name failed: ${cfgName.stderr.trim() || cfgName.code}`);
    const cfgEmail = await runGit(resolved, ['config', 'user.email', STUDIO_GIT_EMAIL], execFileImpl);
    if (!cfgEmail.ok) throw new GitError(`git config user.email failed: ${cfgEmail.stderr.trim() || cfgEmail.code}`);

    // .gitignore — only write when absent so we never clobber a user's file.
    const gitignorePath = path.join(resolved, '.gitignore');
    let exists = true;
    try { await access(gitignorePath); } catch { exists = false; }
    if (!exists) {
      await writeFile(gitignorePath, GITIGNORE_CONTENT, 'utf8');
    }
  }

  if (db && codingProjectId) {
    await db.run(
      'UPDATE coding_projects SET git_initialized = 1, updated_at = NOW() WHERE id = ?',
      codingProjectId,
    ).catch(() => { /* persistence must never break the build loop */ });
  }

  return { initialized, alreadyRepo };
}

// ── checkoutReleaseBranch ────────────────────────────────────────────────────

/**
 * Create or switch to studio/r<NN>-<slug> for a release. Idempotent: if the
 * branch already exists, switch to it; otherwise create it. Persists the branch
 * name to coding_releases.git_branch when db + releaseId are supplied.
 */
export async function checkoutReleaseBranch(
  workspaceAbs: string,
  releaseNumber: number,
  releaseName: string,
  execFileImpl: ExecFileImpl = nodeExecFile,
  db?: DatabaseAdapter,
  releaseId?: string,
): Promise<CheckoutBranchResult> {
  const resolved = await ensureAllowedWorkspace(workspaceAbs);
  const branch = releaseBranchName(releaseNumber, releaseName);

  // Does the branch already exist? `git rev-parse --verify --quiet refs/heads/<b>`
  // exits 0 if it does, non-zero otherwise (and prints nothing on failure).
  const verify = await runGit(resolved, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], execFileImpl);
  const exists = verify.ok && verify.stdout.trim().length > 0;

  // `git checkout -B <branch>` would reset an existing branch to HEAD; we DON'T
  // want that. Switch when it exists; create with -b when it does not.
  const args = exists ? ['checkout', branch] : ['checkout', '-b', branch];
  const co = await runGit(resolved, args, execFileImpl);
  if (!co.ok) {
    throw new GitError(`git checkout ${branch} failed: ${co.stderr.trim() || co.code}`);
  }

  if (db && releaseId) {
    await db.run(
      'UPDATE coding_releases SET git_branch = ?, updated_at = NOW() WHERE id = ?',
      branch, releaseId,
    ).catch(() => { /* persistence must never break the build loop */ });
  }

  return { branch, switchedExisting: exists };
}

// ── commitTask ────────────────────────────────────────────────────────────────

/**
 * Stage everything and commit the finished task. Returns nothingToCommit:true
 * (NOT an error) when there is no diff — a no-op task makes no commit, honestly.
 * Captures the resulting HEAD hash and persists it + the current branch to
 * coding_tasks when db + taskId are supplied.
 */
export async function commitTask(
  workspaceAbs: string,
  task: { taskNumber: number | string; title: string },
  execFileImpl: ExecFileImpl = nodeExecFile,
  db?: DatabaseAdapter,
  taskId?: string,
): Promise<CommitTaskResult> {
  const resolved = await ensureAllowedWorkspace(workspaceAbs);

  const add = await runGit(resolved, ['add', '-A'], execFileImpl);
  if (!add.ok) {
    throw new GitError(`git add -A failed: ${add.stderr.trim() || add.code}`);
  }

  // Anything staged? `git diff --cached --quiet` exits 0 when nothing is staged,
  // 1 when there are staged changes. Honest no-op path when nothing changed.
  const staged = await runGit(resolved, ['diff', '--cached', '--quiet'], execFileImpl);
  const hasStaged = staged.code === 1; // exit 1 = there ARE staged changes
  if (!hasStaged) {
    return { committed: false, hash: null, nothingToCommit: true };
  }

  const message = taskCommitMessage(task.taskNumber, task.title);
  const commit = await runGit(resolved, ['commit', '-m', message], execFileImpl);
  if (!commit.ok) {
    throw new GitError(`git commit failed: ${commit.stderr.trim() || commit.code}`);
  }

  const head = await runGit(resolved, ['rev-parse', 'HEAD'], execFileImpl);
  const hash = head.ok ? head.stdout.trim() || null : null;

  let branch: string | null = null;
  if (db && taskId) {
    const br = await runGit(resolved, ['rev-parse', '--abbrev-ref', 'HEAD'], execFileImpl);
    branch = br.ok ? br.stdout.trim() || null : null;
    await db.run(
      'UPDATE coding_tasks SET git_commit_hash = ?, git_branch = ?, updated_at = NOW() WHERE id = ?',
      hash, branch, taskId,
    ).catch(() => { /* persistence must never break the build loop */ });
  }

  return { committed: true, hash, nothingToCommit: false };
}

// ── status / log (read-only, tolerant of a non-repo) ─────────────────────────

/**
 * Parse `git status --porcelain=v2 --branch` + a short log into a UI-friendly
 * summary. Tolerant of a non-repo — returns { isRepo:false } with a note.
 */
export async function gitStatus(
  workspaceAbs: string,
  execFileImpl: ExecFileImpl = nodeExecFile,
): Promise<GitStatusSummary> {
  const resolved = await ensureAllowedWorkspace(workspaceAbs);

  const probe = await runGit(resolved, ['rev-parse', '--is-inside-work-tree'], execFileImpl);
  if (!probe.ok || probe.stdout.trim() !== 'true') {
    return {
      isRepo: false, branch: null, ahead: 0, dirtyFiles: 0, lastCommits: [],
      note: 'Not a git repository yet — Studio initializes one at the first build advance.',
    };
  }

  const status = await runGit(resolved, ['status', '--porcelain=v2', '--branch'], execFileImpl);
  const parsed = parsePorcelainV2(status.ok ? status.stdout : '');

  const lastCommits = await listCommits(resolved, 10, execFileImpl);

  return {
    isRepo: true,
    branch: parsed.branch,
    ahead: parsed.ahead,
    dirtyFiles: parsed.dirtyFiles,
    lastCommits,
  };
}

interface PorcelainParse {
  branch: string | null;
  ahead: number;
  dirtyFiles: number;
}

/**
 * Parse the `--porcelain=v2 --branch` output. Branch header lines start with
 * '# branch.head <name>' and '# branch.ab +A -B'. Changed/untracked/renamed
 * entries start with '1', '2', 'u', or '?'. Pure + deterministic.
 */
export function parsePorcelainV2(text: string): PorcelainParse {
  let branch: string | null = null;
  let ahead = 0;
  let dirtyFiles = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    if (line.startsWith('# branch.head ')) {
      const name = line.slice('# branch.head '.length).trim();
      branch = name === '(detached)' ? null : name;
      continue;
    }
    if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) ahead = parseInt(m[1], 10) || 0;
      continue;
    }
    if (line.startsWith('#')) continue;
    // Entry lines: '1' (changed), '2' (renamed/copied), 'u' (unmerged), '?' (untracked).
    const head = line[0];
    if (head === '1' || head === '2' || head === 'u' || head === '?') dirtyFiles++;
  }
  return { branch, ahead, dirtyFiles };
}

/**
 * The last `limit` commits as { hash, subject }. Tolerant of an empty repo (no
 * commits yet) — returns []. Uses a unit-separator between %h and %s (no shell
 * quoting concerns: execFile passes the format string verbatim).
 */
export async function listCommits(
  workspaceAbs: string,
  limit = 10,
  execFileImpl: ExecFileImpl = nodeExecFile,
): Promise<GitCommitSummary[]> {
  const resolved = await ensureAllowedWorkspace(workspaceAbs);
  const n = Math.max(1, Math.min(100, Math.floor(Number(limit) || 10)));
  const log = await runGit(resolved, ['log', `-n`, String(n), `--pretty=%h${LOG_SEP}%s`], execFileImpl);
  if (!log.ok) return []; // empty repo (no HEAD) or non-repo → honest empty list
  return parseLog(log.stdout);
}

/** Parse the %h<US>%s log lines into commit summaries. Pure + deterministic. */
export function parseLog(text: string): GitCommitSummary[] {
  const out: GitCommitSummary[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;
    const idx = line.indexOf(LOG_SEP);
    if (idx < 0) continue;
    const hash = line.slice(0, idx).trim();
    const subject = line.slice(idx + 1);
    if (hash) out.push({ hash, subject });
  }
  return out;
}
