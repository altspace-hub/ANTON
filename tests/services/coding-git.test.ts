/**
 * coding-git.test.ts — ANTON Studio REAL GIT service (Studio P6).
 *
 * NO real git, NO real spawn: a FAKE execFile records every git argv and returns
 * canned stdout/exit per call. The workspace is a REAL temp dir added to
 * ALLOWED_FOLDER_PATHS so validateWorkspacePath (reused, not reinvented) passes.
 * We assert:
 *   - ensureRepo runs `git init` + local config + writes .gitignore when NOT a repo
 *   - ensureRepo is a no-op (alreadyRepo) when already a work tree
 *   - the branch slug is studio/r<NN>-<slug> (create vs switch-existing)
 *   - commitTask: add -A → commit → rev-parse HEAD captures the hash
 *   - commitTask nothingToCommit path (no staged diff) returns WITHOUT a commit
 *   - gitStatus parses --porcelain=v2 --branch (branch / ahead / dirty count)
 *   - gitStatus is tolerant of a non-repo (isRepo:false + note)
 *   - the pure parsers (slug / porcelain / log) are deterministic
 *   - NO call ever uses a shell (argv[0] is always 'git')
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExecFileImpl } from '../../server/services/coding-workspace.js';
import {
  ensureRepo,
  checkoutReleaseBranch,
  commitTask,
  gitStatus,
  listCommits,
  slugifyReleaseName,
  releaseBranchName,
  taskCommitMessage,
  parsePorcelainV2,
  parseLog,
} from '../../server/services/coding-git.js';

// ── A programmable fake execFile (records argv; returns per-call canned output) ─
interface GitCall { args: string[]; cwd: string }

interface FakeResponse {
  /** Exit code: 0 = ok; non-zero → an ExecFileException with .code = exit. */
  code?: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Build a fake execFile. `responder` maps a git subcommand argv → a canned
 * response. Default = exit 0, empty stdout. Records every call into `calls`.
 */
function makeFakeExec(
  calls: GitCall[],
  responder: (args: string[], cwd: string) => FakeResponse,
): ExecFileImpl {
  // The real signature is execFile(file, args, options, callback). We only use
  // that 4-arg form in coding-git.ts.
  const fn = ((file: string, args: string[], _options: unknown, cb: (e: unknown, out: string, err: string) => void) => {
    // Assert no shell ever — argv[0] must be the git binary.
    expect(file).toBe('git');
    const cwd = (typeof _options === 'object' && _options && 'cwd' in _options ? String((_options as { cwd: unknown }).cwd) : '');
    calls.push({ args, cwd });
    const r = responder(args, cwd);
    const code = r.code ?? 0;
    queueMicrotask(() => {
      if (code === 0) {
        cb(null, r.stdout ?? '', r.stderr ?? '');
      } else {
        const err = Object.assign(new Error(r.stderr ?? 'git failed'), { code });
        cb(err, r.stdout ?? '', r.stderr ?? '');
      }
    });
    return undefined as never;
  }) as unknown as ExecFileImpl;
  return fn;
}

function sub(args: string[]): string {
  return args[0] ?? '';
}

// ── A real temp workspace inside ALLOWED_FOLDER_PATHS ─────────────────────────
let ws = '';
const savedAllowed = process.env.ALLOWED_FOLDER_PATHS;

beforeAll(async () => {
  ws = await mkdtemp(path.join(tmpdir(), 'anton-git-test-'));
  // Add the temp dir to the allowlist so validateWorkspacePath passes.
  process.env.ALLOWED_FOLDER_PATHS = ws;
});

