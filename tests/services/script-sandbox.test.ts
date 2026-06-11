/**
 * script-sandbox.test.ts — Wave 4.11: real sandboxed script preview.
 *
 * execFile is MOCKED (injected impl) — these tests verify the security
 * posture of the command construction and the one-round auto-fix loop:
 *
 *   • args array (no shell), script path inside a fresh temp dir, cwd = that dir
 *   • 10 s timeout enforced (caller-supplied values are clamped)
 *   • env-strip: no server secrets (API keys, DATABASE_URL) leak into the run
 *   • auto-fix loop: fail → ONE fixer round → re-run once; both attempts
 *     reported honestly; no second fix round ever
 *   • no_runtime honesty when python is missing
 */
import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import {
  detectLanguage,
  buildMinimalEnv,
  runScriptInSandbox,
  runPreviewWithAutofix,
  resolveRuntime,
  extractCodeBlock,
  SANDBOX_LIMITS,
  type ExecFileImpl,
} from '../../server/services/script-sandbox.js';

type ExecCall = {
  cmd: string;
  args: readonly string[];
  options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv; maxBuffer?: number; windowsHide?: boolean };
};

/** Build a mock execFile that records calls and replies per invocation. */
function mockExecFile(
  replies: Array<{ error?: Partial<Error & { code: number | string; killed: boolean }> | null; stdout?: string; stderr?: string }>,
): { impl: ExecFileImpl; calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  let i = 0;
  const impl = ((cmd: string, args: readonly string[], options: ExecCall['options'], cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    calls.push({ cmd, args, options });
    const reply = replies[Math.min(i, replies.length - 1)];
    i++;
    const err = reply.error
      ? Object.assign(new Error('exec failed'), reply.error)
      : null;
    // async like the real thing
    setImmediate(() => cb(err as Error | null, reply.stdout ?? '', reply.stderr ?? ''));
    return undefined as never;
  }) as unknown as ExecFileImpl;
  return { impl, calls };
}

const JS_SCRIPT = 'const x = 1 + 1;\nconsole.log(`result: ${x}`);';
const PY_SCRIPT = 'import sys\nprint("hello")';

describe('detectLanguage', () => {
  it('detects python', () => expect(detectLanguage(PY_SCRIPT)).toBe('python'));
  it('detects node', () => expect(detectLanguage(JS_SCRIPT)).toBe('node'));
  it('honors an explicit hint', () => expect(detectLanguage(JS_SCRIPT, 'python')).toBe('python'));
});

describe('buildMinimalEnv — env-strip', () => {
  it('drops server secrets, keeps OS essentials', () => {
    const env = buildMinimalEnv({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      OPENAI_API_KEY: 'sk-secret',
      DATABASE_URL: 'postgresql://anton:anton@localhost/anton',
      TEMP: 'C:/tmp',
    });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.TEMP).toBe('C:/tmp');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PYTHONIOENCODING).toBe('utf-8');
  });
});

describe('runScriptInSandbox — command construction', () => {
  it('uses execFile with an args array, temp-dir cwd, clamped timeout, minimal env', async () => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test-canary';
    const { impl, calls } = mockExecFile([{ error: null, stdout: 'result: 2', stderr: '' }]);

    const result = await runScriptInSandbox({
      script: JS_SCRIPT,
      dataSample: 'a,b\n1,2',
      language: 'node',
      runtime: process.execPath,
      timeoutMs: 999_999, // must be clamped to the 10 s cap
    }, { execFileImpl: impl });

    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('result: 2');

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.cmd).toBe(process.execPath);
    expect(call.args).toHaveLength(1);
    expect(String(call.args[0]).endsWith('script.js')).toBe(true);
    // script lives in a fresh temp dir; cwd = that dir
    expect(path.dirname(String(call.args[0]))).toBe(call.options.cwd);
    expect(String(call.options.cwd).startsWith(os.tmpdir())).toBe(true);
    // timeout clamped to the documented cap
    expect(call.options.timeout).toBe(SANDBOX_LIMITS.timeout_ms);
    expect(call.options.maxBuffer).toBe(SANDBOX_LIMITS.max_output_bytes);
    expect(call.options.windowsHide).toBe(true);
    // env-strip — no server secrets reach the child
    expect(call.options.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(call.options.env?.DATABASE_URL).toBeUndefined();
  });

  it('reports a non-zero exit honestly', async () => {
    const { impl } = mockExecFile([{ error: { code: 1 }, stdout: '', stderr: 'Traceback: boom' }]);
    const result = await runScriptInSandbox(
      { script: PY_SCRIPT, language: 'python', runtime: 'python' },
      { execFileImpl: impl },
    );
    expect(result.ran).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('boom');
  });
});

