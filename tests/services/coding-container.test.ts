/**
 * coding-container.test.ts — ANTON Studio Phase 6: container isolation (Docker).
 *
 * All execFile is INJECTED (no real docker, no real spawn). Covers:
 *   • detectDocker — available / not-installed (ENOENT) / daemon-down / timeout-ish
 *   • containerEnabled — honours CODING_STUDIO_DOCKER (set + unset, restored after)
 *   • buildDockerRunArgv — correct argv: run --rm, -v mount, -w /work,
 *     --network none default + bridge opt-in, -e PROJECT_DATABASE_URL only when
 *     provided, per-language image, NEVER a shell string, mount outside the
 *     allowlist is REJECTED
 *   • resolveExecution — docker ONLY when mode+flag+available all true; else
 *     local WITH a reason (the honest decision point)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ExecFileImpl } from '../../server/services/coding-workspace.js';
import {
  detectDocker,
  containerEnabled,
  buildDockerRunArgv,
  resolveExecution,
  imageForLanguage,
  ContainerMountError,
  CONTAINER_ENABLE_ENV,
  DEFAULT_IMAGES,
  FALLBACK_IMAGE,
  CONTAINER_WORKDIR,
} from '../../server/services/coding-container.js';

// ── execFile fakes ───────────────────────────────────────────────────────────

/** docker present + daemon answers with a server version. */
function dockerOk(version = '27.1.1'): ExecFileImpl {
  return ((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
    setImmediate(() => cb(null, `${version}\n`, ''));
    return {} as ReturnType<ExecFileImpl>;
  }) as unknown as ExecFileImpl;
}

/** docker not installed → ENOENT. */
function dockerENOENT(): ExecFileImpl {
  return ((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
    setImmediate(() => cb(Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }), '', ''));
    return {} as ReturnType<ExecFileImpl>;
  }) as unknown as ExecFileImpl;
}

/** docker client present, daemon down → non-zero exit with stderr. */
function dockerDaemonDown(): ExecFileImpl {
  return ((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
    setImmediate(() => cb(
      Object.assign(new Error('Command failed'), { code: 1 }),
      '',
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n',
    ));
    return {} as ReturnType<ExecFileImpl>;
  }) as unknown as ExecFileImpl;
}

// A workspace path INSIDE the allowlist — the studio root is auto-allowed, and
// we point CODING_STUDIO_ROOT at a temp dir for these tests.
let studioRoot: string;
let wsAbs: string;

beforeAll(async () => {
  studioRoot = await mkdtemp(path.join(os.tmpdir(), 'anton-container-test-'));
  process.env.CODING_STUDIO_ROOT = studioRoot;
  wsAbs = path.join(studioRoot, 'proj_abc');
});

afterAll(async () => {
  delete process.env.CODING_STUDIO_ROOT;
  await rm(studioRoot, { recursive: true, force: true });
});

// ── detectDocker ─────────────────────────────────────────────────────────────

describe('detectDocker', () => {
  it('reports available + version when the daemon answers', async () => {
    const d = await detectDocker(dockerOk('27.1.1'));
    expect(d.available).toBe(true);
    expect(d.version).toBe('27.1.1');
    expect(d.error).toBeUndefined();
  });

  it('reports unavailable with a clear reason when docker is not installed (ENOENT)', async () => {
    const d = await detectDocker(dockerENOENT());
    expect(d.available).toBe(false);
    expect(d.error).toMatch(/not installed/i);
  });

  it('reports unavailable with a daemon-down reason on a non-zero exit', async () => {
    const d = await detectDocker(dockerDaemonDown());
    expect(d.available).toBe(false);
    expect(d.error).toMatch(/daemon/i);
  });

  it('never throws even if the injected execFile throws synchronously', async () => {
    const throwing = (() => { throw new Error('boom'); }) as unknown as ExecFileImpl;
    const d = await detectDocker(throwing);
    expect(d.available).toBe(false);
    expect(d.error).toBeTruthy();
  });

  it('asks for the SERVER version (so a dead daemon is correctly red)', async () => {
    let seenArgs: string[] = [];
    const spy = ((_cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
      seenArgs = args;
      setImmediate(() => cb(null, '27.0\n', ''));
      return {} as ReturnType<ExecFileImpl>;
    }) as unknown as ExecFileImpl;
    await detectDocker(spy);
    expect(seenArgs).toEqual(['version', '--format', '{{.Server.Version}}']);
  });
});

