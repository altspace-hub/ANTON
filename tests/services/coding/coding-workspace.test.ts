/**
 * coding-workspace.test.ts — Wave 5.2 (Coding Large apply-to-workspace +
 * REAL test execution). The highest-value targets:
 *
 *   • parseFileBlocks — the LLM-output boundary (formats, nested fences,
 *     duplicates, truncated responses)
 *   • validateRelativePath / resolveTargetPath — the attack surface
 *     (.. traversal, absolute/drive/UNC paths, reserved names, backup dir)
 *   • buildFileDiff — determinism
 *   • validateTestArgv / buildTestEnv / runProjectTests — argv construction,
 *     env allowlist, execFile discipline (mocked execFile, no real spawn)
 *   • applyFilesToWorkspace — backup + hash recording (real temp dir)
 *   • buildApplicationRecord — what gets persisted for the approve gate
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FILE_BLOCK_FORMAT_VERSION,
  TEST_ENV_KEEP,
  TEST_RUN_LIMITS,
  applyFilesToWorkspace,
  buildApplicationRecord,
  buildFileDiff,
  buildTestEnv,
  compactChunks,
  getAllowedBases,
  isWriteWithinWorkspaceReal,
  parseFileBlocks,
  parseTestSummary,
  resolveTargetPath,
  runProjectTests,
  sha256,
  validateRelativePath,
  validateTestArgv,
  validateWorkspacePath,
  getCodingStudioRoot,
  buildCommandEnv,
  PROJECT_DATABASE_URL_KEY,
  probeToolchain,
  languagePreset,
  allLanguagePresets,
  venvPython,
  type ExecFileImpl,
} from '../../../server/services/coding-workspace.js';

// ── parseFileBlocks ─────────────────────────────────────────────────────────

describe('parseFileBlocks (anton-coding-file-blocks/v1)', () => {
  it('parses a // FILE: header block', () => {
    const r = parseFileBlocks('Here:\n```typescript\n// FILE: src/a.ts\nconst x = 1;\n```\n');
    expect(r.formatVersion).toBe(FILE_BLOCK_FORMAT_VERSION);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].path).toBe('src/a.ts');
    expect(r.files[0].content).toBe('const x = 1;\n');
    expect(r.files[0].language).toBe('typescript');
  });

  it('parses # FILE:, <!-- FILE: -->, -- FILE: and /* FILE: */ headers', () => {
    const text = [
      '```python\n# FILE: app/main.py\nprint("hi")\n```',
      '```html\n<!-- FILE: public/index.html -->\n<html></html>\n```',
      '```sql\n-- FILE: db/schema.sql\nSELECT 1;\n```',
      '```css\n/* FILE: styles/app.css */\nbody {}\n```',
    ].join('\n\n');
    const r = parseFileBlocks(text);
    expect(r.files.map((f) => f.path)).toEqual([
      'app/main.py', 'public/index.html', 'db/schema.sql', 'styles/app.css',
    ]);
  });

  it('ignores fenced blocks without a FILE header (prose / completion-record JSON)', () => {
    const text = '```json\n{"files_created": []}\n```\n\n```\njust an example\n```';
    const r = parseFileBlocks(text);
    expect(r.files).toHaveLength(0);
    expect(r.rejected).toHaveLength(0);
    expect(r.ignoredBlocks).toBe(2);
  });

  it('rejects blocks whose header path escapes (.. / absolute / drive)', () => {
    const text = [
      '```\n// FILE: ../outside.ts\nx\n```',
      '```\n// FILE: /etc/passwd\nx\n```',
      '```\n// FILE: C:\\Windows\\system32\\evil.dll\nx\n```',
      '```\n// FILE: \\\\server\\share\\evil.ts\nx\n```',
      '```\n// FILE: ok/../../sneaky.ts\nx\n```',
    ].join('\n');
    const r = parseFileBlocks(text);
    expect(r.files).toHaveLength(0);
    expect(r.rejected).toHaveLength(5);
    expect(r.rejected.every((x) => x.reason.length > 0)).toBe(true);
  });

  it('last block wins on duplicate paths and records the duplicate', () => {
    const text = '```\n// FILE: a.ts\nfirst\n```\n```\n// FILE: a.ts\nsecond\n```';
    const r = parseFileBlocks(text);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].content).toBe('second\n');
    expect(r.duplicates).toEqual(['a.ts']);
  });

  it('handles nested fences via fence-length rules (4 backticks outer)', () => {
    const text = '````markdown\n<!-- FILE: docs/README.md -->\n# Doc\n```js\ninner();\n```\nafter\n````';
    const r = parseFileBlocks(text);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].content).toBe('# Doc\n```js\ninner();\n```\nafter\n');
  });

  it('does NOT apply an unterminated fence (truncated response) and reports it', () => {
    const text = '```\n// FILE: src/half.ts\nconst x = 1;\n// response cut off here';
    const r = parseFileBlocks(text);
    expect(r.files).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].path).toBe('src/half.ts');
    expect(r.rejected[0].reason).toContain('unterminated');
  });

  it('tolerates CRLF line endings and blank lines before the header', () => {
    const text = '```\r\n\r\n// FILE: src/win.ts\r\nconst a = 1;\r\n```\r\n';
    const r = parseFileBlocks(text);
    expect(r.files).toHaveLength(1);
    expect(r.files[0].path).toBe('src/win.ts');
    expect(r.files[0].content).toBe('const a = 1;\n');
  });

  it('normalizes content to end with exactly one newline (deterministic writes)', () => {
    const r = parseFileBlocks('```\n// FILE: a.ts\nx\n\n\n```');
    expect(r.files[0].content).toBe('x\n');
  });

  it('is deterministic — same input produces deep-equal output', () => {
    const text = '```ts\n// FILE: src/x.ts\nlet a = 1;\nlet b = 2;\n```\n```\n// FILE: bad/../../y.ts\nz\n```';
    expect(parseFileBlocks(text)).toEqual(parseFileBlocks(text));
  });
});