afterAll(async () => {
  if (savedAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
  else process.env.ALLOWED_FOLDER_PATHS = savedAllowed;
  if (ws) await rm(ws, { recursive: true, force: true }).catch(() => {});
});

// ── Pure parsers (no FS / no exec) ───────────────────────────────────────────
describe('coding-git pure helpers', () => {
  it('slugifyReleaseName produces a ref-safe slug', () => {
    expect(slugifyReleaseName('MVP — Core Build!')).toBe('mvp-core-build');
    expect(slugifyReleaseName('   ')).toBe('release');
    expect(slugifyReleaseName('A'.repeat(100)).length).toBeLessThanOrEqual(48);
    expect(slugifyReleaseName('trailing---')).toBe('trailing');
  });

  it('releaseBranchName zero-pads the number and prefixes studio/', () => {
    expect(releaseBranchName(1, 'First Release')).toBe('studio/r01-first-release');
    expect(releaseBranchName(12, 'Big One')).toBe('studio/r12-big-one');
    expect(releaseBranchName(0, 'x')).toBe('studio/r01-x'); // clamp to >=1
  });

  it('taskCommitMessage is a conventional commit', () => {
    expect(taskCommitMessage(3, 'Add the thing')).toBe('feat(task 3): Add the thing');
    expect(taskCommitMessage('', '   ')).toBe('feat(task): task');
  });

  it('parsePorcelainV2 reads branch / ahead / dirty count', () => {
    const out = [
      '# branch.oid abc123',
      '# branch.head studio/r01-mvp',
      '# branch.ab +2 -0',
      '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
      '? untracked.txt',
      '2 R. N... 100644 100644 100644 ccc ddd R100 new.ts\told.ts',
    ].join('\n');
    const p = parsePorcelainV2(out);
    expect(p.branch).toBe('studio/r01-mvp');
    expect(p.ahead).toBe(2);
    expect(p.dirtyFiles).toBe(3); // 1 changed + 1 untracked + 1 rename
  });

  it('parseLog splits %h<US>%s lines', () => {
    const out = `abc1234\x1ffeat(task 1): first\ndef5678\x1ffeat(task 2): second\n`;
    const commits = parseLog(out);
    expect(commits).toEqual([
      { hash: 'abc1234', subject: 'feat(task 1): first' },
      { hash: 'def5678', subject: 'feat(task 2): second' },
    ]);
  });
});

// ── ensureRepo ────────────────────────────────────────────────────────────────
describe('ensureRepo', () => {
  let calls: GitCall[];
  beforeEach(() => { calls = []; });

  it('inits the repo + sets local config + writes .gitignore when NOT a repo', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'rev-parse' && args.includes('--is-inside-work-tree')) {
        return { code: 128, stderr: 'not a git repository' }; // NOT a repo
      }
      return { code: 0, stdout: '' };
    });
    const result = await ensureRepo(ws, exec);
    expect(result).toEqual({ initialized: true, alreadyRepo: false });
    // git init ran.
    expect(calls.some((c) => c.args[0] === 'init')).toBe(true);
    // LOCAL config (never --global).
    const cfg = calls.filter((c) => c.args[0] === 'config');
    expect(cfg.length).toBe(2);
    expect(cfg.every((c) => !c.args.includes('--global'))).toBe(true);
    expect(cfg.some((c) => c.args.includes('user.name'))).toBe(true);
    expect(cfg.some((c) => c.args.includes('user.email'))).toBe(true);
    // .gitignore was written.
    await access(path.join(ws, '.gitignore'));
    const ignore = await readFile(path.join(ws, '.gitignore'), 'utf8');
    expect(ignore).toContain('node_modules/');
    expect(ignore).toContain('.anton-coding-backup/');
    // Clean up the .gitignore for the idempotent test below.
    await rm(path.join(ws, '.gitignore'), { force: true });
  });

  it('is a no-op (alreadyRepo) when the workspace IS the repo root', async () => {
    const exec = makeFakeExec(calls, (args, cwd) => {
      if (sub(args) === 'rev-parse' && args.includes('--is-inside-work-tree')) {
        return { code: 0, stdout: 'true\n' };
      }
      // The toplevel IS the workspace → this workspace is its own repo root.
      if (sub(args) === 'rev-parse' && args.includes('--show-toplevel')) {
        return { code: 0, stdout: cwd + '\n' };
      }
      return { code: 0, stdout: '' };
    });
    const result = await ensureRepo(ws, exec);
    expect(result).toEqual({ initialized: false, alreadyRepo: true });
    expect(calls.some((c) => c.args[0] === 'init')).toBe(false);
    expect(calls.some((c) => c.args[0] === 'config')).toBe(false);
  });

  it('inits a DEDICATED repo when the workspace is nested inside an ENCLOSING repo', async () => {
    // The regression for the dogfood incident: a workspace under the ANTON repo
    // reports --is-inside-work-tree=true but --show-toplevel = the PARENT repo,
    // so the studio must `git init` its own nested repo, never touch the parent.
    const exec = makeFakeExec(calls, (args, cwd) => {
      if (sub(args) === 'rev-parse' && args.includes('--is-inside-work-tree')) {
        return { code: 0, stdout: 'true\n' };
      }
      if (sub(args) === 'rev-parse' && args.includes('--show-toplevel')) {
        return { code: 0, stdout: path.dirname(cwd) + '\n' }; // an ENCLOSING repo
      }
      return { code: 0, stdout: '' };
    });
    const result = await ensureRepo(ws, exec);
    expect(result).toEqual({ initialized: true, alreadyRepo: false });
    expect(calls.some((c) => c.args[0] === 'init')).toBe(true); // dedicated repo created
    await rm(path.join(ws, '.gitignore'), { force: true }).catch(() => {});
  });

  it('throws GitError when git init fails', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'rev-parse') return { code: 128, stderr: 'not a repo' };
      if (sub(args) === 'init') return { code: 1, stderr: 'permission denied' };
      return { code: 0 };
    });
    await expect(ensureRepo(ws, exec)).rejects.toThrow(/git init failed/);
  });
});