describe('runPreviewWithAutofix — one auto-fix round', () => {
  it('first run passes → badge passed, fixer never called', async () => {
    const { impl, calls } = mockExecFile([{ error: null, stdout: 'ok', stderr: '' }]);
    let fixerCalls = 0;
    const result = await runPreviewWithAutofix({
      script: JS_SCRIPT,
      fixScript: async () => { fixerCalls++; return 'should not be used'; },
    }, { execFileImpl: impl });

    expect(result.status).toBe('ok');
    expect(result.badge).toBe('passed');
    expect(result.attempts).toHaveLength(1);
    expect(fixerCalls).toBe(0);
    expect(calls).toHaveLength(1);
    expect(result.message).toMatch(/✓/);
    expect(result.limits).toBe(SANDBOX_LIMITS);
  });

  it('fail → fixer → re-run passes → badge fixed, both attempts reported', async () => {
    const { impl, calls } = mockExecFile([
      { error: { code: 1 }, stdout: '', stderr: 'SyntaxError on line 2' },
      { error: null, stdout: 'fixed output', stderr: '' },
    ]);
    const fixerInputs: Array<{ script: string; errorOutput: string }> = [];
    const FIXED = 'console.log("fixed")';

    const result = await runPreviewWithAutofix({
      script: JS_SCRIPT,
      fixScript: async (script, errorOutput) => {
        fixerInputs.push({ script, errorOutput });
        return FIXED;
      },
    }, { execFileImpl: impl });

    expect(result.status).toBe('fixed');
    expect(result.badge).toBe('fixed');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].exitCode).toBe(1);
    expect(result.attempts[1].exitCode).toBe(0);
    expect(result.fixedScript).toBe(FIXED);
    // the fixer saw the real error
    expect(fixerInputs).toHaveLength(1);
    expect(fixerInputs[0].errorOutput).toContain('SyntaxError');
    // exactly two executions, never a third
    expect(calls).toHaveLength(2);
  });

  it('fail → fixer → re-run fails → badge failed, ONE fix round only', async () => {
    const { impl, calls } = mockExecFile([
      { error: { code: 1 }, stdout: '', stderr: 'err1' },
      { error: { code: 2 }, stdout: '', stderr: 'err2' },
    ]);
    let fixerCalls = 0;
    const result = await runPreviewWithAutofix({
      script: JS_SCRIPT,
      fixScript: async () => { fixerCalls++; return 'console.log("still broken")'; },
    }, { execFileImpl: impl });

    expect(result.status).toBe('failed');
    expect(result.badge).toBe('failed');
    expect(result.attempts).toHaveLength(2);
    expect(fixerCalls).toBe(1); // exactly one auto-fix round
    expect(calls).toHaveLength(2);
    expect(result.message).toMatch(/✗/);
  });

  it('fail with no usable fix → failed with one attempt', async () => {
    const { impl, calls } = mockExecFile([{ error: { code: 1 }, stdout: '', stderr: 'err' }]);
    const result = await runPreviewWithAutofix({
      script: JS_SCRIPT,
      fixScript: async () => null,
    }, { execFileImpl: impl });
    expect(result.status).toBe('failed');
    expect(result.attempts).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('python missing → honest no_runtime (probe fails, script never runs)', async () => {
    // every probe ('python --version' etc.) errors → no runtime found
    const { impl, calls } = mockExecFile([{ error: { code: 'ENOENT' } }]);
    const result = await runPreviewWithAutofix(
      { script: PY_SCRIPT },
      { execFileImpl: impl },
    );
    expect(result.status).toBe('no_runtime');
    expect(result.badge).toBe('unavailable');
    expect(result.attempts).toHaveLength(0);
    // only probe calls happened — never the script itself
    expect(calls.every(c => c.args[0] === '--version')).toBe(true);
  });
});

describe('resolveRuntime', () => {
  it('node resolves to the server binary without probing', async () => {
    const { impl, calls } = mockExecFile([{ error: { code: 'ENOENT' } }]);
    const runtime = await resolveRuntime('node', { execFileImpl: impl });
    expect(runtime).toBe(process.execPath);
    expect(calls).toHaveLength(0);
  });
});

describe('extractCodeBlock', () => {
  it('extracts the first fenced block', () => {
    expect(extractCodeBlock('Here:\n```python\nprint(1)\n```\nmore')).toBe('print(1)');
  });
  it('returns null without a block', () => {
    expect(extractCodeBlock('no code here')).toBeNull();
  });
});