// ── validateRelativePath (the attack cases) ─────────────────────────────────

describe('validateRelativePath', () => {
  const attacks: Array<[string, string]> = [
    ['../x.ts', 'traversal'],
    ['a/../../x.ts', 'traversal'],
    ['..\\x.ts', 'traversal'],
    ['a\\..\\..\\x.ts', 'traversal'],
    ['/etc/passwd', 'absolute'],
    ['\\windows\\evil.ts', 'absolute'],
    ['C:\\evil.ts', 'drive'],
    ['c:evil.ts', 'drive-relative'],
    ['\\\\server\\share\\x.ts', 'UNC'],
    ['src/\0null.ts', 'null byte'],
    ['.anton-coding-backup/x.ts', 'backup dir'],
    ['.git/hooks/pre-commit', '.git'],
    ['CON.txt', 'reserved device'],
    ['src/aux.js', 'reserved device'],
    ['src/COM1', 'reserved device'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['src/dir/', 'directory'],
    ['src/we|rd.ts', 'illegal char'],
    ['src/q?.ts', 'illegal char'],
  ];
  for (const [input, label] of attacks) {
    it(`rejects ${label}: ${JSON.stringify(input)}`, () => {
      const r = validateRelativePath(input);
      expect(r.ok).toBe(false);
    });
  }

  it('accepts and normalizes good paths', () => {
    expect(validateRelativePath('src/lib/util.ts')).toEqual({ ok: true, normalized: 'src/lib/util.ts' });
    expect(validateRelativePath('src\\lib\\util.ts')).toEqual({ ok: true, normalized: 'src/lib/util.ts' });
    expect(validateRelativePath('./src/./a.ts')).toEqual({ ok: true, normalized: 'src/a.ts' });
    expect(validateRelativePath('"src/quoted.ts"')).toEqual({ ok: true, normalized: 'src/quoted.ts' });
    expect(validateRelativePath('.gitignore')).toEqual({ ok: true, normalized: '.gitignore' });
  });
});

describe('resolveTargetPath', () => {
  const ws = path.resolve(os.tmpdir(), 'anton-ws-test');
  it('resolves inside the workspace', () => {
    expect(resolveTargetPath(ws, 'src/a.ts')).toBe(path.join(ws, 'src', 'a.ts'));
  });
  it('refuses the workspace dir itself and anything that escapes', () => {
    expect(resolveTargetPath(ws, '.')).toBeNull();
    // Even if a hostile normalized value slipped through, resolve+prefix catches it.
    expect(resolveTargetPath(ws, '../sibling.ts')).toBeNull();
    expect(resolveTargetPath(ws, 'a/../../escape.ts')).toBeNull();
  });
});

// ── Workspace allowlist validation ──────────────────────────────────────────

describe('validateWorkspacePath (ALLOWED_FOLDER_PATHS)', () => {
  it('refuses everything when ALLOWED_FOLDER_PATHS is not configured', async () => {
    const r = await validateWorkspacePath('C:\\anywhere', { } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ALLOWED_FOLDER_PATHS');
  });

  it('refuses unbound and relative paths', async () => {
    const env = { ALLOWED_FOLDER_PATHS: os.tmpdir() } as NodeJS.ProcessEnv;
    expect((await validateWorkspacePath(null, env)).ok).toBe(false);
    expect((await validateWorkspacePath('relative/dir', env)).ok).toBe(false);
  });

  it('refuses dirs outside the allowlist (prefix check, not substring)', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'anton-allow-'));
    try {
      const env = { ALLOWED_FOLDER_PATHS: base } as NodeJS.ProcessEnv;
      // Sibling dir that shares the base as a string prefix must NOT pass.
      const evil = `${base}-evil`;
      await mkdir(evil, { recursive: true });
      try {
        const r = await validateWorkspacePath(evil, env);
        expect(r.ok).toBe(false);
        expect(r.error).toContain('outside');
      } finally {
        await rm(evil, { recursive: true, force: true });
      }
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('accepts an existing directory inside an allowed base', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'anton-allow-'));
    try {
      const ws = path.join(base, 'project');
      await mkdir(ws, { recursive: true });
      const r = await validateWorkspacePath(ws, { ALLOWED_FOLDER_PATHS: base } as NodeJS.ProcessEnv);
      expect(r.ok).toBe(true);
      expect(r.resolved).toBe(path.resolve(ws));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('getAllowedBases adds NO user dirs when ALLOWED_FOLDER_PATHS is unset — only the auto-owned studio root', () => {
    // Phase 3: the ANTON Studio root is the ONE safe widening (an ANTON-owned
    // dir). User directories still stay closed when the allowlist is empty.
    const bases = getAllowedBases({ CODING_STUDIO_ROOT: 'C:\\anton\\studio' } as NodeJS.ProcessEnv);
    expect(bases).toEqual([path.resolve('C:\\anton\\studio')]);
  });
});

// ── Deterministic diff ──────────────────────────────────────────────────────

describe('buildFileDiff', () => {
  it('marks brand-new files as create with all lines added', () => {
    const d = buildFileDiff('a.ts', null, 'l1\nl2\n');
    expect(d.action).toBe('create');
    expect(d.stats.linesAdded).toBe(2);
    expect(d.chunks).toEqual([{ type: 'added', newLines: ['l1', 'l2'] }]);
  });

  it('marks identical content as unchanged with no chunks', () => {
    const d = buildFileDiff('a.ts', 'same\n', 'same\n');
    expect(d.action).toBe('unchanged');
    expect(d.chunks).toEqual([]);
    expect(d.stats.similarity).toBe(1);
  });

  it('produces a modify diff and is deterministic', () => {
    const oldC = 'a\nb\nc\n';
    const newC = 'a\nB!\nc\n';
    const d1 = buildFileDiff('a.ts', oldC, newC);
    const d2 = buildFileDiff('a.ts', oldC, newC);
    expect(d1.action).toBe('modify');
    expect(d1).toEqual(d2);
    expect(d1.stats.linesModified).toBeGreaterThan(0);
  });

  it('compactChunks truncates long unchanged runs deterministically', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const compact = compactChunks([{ type: 'unchanged', lines }]);
    expect(compact[0].lines).toHaveLength(7); // 3 head + marker + 3 tail
    expect(compact[0].lines?.[3]).toContain('24 unchanged lines');
    expect(compactChunks([{ type: 'unchanged', lines }])).toEqual(compact);
  });
});

// ── Test command argv validation ────────────────────────────────────────────

describe('validateTestArgv', () => {
  it('rejects non-arrays, empty arrays and non-string elements', () => {
    expect(validateTestArgv('npm test').ok).toBe(false);
    expect(validateTestArgv([]).ok).toBe(false);
    expect(validateTestArgv([1, 2] as unknown[]).ok).toBe(false);
    expect(validateTestArgv(['']).ok).toBe(false);
  });

  it('rejects shells as argv[0] — no shell-by-proxy', () => {
    for (const shell of ['cmd', 'cmd.exe', 'C:\\Windows\\System32\\cmd.exe', 'powershell', 'pwsh.exe', 'bash', 'sh', '/bin/bash', 'wsl.exe']) {
      const r = validateTestArgv([shell, '-c', 'echo pwned']);
      expect(r.ok, `${shell} must be rejected`).toBe(false);
    }
  });

  it('rejects control characters inside argv', () => {
    expect(validateTestArgv(['node', '--run\ntest']).ok).toBe(false);
    expect(validateTestArgv(['node', 'a\0b']).ok).toBe(false);
  });

  it('accepts direct runner invocations', () => {
    expect(validateTestArgv(['node', '--run', 'test'])).toEqual({ ok: true, argv: ['node', '--run', 'test'] });
    expect(validateTestArgv(['node', 'node_modules/vitest/vitest.mjs', 'run']).ok).toBe(true);
    expect(validateTestArgv(['pytest', '-q']).ok).toBe(true);
    expect(validateTestArgv(['cargo', 'test']).ok).toBe(true);
  });
});

// ── Test env allowlist ──────────────────────────────────────────────────────

describe('buildTestEnv', () => {
  it('keeps only allowlisted vars + deterministic CI flags', () => {
    const source = {
      PATH: '/usr/bin',
      TEMP: 'C:\\tmp',
      USERPROFILE: 'C:\\Users\\x',
      APPDATA: 'C:\\Users\\x\\AppData\\Roaming',
      ANTHROPIC_API_KEY: 'sk-ant-SECRET',
      DATABASE_URL: 'postgresql://anton:anton@localhost/anton',
      OPENAI_API_KEY: 'sk-SECRET',
      NODE_OPTIONS: '--inspect=0.0.0.0:9229',
      INSTANCE_KEY_ENCRYPTION_KEY: 'deadbeef',
    } as NodeJS.ProcessEnv;
    const env = buildTestEnv(source);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.TEMP).toBe('C:\\tmp');
    expect(env.USERPROFILE).toBe('C:\\Users\\x');
    expect(env.APPDATA).toBe('C:\\Users\\x\\AppData\\Roaming');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.INSTANCE_KEY_ENCRYPTION_KEY).toBeUndefined();
    expect(env.CI).toBe('true');
    expect(env.NO_COLOR).toBe('1');
  });

  it('every kept key is on the documented allowlist', () => {
    const env = buildTestEnv(process.env);
    const allow = new Set<string>([...TEST_ENV_KEEP, 'CI', 'NO_COLOR', 'FORCE_COLOR']);
    for (const key of Object.keys(env)) {
      expect(allow.has(key), `${key} leaked into the test env`).toBe(true);
    }
  });
});