// ── containerEnabled (env flag, default OFF) ─────────────────────────────────

describe('containerEnabled', () => {
  it('defaults OFF when the flag is unset', () => {
    expect(containerEnabled({})).toBe(false);
  });

  it('is ON for truthy values, OFF otherwise', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE', 'On']) {
      expect(containerEnabled({ [CONTAINER_ENABLE_ENV]: v }), v).toBe(true);
    }
    for (const v of ['0', 'false', 'no', 'off', '', 'maybe']) {
      expect(containerEnabled({ [CONTAINER_ENABLE_ENV]: v }), v).toBe(false);
    }
  });

  it('honours the real process.env flag (set + restore)', () => {
    const prev = process.env[CONTAINER_ENABLE_ENV];
    try {
      delete process.env[CONTAINER_ENABLE_ENV];
      expect(containerEnabled()).toBe(false);
      process.env[CONTAINER_ENABLE_ENV] = '1';
      expect(containerEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env[CONTAINER_ENABLE_ENV];
      else process.env[CONTAINER_ENABLE_ENV] = prev;
    }
  });
});

// ── imageForLanguage ─────────────────────────────────────────────────────────

describe('imageForLanguage', () => {
  it('maps known languages to their default slim image', () => {
    expect(imageForLanguage('node')).toBe(DEFAULT_IMAGES.node);
    expect(imageForLanguage('typescript')).toBe(DEFAULT_IMAGES.typescript);
    expect(imageForLanguage('python')).toBe(DEFAULT_IMAGES.python);
    expect(imageForLanguage('rust')).toBe(DEFAULT_IMAGES.rust);
  });

  it('falls back for unknown / null languages', () => {
    expect(imageForLanguage(null)).toBe(FALLBACK_IMAGE);
    expect(imageForLanguage('cobol')).toBe(FALLBACK_IMAGE);
  });

  it('honours an explicit override', () => {
    expect(imageForLanguage('node', 'my/custom:tag')).toBe('my/custom:tag');
  });
});

// ── buildDockerRunArgv ───────────────────────────────────────────────────────

describe('buildDockerRunArgv', () => {
  it('produces a pure argv: run --rm --network none -v <ws>:/work -w /work <image> <inner>', () => {
    const argv = buildDockerRunArgv({ workspaceAbs: wsAbs, innerArgv: ['cargo', 'test'], language: 'rust' });
    expect(argv[0]).toBe('run');
    expect(argv).toContain('--rm');
    const netIdx = argv.indexOf('--network');
    expect(argv[netIdx + 1]).toBe('none');
    const vIdx = argv.indexOf('-v');
    expect(argv[vIdx + 1]).toBe(`${path.resolve(wsAbs)}:${CONTAINER_WORKDIR}`);
    const wIdx = argv.indexOf('-w');
    expect(argv[wIdx + 1]).toBe(CONTAINER_WORKDIR);
    expect(argv).toContain('rust:1-slim');
    expect(argv.slice(-2)).toEqual(['cargo', 'test']);
  });

  it('every element is a SINGLE argv string — never a shell string (no spaces in the mount/env tokens beyond the value)', () => {
    const argv = buildDockerRunArgv({
      workspaceAbs: wsAbs, innerArgv: ['node', '--run', 'test'], language: 'node',
      projectDatabaseUrl: 'postgresql://u:p@h/db',
    });
    // No element is a joined shell command; the mount + -e are single tokens.
    expect(argv).toContain('-e');
    expect(argv).toContain('PROJECT_DATABASE_URL=postgresql://u:p@h/db');
    // Sanity: argv is a flat string[] (not a shell line).
    for (const el of argv) expect(typeof el).toBe('string');
  });

  it('adds -e PROJECT_DATABASE_URL ONLY when a DSN is provided', () => {
    const without = buildDockerRunArgv({ workspaceAbs: wsAbs, innerArgv: ['node', 'x.js'], language: 'node' });
    expect(without).not.toContain('-e');
    expect(without.some((a) => a.startsWith('PROJECT_DATABASE_URL='))).toBe(false);

    const withDsn = buildDockerRunArgv({
      workspaceAbs: wsAbs, innerArgv: ['node', 'x.js'], language: 'node',
      projectDatabaseUrl: 'postgresql://studio_x:pw@localhost/proj_x',
    });
    expect(withDsn).toContain('-e');
    expect(withDsn).toContain('PROJECT_DATABASE_URL=postgresql://studio_x:pw@localhost/proj_x');
  });

  it('honours an image override and a bridge network opt-in', () => {
    const argv = buildDockerRunArgv({
      workspaceAbs: wsAbs, innerArgv: ['pip', 'install', '.'],
      image: 'python:3.13-slim', networkMode: 'bridge',
    });
    expect(argv).toContain('python:3.13-slim');
    const netIdx = argv.indexOf('--network');
    expect(argv[netIdx + 1]).toBe('bridge');
  });

  it('REJECTS a workspace outside the allowlist (never mounts it)', () => {
    const outside = path.join(os.tmpdir(), 'definitely-not-allowed-xyz');
    expect(() => buildDockerRunArgv({ workspaceAbs: outside, innerArgv: ['node', 'x.js'] }))
      .toThrow(ContainerMountError);
  });

  it('rejects a relative workspace path', () => {
    expect(() => buildDockerRunArgv({ workspaceAbs: 'rel/path', innerArgv: ['node', 'x.js'] }))
      .toThrow(ContainerMountError);
  });

  it('rejects an empty inner argv', () => {
    expect(() => buildDockerRunArgv({ workspaceAbs: wsAbs, innerArgv: [] }))
      .toThrow(ContainerMountError);
  });
});