// ── checkoutReleaseBranch ─────────────────────────────────────────────────────
describe('checkoutReleaseBranch', () => {
  let calls: GitCall[];
  beforeEach(() => { calls = []; });

  it('creates the branch (checkout -b) when it does not exist', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'rev-parse' && args.includes('--verify')) {
        return { code: 1, stdout: '' }; // branch does NOT exist
      }
      return { code: 0, stdout: '' };
    });
    const r = await checkoutReleaseBranch(ws, 1, 'Core MVP', exec);
    expect(r.branch).toBe('studio/r01-core-mvp');
    expect(r.switchedExisting).toBe(false);
    const co = calls.find((c) => c.args[0] === 'checkout');
    expect(co?.args).toEqual(['checkout', '-b', 'studio/r01-core-mvp']);
  });

  it('switches to an existing branch (no -b, never -B reset)', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'rev-parse' && args.includes('--verify')) {
        return { code: 0, stdout: 'abc123\n' }; // branch EXISTS
      }
      return { code: 0, stdout: '' };
    });
    const r = await checkoutReleaseBranch(ws, 2, 'Phase Two', exec);
    expect(r.switchedExisting).toBe(true);
    const co = calls.find((c) => c.args[0] === 'checkout');
    expect(co?.args).toEqual(['checkout', 'studio/r02-phase-two']);
    // Crucial: never -B (which would reset the branch to HEAD).
    expect(co?.args).not.toContain('-B');
  });
});