// ── runProjectTests (mocked execFile — no real spawn) ───────────────────────

interface CapturedCall {
  cmd: string;
  args: string[];
  opts: Record<string, unknown>;
}

function fakeExecFile(
  result: { err: NodeJS.ErrnoException | null; stdout: string; stderr: string },
  captured: CapturedCall[],
): ExecFileImpl {
  return ((cmd: string, args: string[], opts: Record<string, unknown>, cb: (e: Error | null, so: string, se: string) => void) => {
    captured.push({ cmd, args, opts });
    setImmediate(() => cb(result.err, result.stdout, result.stderr));
    return {} as ReturnType<ExecFileImpl>;
  }) as unknown as ExecFileImpl;
}

describe('runProjectTests', () => {
  it('spawns argv[0] directly with the args array — no shell, allowlisted env, capped timeout', async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'Tests  42 passed (42)\n', stderr: '' }, captured);
    const r = await runProjectTests({ argv: ['node', '--run', 'test'], cwd: 'C:\\ws', timeoutMs: 999_999_999, execFileImpl: impl });

    expect(captured).toHaveLength(1);
    expect(captured[0].cmd).toBe('node');
    expect(captured[0].args).toEqual(['--run', 'test']);
    expect(captured[0].opts.cwd).toBe('C:\\ws');
    expect(captured[0].opts.timeout).toBe(TEST_RUN_LIMITS.timeout_ms); // capped at 5 min
    expect(captured[0].opts.maxBuffer).toBe(TEST_RUN_LIMITS.max_output_bytes);
    expect((captured[0].opts as { shell?: unknown }).shell).toBeUndefined(); // never a shell
    const env = captured[0].opts.env as NodeJS.ProcessEnv;
    expect(env.CI).toBe('true');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();

    expect(r.ran).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdoutTail).toContain('42 passed');
  });

  it('reports a non-zero exit code honestly', async () => {
    const err = Object.assign(new Error('Command failed'), { code: 1 });
    const impl = fakeExecFile({ err, stdout: 'Tests: 1 failed, 41 passed, 42 total\n', stderr: 'FAIL src/x.test.ts' }, []);
    const r = await runProjectTests({ argv: ['node', 'runner.js'], cwd: '.', execFileImpl: impl });
    expect(r.ran).toBe(true);
    expect(r.exitCode).toBe(1);
    expect(r.stderrTail).toContain('FAIL');
  });

  it('classifies spawn-level failures (the command never ran)', async () => {
    const err = Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' });
    const impl = fakeExecFile({ err, stdout: '', stderr: '' }, []);
    const r = await runProjectTests({ argv: ['npm', 'test'], cwd: '.', execFileImpl: impl });
    expect(r.ran).toBe(false);
    expect(r.spawnError).toContain('ENOENT');
    if (process.platform === 'win32') {
      expect(r.hint).toContain('node');
      expect(r.hint).toContain('--run');
    }
  });

  it('handles the maxBuffer overflow code as a truncated (failed) run', async () => {
    const err = Object.assign(new Error('maxBuffer length exceeded'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
    const impl = fakeExecFile({ err, stdout: 'lots', stderr: '' }, []);
    const r = await runProjectTests({ argv: ['node', 'noisy.js'], cwd: '.', execFileImpl: impl });
    expect(r.ran).toBe(true);
    expect(r.outputTruncated).toBe(true);
    expect(r.exitCode).toBeNull();
  });
});