// ── resolveExecution (the single honest decision point) ──────────────────────

describe('resolveExecution', () => {
  // NB: build the params per-test so wsAbs (set in beforeAll) is read at call
  // time — capturing it in a module-level object would freeze it as undefined.
  it('picks docker ONLY when mode=docker + flag on + docker available', async () => {
    const d = await resolveExecution({
      workspaceAbs: wsAbs, language: 'rust', environmentMode: 'docker',
      env: { [CONTAINER_ENABLE_ENV]: '1', CODING_STUDIO_ROOT: studioRoot },
      execFileImpl: dockerOk(),
    });
    expect(d.mode).toBe('docker');
    expect(d.image).toBe('rust:1-slim');
    const wrapped = d.wrap(['cargo', 'test']);
    expect(wrapped[0]).toBe('run'); // docker `run …` (the binary is prepended by the spawner)
    expect(wrapped.slice(-2)).toEqual(['cargo', 'test']);
  });

  it('falls back to local (with a reason) when the project did not request docker', async () => {
    const d = await resolveExecution({
      workspaceAbs: wsAbs, language: 'rust', environmentMode: 'auto',
      env: { [CONTAINER_ENABLE_ENV]: '1' },
      execFileImpl: dockerOk(),
    });
    expect(d.mode).toBe('local');
    expect(d.reason).toMatch(/not in docker mode/i);
    expect(d.wrap(['cargo', 'test'])).toEqual(['cargo', 'test']); // inner argv unchanged
  });

  it('falls back to local when the operator flag is OFF — names the env var', async () => {
    const d = await resolveExecution({
      workspaceAbs: wsAbs, language: 'rust', environmentMode: 'docker',
      env: {}, // flag unset
      execFileImpl: dockerOk(),
    });
    expect(d.mode).toBe('local');
    expect(d.reason).toContain(CONTAINER_ENABLE_ENV);
  });

  it('falls back to local when Docker is unavailable — surfaces the docker reason', async () => {
    const d = await resolveExecution({
      workspaceAbs: wsAbs, language: 'rust', environmentMode: 'docker',
      env: { [CONTAINER_ENABLE_ENV]: '1' },
      execFileImpl: dockerENOENT(),
    });
    expect(d.mode).toBe('local');
    expect(d.reason).toMatch(/unavailable/i);
    expect(d.reason).toMatch(/not installed/i);
  });
});