// ── commitTask ────────────────────────────────────────────────────────────────
describe('commitTask', () => {
  let calls: GitCall[];
  beforeEach(() => { calls = []; });

  it('add -A → commit → captures the HEAD hash', async () => {
    const HASH = 'deadbeefcafe1234deadbeefcafe1234deadbeef';
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'add') return { code: 0 };
      if (sub(args) === 'diff' && args.includes('--cached')) return { code: 1 }; // there ARE staged changes
      if (sub(args) === 'commit') return { code: 0, stdout: '[studio/r01-mvp abcdef] feat\n' };
      if (sub(args) === 'rev-parse' && args.includes('HEAD')) return { code: 0, stdout: `${HASH}\n` };
      return { code: 0 };
    });
    const r = await commitTask(ws, { taskNumber: 1, title: 'Add the module' }, exec);
    expect(r.committed).toBe(true);
    expect(r.nothingToCommit).toBe(false);
    expect(r.hash).toBe(HASH);
    // add -A then commit -m <conventional> ran.
    expect(calls.some((c) => c.args.join(' ') === 'add -A')).toBe(true);
    const commit = calls.find((c) => c.args[0] === 'commit');
    expect(commit?.args).toEqual(['commit', '-m', 'feat(task 1): Add the module']);
  });

  it('returns nothingToCommit (no error) when there is no staged diff', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'add') return { code: 0 };
      if (sub(args) === 'diff' && args.includes('--cached')) return { code: 0 }; // exit 0 = NOTHING staged
      return { code: 0 };
    });
    const r = await commitTask(ws, { taskNumber: 2, title: 'No-op task' }, exec);
    expect(r).toEqual({ committed: false, hash: null, nothingToCommit: true });
    // No commit was attempted.
    expect(calls.some((c) => c.args[0] === 'commit')).toBe(false);
  });

  it('throws GitError when git add fails', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'add') return { code: 1, stderr: 'fatal: pathspec' };
      return { code: 0 };
    });
    await expect(commitTask(ws, { taskNumber: 1, title: 'x' }, exec)).rejects.toThrow(/git add -A failed/);
  });
});

// ── gitStatus / listCommits ───────────────────────────────────────────────────
describe('gitStatus', () => {
  let calls: GitCall[];
  beforeEach(() => { calls = []; });

  it('parses porcelain v2 + the short log for a repo', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'rev-parse' && args.includes('--is-inside-work-tree')) return { code: 0, stdout: 'true\n' };
      if (sub(args) === 'status') {
        return { code: 0, stdout: ['# branch.head studio/r01-mvp', '# branch.ab +1 -0', '1 .M N... 1 1 1 a b src/a.ts', '? new.txt'].join('\n') };
      }
      if (sub(args) === 'log') {
        return { code: 0, stdout: `abc1234\x1ffeat(task 1): first\n` };
      }
      return { code: 0 };
    });
    const s = await gitStatus(ws, exec);
    expect(s.isRepo).toBe(true);
    expect(s.branch).toBe('studio/r01-mvp');
    expect(s.ahead).toBe(1);
    expect(s.dirtyFiles).toBe(2);
    expect(s.lastCommits).toEqual([{ hash: 'abc1234', subject: 'feat(task 1): first' }]);
  });

  it('is tolerant of a non-repo (isRepo:false + note)', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'rev-parse' && args.includes('--is-inside-work-tree')) {
        return { code: 128, stderr: 'not a git repository' };
      }
      return { code: 0 };
    });
    const s = await gitStatus(ws, exec);
    expect(s.isRepo).toBe(false);
    expect(s.branch).toBeNull();
    expect(s.lastCommits).toEqual([]);
    expect(s.note).toBeTruthy();
    // It must NOT have called status/log on a non-repo.
    expect(calls.some((c) => c.args[0] === 'status')).toBe(false);
  });

  it('listCommits returns [] on an empty repo (log exits non-zero)', async () => {
    const exec = makeFakeExec(calls, (args) => {
      if (sub(args) === 'log') return { code: 128, stderr: 'no HEAD' };
      return { code: 0 };
    });
    const commits = await listCommits(ws, 5, exec);
    expect(commits).toEqual([]);
  });
});

// ── Path-validation gate (reuse, not reinvent) ────────────────────────────────
describe('workspace allowlist gate', () => {
  it('rejects a workspace outside ALLOWED_FOLDER_PATHS', async () => {
    const calls: GitCall[] = [];
    const exec = makeFakeExec(calls, () => ({ code: 0 }));
    const outside = path.join(tmpdir(), 'definitely-not-allowed-' + Date.now());
    await expect(ensureRepo(outside, exec)).rejects.toThrow();
    // No git was ever spawned for a disallowed path.
    expect(calls.length).toBe(0);
  });
});