// ── parseTestSummary ────────────────────────────────────────────────────────

describe('parseTestSummary', () => {
  it('parses vitest summaries', () => {
    const s = parseTestSummary(' Test Files  12 passed (12)\n      Tests  3 failed | 39 passed (42)\n');
    expect(s).toEqual({ pass_count: 39, fail_count: 3, skip_count: 0, recognized: true });
  });

  it('parses jest summaries', () => {
    const s = parseTestSummary('Tests:       1 failed, 2 skipped, 41 passed, 44 total\n');
    expect(s.pass_count).toBe(41);
    expect(s.fail_count).toBe(1);
    expect(s.skip_count).toBe(2);
    expect(s.recognized).toBe(true);
  });

  it('parses pytest summaries', () => {
    const s = parseTestSummary('================= 2 failed, 17 passed in 1.24s =================\n');
    expect(s.pass_count).toBe(17);
    expect(s.fail_count).toBe(2);
    expect(s.recognized).toBe(true);
  });

  it('never fabricates counts from unrecognized output', () => {
    const s = parseTestSummary('Segmentation fault (core dumped)');
    expect(s).toEqual({ pass_count: 0, fail_count: 0, skip_count: 0, recognized: false });
  });
});

// ── applyFilesToWorkspace (real temp dir) ───────────────────────────────────

describe('applyFilesToWorkspace', () => {
  it('creates new files, backs up modified originals, records hashes, writes a manifest', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'anton-apply-'));
    try {
      await mkdir(path.join(ws, 'src'), { recursive: true });
      await writeFile(path.join(ws, 'src', 'old.ts'), 'original\n', 'utf8');

      const result = await applyFilesToWorkspace({
        workspaceAbs: ws,
        applicationId: 'app-1',
        files: [
          { path: 'src/old.ts', content: 'replaced\n' },
          { path: 'src/new/deep.ts', content: 'brand new\n' },
          { path: 'src/same.ts', content: 'fresh\n' },
        ],
      });

      expect(result.written).toBe(3);
      expect(result.unchanged).toBe(0);
      expect(await readFile(path.join(ws, 'src', 'old.ts'), 'utf8')).toBe('replaced\n');
      expect(await readFile(path.join(ws, 'src', 'new', 'deep.ts'), 'utf8')).toBe('brand new\n');

      const modified = result.files.find((f) => f.path === 'src/old.ts');
      expect(modified?.action).toBe('modify');
      expect(modified?.backed_up).toBe(true);
      expect(modified?.hash_before).toBe(sha256('original\n'));
      expect(modified?.hash_after).toBe(sha256('replaced\n'));

      const created = result.files.find((f) => f.path === 'src/new/deep.ts');
      expect(created?.action).toBe('create');
      expect(created?.hash_before).toBeNull();

      // Backup dir holds the original + a manifest.
      expect(result.backupDir).toMatch(/^\.anton-coding-backup\//);
      const backupAbs = path.join(ws, ...result.backupDir.split('/'));
      expect(await readFile(path.join(backupAbs, 'src', 'old.ts'), 'utf8')).toBe('original\n');
      const manifest = JSON.parse(await readFile(path.join(backupAbs, 'manifest.json'), 'utf8'));
      expect(manifest.application_id).toBe('app-1');
      expect(manifest.files).toHaveLength(3);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  it('skips byte-identical files (unchanged) without backing them up', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'anton-apply-'));
    try {
      await writeFile(path.join(ws, 'a.ts'), 'same\n', 'utf8');
      const result = await applyFilesToWorkspace({
        workspaceAbs: ws,
        applicationId: 'app-2',
        files: [{ path: 'a.ts', content: 'same\n' }],
      });
      expect(result.written).toBe(0);
      expect(result.unchanged).toBe(1);
      expect(result.backupDir).toBe('');
      expect(await readdir(ws)).toEqual(['a.ts']); // no backup dir created
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  it('throws on escaping paths even if they reached the write layer (defense in depth)', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'anton-apply-'));
    try {
      await expect(applyFilesToWorkspace({
        workspaceAbs: ws,
        applicationId: 'app-3',
        files: [{ path: '../escape.ts', content: 'evil\n' }],
      })).rejects.toThrow(/refusing to write/);
      await expect(applyFilesToWorkspace({
        workspaceAbs: ws,
        applicationId: 'app-4',
        files: [{ path: 'C:\\evil.ts', content: 'evil\n' }],
      })).rejects.toThrow(/refusing to write/);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  it('refuses to write through a pre-existing symlink that escapes the workspace', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'anton-symesc-'));
    const ws = path.join(parent, 'ws');
    const outside = path.join(parent, 'outside');
    await mkdir(ws, { recursive: true });
    await mkdir(outside, { recursive: true });
    let linked = false;
    try {
      // A lexically-inside dir ('escape') that physically points OUTSIDE the
      // workspace. On Windows use a junction (no admin needed for dirs).
      try {
        await symlink(outside, path.join(ws, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
        linked = true;
      } catch {
        // Environment can't create symlinks/junctions — skip the assertion.
        return;
      }

      // 'escape/evil.ts' passes lexical validation (no ..) but realpath resolves
      // into `outside` → must be refused.
      await expect(applyFilesToWorkspace({
        workspaceAbs: ws,
        applicationId: 'app-sym',
        files: [{ path: 'escape/evil.ts', content: 'pwned\n' }],
      })).rejects.toThrow(/symlink|outside the workspace/i);

      // The unit-level guard agrees.
      const target = resolveTargetPath(ws, 'escape/evil.ts');
      expect(target).not.toBeNull();
      expect(await isWriteWithinWorkspaceReal(ws, target!)).toBe(false);

      // A genuinely-inside path is still allowed.
      const ok = resolveTargetPath(ws, 'src/fine.ts');
      expect(await isWriteWithinWorkspaceReal(ws, ok!)).toBe(true);

      // Nothing was written into the escaped dir.
      expect(linked && (await readdir(outside)).length).toBe(0);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

// ── buildApplicationRecord ──────────────────────────────────────────────────

describe('buildApplicationRecord', () => {
  it('records hashes, byte sizes, per-file stats and totals (what approve consumes)', () => {
    const files = [
      { path: 'src/a.ts', content: 'new a\n' },
      { path: 'src/b.ts', content: 'changed b\n' },
    ];
    const diffs = [
      buildFileDiff('src/a.ts', null, 'new a\n'),
      buildFileDiff('src/b.ts', 'old b\n', 'changed b\n'),
    ];
    const oldContents = new Map<string, string | null>([['src/a.ts', null], ['src/b.ts', 'old b\n']]);
    const record = buildApplicationRecord(files, diffs, oldContents);

    expect(record.files).toHaveLength(2);
    const a = record.files[0];
    expect(a.action).toBe('create');
    expect(a.hash_before).toBeNull();
    expect(a.hash_new).toBe(sha256('new a\n'));
    expect(a.bytes).toBe(Buffer.byteLength('new a\n'));
    expect(a.content).toBe('new a\n'); // retained while proposed → approve writes exactly what was reviewed

    const b = record.files[1];
    expect(b.action).toBe('modify');
    expect(b.hash_before).toBe(sha256('old b\n'));

    expect(record.diff_summary.totals.files).toBe(2);
    expect(record.diff_summary.totals.create).toBe(1);
    expect(record.diff_summary.totals.modify).toBe(1);
    expect(record.diff_summary.per_file['src/b.ts'].action).toBe('modify');
  });
});

// ── Phase 3: studio-root auto-allow (the one safe widening) ──────────────────

describe('getCodingStudioRoot + getAllowedBases widening', () => {
  it('defaults to ./coding-studio resolved to absolute', () => {
    const root = getCodingStudioRoot({});
    expect(path.isAbsolute(root)).toBe(true);
    expect(root.toLowerCase()).toContain('coding-studio');
  });

  it('honours CODING_STUDIO_ROOT', () => {
    const root = getCodingStudioRoot({ CODING_STUDIO_ROOT: 'C:\\anton\\studio' } as NodeJS.ProcessEnv);
    expect(root).toBe(path.resolve('C:\\anton\\studio'));
  });

  it('appends the studio root to the user allowlist (the only auto-added base)', () => {
    const bases = getAllowedBases({ ALLOWED_FOLDER_PATHS: 'C:\\projects', CODING_STUDIO_ROOT: 'C:\\anton\\studio' } as NodeJS.ProcessEnv);
    expect(bases).toContain(path.resolve('C:\\projects'));
    expect(bases).toContain(path.resolve('C:\\anton\\studio'));
  });

  it('still adds the studio root even when ALLOWED_FOLDER_PATHS is empty (user dirs stay closed)', () => {
    const bases = getAllowedBases({ ALLOWED_FOLDER_PATHS: '', CODING_STUDIO_ROOT: 'C:\\anton\\studio' } as NodeJS.ProcessEnv);
    expect(bases).toEqual([path.resolve('C:\\anton\\studio')]);
  });

  it('de-dupes when the operator also lists the studio root explicitly', () => {
    const root = path.resolve('C:\\anton\\studio');
    const bases = getAllowedBases({ ALLOWED_FOLDER_PATHS: root, CODING_STUDIO_ROOT: 'C:\\anton\\studio' } as NodeJS.ProcessEnv);
    expect(bases.filter((b) => b === root)).toHaveLength(1);
  });

  it('a studio path validates against the auto-allowed base (no manual allowlist edit)', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'anton-studio-root-'));
    try {
      const projDir = path.join(ws, 'proj_abc12345');
      await mkdir(projDir, { recursive: true });
      // ALLOWED_FOLDER_PATHS is EMPTY — the studio root alone makes this writable.
      const v = await validateWorkspacePath(projDir, { ALLOWED_FOLDER_PATHS: '', CODING_STUDIO_ROOT: ws } as NodeJS.ProcessEnv);
      expect(v.ok).toBe(true);
      expect(v.resolved).toBe(path.resolve(projDir));
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  it('a path OUTSIDE the studio root is still rejected when the allowlist is empty', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'anton-outside-'));
    const studio = await mkdtemp(path.join(os.tmpdir(), 'anton-studio-'));
    try {
      const v = await validateWorkspacePath(outside, { ALLOWED_FOLDER_PATHS: '', CODING_STUDIO_ROOT: studio } as NodeJS.ProcessEnv);
      expect(v.ok).toBe(false);
      expect(v.error).toMatch(/outside ALLOWED_FOLDER_PATHS/i);
    } finally {
      await rm(outside, { recursive: true, force: true });
      await rm(studio, { recursive: true, force: true });
    }
  });
});

// ── Phase 3: buildCommandEnv (scoped DSN in, server DATABASE_URL NEVER) ──────

describe('buildCommandEnv', () => {
  const source = {
    PATH: '/usr/bin',
    CARGO_HOME: '/home/x/.cargo',
    RUSTUP_HOME: '/home/x/.rustup',
    VIRTUAL_ENV: '/proj/.venv',
    DATABASE_URL: 'postgresql://anton:anton@localhost/anton', // the SERVER db — must NOT leak
    ANTHROPIC_API_KEY: 'sk-ant-SECRET',
    NODE_OPTIONS: '--inspect',
  } as NodeJS.ProcessEnv;

  it('injects PROJECT_DATABASE_URL but NEVER the server DATABASE_URL', () => {
    const env = buildCommandEnv('postgresql://studio_x:pw@localhost/proj_x', source);
    expect(env[PROJECT_DATABASE_URL_KEY]).toBe('postgresql://studio_x:pw@localhost/proj_x');
    expect(env.DATABASE_URL).toBeUndefined();          // server DSN stripped
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();     // server secret stripped
    expect(env.NODE_OPTIONS).toBeUndefined();
  });

  it('keeps the Rust/Python toolchain homes (locations, not secrets)', () => {
    const env = buildCommandEnv(null, source);
    expect(env.CARGO_HOME).toBe('/home/x/.cargo');
    expect(env.RUSTUP_HOME).toBe('/home/x/.rustup');
    expect(env.VIRTUAL_ENV).toBe('/proj/.venv');
  });

  it('omits PROJECT_DATABASE_URL when the project was never provisioned', () => {
    const env = buildCommandEnv(null, source);
    expect(env[PROJECT_DATABASE_URL_KEY]).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('runProjectTests injects PROJECT_DATABASE_URL into the spawn env, never the server DATABASE_URL', async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'ok', stderr: '' }, captured);
    await runProjectTests({
      argv: ['cargo', 'test'], cwd: '/ws',
      projectDatabaseUrl: 'postgresql://studio_x:pw@localhost/proj_x',
      execFileImpl: impl,
    });
    const env = captured[0].opts.env as NodeJS.ProcessEnv;
    expect(env[PROJECT_DATABASE_URL_KEY]).toBe('postgresql://studio_x:pw@localhost/proj_x');
    expect(env.DATABASE_URL).toBeUndefined();
  });
});

// ── Phase 3: probeToolchain (honest green/red, mocked execFile) ──────────────

describe('probeToolchain', () => {
  /** A version-probe execFile mock: green for the listed cmds, red otherwise. */
  function toolMock(green: Set<string>): ExecFileImpl {
    return ((cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
      setImmediate(() => {
        if (green.has(cmd)) cb(null, `${cmd} 1.2.3\n`, '');
        else cb(Object.assign(new Error('not found'), { code: 'ENOENT' }), '', '');
      });
      return {} as ReturnType<ExecFileImpl>;
    }) as unknown as ExecFileImpl;
  }

  it('reports rust READY (green) when cargo + rustc are present', async () => {
    const status = await probeToolchain('rust', toolMock(new Set(['cargo', 'rustc'])));
    expect(status.ready).toBe(true);
    expect(status.probes.every((p) => p.available)).toBe(true);
    expect(status.probes.find((p) => p.command === 'cargo')?.version).toContain('1.2.3');
  });

  it('reports rust NOT ready (red) when cargo is missing — never fakes a pass', async () => {
    const status = await probeToolchain('rust', toolMock(new Set(['rustc'])));
    expect(status.ready).toBe(false);
    expect(status.probes.find((p) => p.command === 'cargo')?.available).toBe(false);
    expect(status.note).toMatch(/incomplete|missing/i);
  });

  it('node is always available (we ARE node)', async () => {
    const status = await probeToolchain('node', toolMock(new Set())); // nothing green
    expect(status.ready).toBe(true);
    expect(status.probes[0].command).toBe('node');
    expect(status.probes[0].version).toBe(process.version);
  });

  it('python red when neither python nor py nor python3 resolves', async () => {
    const status = await probeToolchain('python', toolMock(new Set())); // none green
    expect(status.ready).toBe(false);
  });
});

// ── Phase 3: language presets (right argv, no shells) ───────────────────────

describe('language presets', () => {
  it('TS preset = tsc --noEmit (build) + node --run test (test), no npm shim', () => {
    const p = languagePreset('typescript');
    expect(p.build_command).toEqual(['node', 'node_modules/typescript/bin/tsc', '--noEmit']);
    expect(p.test_command).toEqual(['node', '--run', 'test']);
  });

  it('Python preset = venv + pip install + pytest, with the venv python IN ARGV (no PATH mutation)', () => {
    const p = languagePreset('python');
    expect(p.setup_command).toEqual(['python', '-m', 'venv', '.venv']);
    expect(p.build_command?.[0]).toBe(venvPython());
    expect(p.build_command).toContain('pip');
    expect(p.test_command?.[0]).toBe(venvPython());
    expect(p.test_command).toContain('pytest');
    // OS-aware venv python path.
    expect(venvPython()).toBe(process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');
  });

  it('Rust preset = cargo build / cargo test', () => {
    const p = languagePreset('rust');
    expect(p.build_command).toEqual(['cargo', 'build']);
    expect(p.test_command).toEqual(['cargo', 'test']);
  });

  it('every preset command is a valid argv (validateTestArgv accepts it — no shells)', () => {
    for (const preset of allLanguagePresets()) {
      for (const cmd of [preset.setup_command, preset.build_command, preset.test_command]) {
        if (!cmd) continue;
        const v = validateTestArgv(cmd);
        expect(v.ok, `${preset.language}: ${cmd.join(' ')}`).toBe(true);
      }
    }
  });
});

// ── Phase 6: runProjectTests container (docker) path ────────────────────────
// APPENDED (do not modify the assertions above). Verifies the DEFAULT path is
// unchanged (no docker, no executionMode) and that containerMode='docker' wraps
// the configured argv into `docker run … <image> <inner argv>` with the mount,
// -w /work, and --network none flags — all via the SAME mocked execFile (no
// real spawn, no real docker).

describe('runProjectTests — container mode (Phase 6)', () => {
  // A workspace path INSIDE the allowlist (the studio root is auto-allowed).
  const wsAbs = path.join(getCodingStudioRoot(), 'proj_docker_test');

  it('default path is UNCHANGED: no docker wrap, no executionMode, inner argv spawned directly', async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'Tests  3 passed (3)\n', stderr: '' }, captured);
    const r = await runProjectTests({ argv: ['node', '--run', 'test'], cwd: wsAbs, execFileImpl: impl });

    expect(captured).toHaveLength(1);
    expect(captured[0].cmd).toBe('node');              // NOT docker
    expect(captured[0].args).toEqual(['--run', 'test']);
    expect(r.executionMode).toBeUndefined();           // omitted when containerMode not supplied
  });

  it("containerMode='local' runs the inner argv directly and reports executionMode='local'", async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'ok', stderr: '' }, captured);
    const r = await runProjectTests({
      argv: ['cargo', 'test'], cwd: wsAbs, containerMode: 'local', execFileImpl: impl,
    });
    expect(captured[0].cmd).toBe('cargo');             // not wrapped
    expect(r.executionMode).toBe('local');
  });

  it("containerMode='docker' wraps into `docker run --rm … --network none -v <ws>:/work -w /work <image> <inner>`", async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'ok', stderr: '' }, captured);
    const r = await runProjectTests({
      argv: ['cargo', 'test'], cwd: wsAbs,
      containerMode: 'docker', language: 'rust', execFileImpl: impl,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].cmd).toBe('docker');            // the spawned binary is docker
    const args = captured[0].args;
    expect(args[0]).toBe('run');
    expect(args).toContain('--rm');
    // network OFF by default for test step.
    const netIdx = args.indexOf('--network');
    expect(netIdx).toBeGreaterThanOrEqual(0);
    expect(args[netIdx + 1]).toBe('none');
    // workspace bind-mount + workdir.
    const vIdx = args.indexOf('-v');
    expect(args[vIdx + 1]).toBe(`${path.resolve(wsAbs)}:/work`);
    const wIdx = args.indexOf('-w');
    expect(args[wIdx + 1]).toBe('/work');
    // rust image, then the inner argv at the tail.
    expect(args).toContain('rust:1-slim');
    expect(args.slice(-2)).toEqual(['cargo', 'test']);
    // host docker CLIENT env never carries a secret DSN (none provided here).
    const env = captured[0].opts.env as NodeJS.ProcessEnv;
    expect(env.DATABASE_URL).toBeUndefined();
    expect(r.executionMode).toBe('docker');
  });

  it("docker mode passes the scoped DSN to the CONTAINER via -e (never to the docker client env)", async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'ok', stderr: '' }, captured);
    await runProjectTests({
      argv: ['node', '--run', 'test'], cwd: wsAbs,
      containerMode: 'docker', language: 'node',
      projectDatabaseUrl: 'postgresql://studio_x:pw@localhost/proj_x',
      execFileImpl: impl,
    });
    const args = captured[0].args;
    expect(args).toContain('-e');
    expect(args).toContain('PROJECT_DATABASE_URL=postgresql://studio_x:pw@localhost/proj_x');
    // The DSN is NOT in the docker client's own env (it goes to the container).
    const env = captured[0].opts.env as NodeJS.ProcessEnv;
    expect(env[PROJECT_DATABASE_URL_KEY]).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("docker setup step can opt into --network bridge", async () => {
    const captured: CapturedCall[] = [];
    const impl = fakeExecFile({ err: null, stdout: 'ok', stderr: '' }, captured);
    await runProjectTests({
      argv: ['pip', 'install', '-e', '.'], cwd: wsAbs,
      containerMode: 'docker', language: 'python', containerNetwork: 'bridge',
      execFileImpl: impl,
    });
    const args = captured[0].args;
    const netIdx = args.indexOf('--network');
    expect(args[netIdx + 1]).toBe('bridge');
    expect(args).toContain('python:3.12-slim');
  });
});
