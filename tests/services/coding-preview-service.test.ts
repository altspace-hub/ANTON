/**
 * coding-preview-service.test.ts — ANTON Studio P6 (the LIVE LOCAL PREVIEW
 * SERVER service).
 *
 * NO real spawn, NO real DB: a FAKE spawn returns an EventEmitter-ish child with
 * a .kill spy + stdout/stderr emitters; a tiny in-memory fake DatabaseAdapter
 * captures the durable row. We exercise the kill-safety + gating contract:
 *
 *   - CODING_STUDIO_PREVIEW unset/false → 412-shaped refusal, spawns NOTHING
 *   - enabled start → spawns argv with shell:false, writes a 'running' row
 *   - stop → child.kill('SIGTERM') on the TRACKED handle ONLY
 *   - stop with NO handle → marks the row stopped WITHOUT killing anything
 *   - a non-zero child 'exit' → status 'crashed'
 *   - a .cmd shim (npm/pnpm/…) on win32 → refused with the honest message
 *   - the log ring buffer caps at PREVIEW_LOG_CAP_BYTES
 *
 * CRITICAL: the operator's hard rule is NEVER kill processes broadly. These
 * tests use a FAKE spawn — no real process is ever started or killed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  startPreview,
  stopPreview,
  getPreviewStatus,
  getPreviewLogs,
  shutdownAllPreviews,
  clearHandlesForTests,
  liveHandleCountForTests,
  PREVIEW_LOG_CAP_BYTES,
  type SpawnImpl,
} from '../../server/services/coding-preview-service.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

// ── Fake child process (EventEmitter + .kill spy + stdout/stderr emitters) ────
interface FakeChild extends EventEmitter {
  pid?: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function makeFakeChild(pid = 12345): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.pid = pid;
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  ee.kill = vi.fn(() => true);
  return ee;
}

interface SpawnCall {
  command: string;
  args: string[];
  options: { cwd: string; env: NodeJS.ProcessEnv; shell: false; windowsHide: boolean };
}

function fakeSpawn(child: FakeChild, captured: SpawnCall[]): SpawnImpl {
  return ((command: string, args: string[], options: SpawnCall['options']) => {
    captured.push({ command, args, options });
    return child as unknown as ReturnType<SpawnImpl>;
  }) as SpawnImpl;
}

// ── Tiny in-memory fake DatabaseAdapter (just enough for the service) ─────────
interface Row { [k: string]: unknown }
function makeFakeDb(projectDir: string | null): DatabaseAdapter {
  const previewRows = new Map<string, Row>();
  const projects = new Map<string, Row>();
  projects.set('proj-1', { directory_path: projectDir });

  const db: Partial<DatabaseAdapter> = {
    dialect: 'postgresql',
    get: (async (sql: string, ...params: unknown[]) => {
      if (/FROM coding_projects/i.test(sql)) {
        return projects.get(String(params[0])) as Row | undefined;
      }
      if (/FROM coding_preview_servers/i.test(sql)) {
        return previewRows.get(String(params[0])) as Row | undefined;
      }
      return undefined;
    }) as DatabaseAdapter['get'],
    run: (async (sql: string, ...params: unknown[]) => {
      if (/INSERT INTO coding_preview_servers/i.test(sql)) {
        // (project_id, status, port, pid, command, preview_url, last_log, started_at, stopped_at)
        const id = String(params[0]);
        previewRows.set(id, {
          coding_project_id: id,
          status: params[1], port: params[2], pid: params[3], command: params[4],
          preview_url: params[5], last_log: params[6], started_at: params[7],
          stopped_at: params[8], updated_at: new Date().toISOString(),
        });
      } else if (/UPDATE coding_preview_servers/i.test(sql)) {
        // SET status=?, last_log=COALESCE(?,last_log), stopped_at=? WHERE id=?
        const status = params[0]; const lastLog = params[1]; const stoppedAt = params[2];
        const id = String(params[3]);
        const existing = previewRows.get(id);
        if (existing) {
          existing.status = status;
          if (lastLog !== null && lastLog !== undefined) existing.last_log = lastLog;
          existing.stopped_at = stoppedAt;
          existing.updated_at = new Date().toISOString();
        }
      }
      return { changes: 1, lastInsertRowid: 0 };
    }) as DatabaseAdapter['run'],
  };
  return db as DatabaseAdapter;
}

const ALLOW_OK = async () => ({ ok: true as const, resolved: '/ws/proj-1', allowedBases: ['/ws'] });

describe('coding-preview-service', () => {
  let savedFlag: string | undefined;

  beforeEach(() => {
    savedFlag = process.env.CODING_STUDIO_PREVIEW;
    clearHandlesForTests();
  });
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.CODING_STUDIO_PREVIEW;
    else process.env.CODING_STUDIO_PREVIEW = savedFlag;
    clearHandlesForTests();
    vi.restoreAllMocks();
  });

  it('refuses with a 412-shaped result and spawns NOTHING when the flag is off', async () => {
    delete process.env.CODING_STUDIO_PREVIEW;
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    const result = await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured),
      portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK,
      platform: 'linux',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(412);
    expect(result.error).toMatch(/CODING_STUDIO_PREVIEW/);
    expect(captured).toHaveLength(0);
    expect(liveHandleCountForTests()).toBe(0);
  });

  it('enabled start spawns argv with NO shell and writes a running row', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild(4242);
    const db = makeFakeDb('/ws/proj-1');

    const result = await startPreview(db, 'proj-1', { argv: ['node', 'node_modules/vite/bin/vite.js', '--port', '4321'] }, {
      spawnImpl: fakeSpawn(child, captured),
      portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK,
      platform: 'linux',
    });

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].command).toBe('node');
    expect(captured[0].args).toEqual(['node_modules/vite/bin/vite.js', '--port', '4321']);
    expect(captured[0].options.shell).toBe(false);
    expect(captured[0].options.cwd).toBe('/ws/proj-1');
    // server secrets stripped from the spawn env
    expect((captured[0].options.env as NodeJS.ProcessEnv).DATABASE_URL).toBeUndefined();

    const view = await getPreviewStatus(db, 'proj-1');
    expect(view.status).toBe('running');
    expect(view.port).toBe(4321);
    expect(view.preview_url).toBe('http://localhost:4321');
    expect(view.has_live_handle).toBe(true);
    expect(liveHandleCountForTests()).toBe(1);
  });

  it('stop calls child.kill("SIGTERM") on the TRACKED handle only', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'linux',
    });

    const stop = await stopPreview(db, 'proj-1');
    expect(stop.ok).toBe(true);
    expect(stop.note).toBe('killed');
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(liveHandleCountForTests()).toBe(0);

    const view = await getPreviewStatus(db, 'proj-1');
    expect(view.status).toBe('stopped');
  });

  it('stop with NO live handle marks the row stopped WITHOUT killing anything', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'linux',
    });

    // Simulate a server restart: the in-memory handle is gone, the row remains.
    clearHandlesForTests();
    child.kill.mockClear();

    // The reconciled status must now be 'unknown' (running row, no handle).
    const before = await getPreviewStatus(db, 'proj-1');
    expect(before.status).toBe('unknown');
    expect(before.has_live_handle).toBe(false);

    const stop = await stopPreview(db, 'proj-1');
    expect(stop.ok).toBe(true);
    expect(stop.note).toBe('no-handle');
    expect(stop.error).toMatch(/nothing was killed/i);
    expect(child.kill).not.toHaveBeenCalled(); // NEVER killed an untracked process

    const after = await getPreviewStatus(db, 'proj-1');
    expect(after.status).toBe('stopped');
  });

  it('a non-zero child exit sets status "crashed"', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'linux',
    });

    // Emit a non-zero exit and let the async patch settle.
    child.emit('exit', 1, null);
    await new Promise((r) => setImmediate(r));

    const view = await getPreviewStatus(db, 'proj-1');
    expect(view.status).toBe('crashed');
    expect(liveHandleCountForTests()).toBe(0);
  });

  it('a clean (0) child exit sets status "stopped"', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'linux',
    });
    child.emit('exit', 0, null);
    await new Promise((r) => setImmediate(r));

    const view = await getPreviewStatus(db, 'proj-1');
    expect(view.status).toBe('stopped');
  });

  it('refuses an npm/.cmd shim on win32 with the honest message (spawns nothing)', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    const result = await startPreview(db, 'proj-1', { argv: ['npm', 'run', 'dev'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'win32',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(400);
    expect(result.error).toMatch(/\.cmd shim/i);
    expect(result.error).toMatch(/without a shell/i);
    expect(captured).toHaveLength(0);
  });

  it('caps the log ring buffer at PREVIEW_LOG_CAP_BYTES', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'linux',
    });

    // Emit well over the cap.
    const oneKb = 'x'.repeat(1024);
    for (let i = 0; i < (PREVIEW_LOG_CAP_BYTES / 1024) + 32; i++) {
      child.stdout.emit('data', Buffer.from(oneKb));
    }
    child.stdout.emit('data', Buffer.from('TAIL-MARKER'));

    const { logs } = await getPreviewLogs(db, 'proj-1');
    expect(logs.length).toBeLessThanOrEqual(PREVIEW_LOG_CAP_BYTES);
    expect(logs.endsWith('TAIL-MARKER')).toBe(true); // newest kept, oldest dropped
  });

  it('refuses an invalid workspace (validator says not-ok) and spawns nothing', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    const result = await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: async () => ({ ok: false as const, error: 'Workspace directory does not exist.', allowedBases: [] }),
      platform: 'linux',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(400);
    expect(captured).toHaveLength(0);
  });

  it('shutdownAllPreviews SIGTERMs only the handles it owns', async () => {
    process.env.CODING_STUDIO_PREVIEW = 'true';
    const captured: SpawnCall[] = [];
    const child = makeFakeChild();
    const db = makeFakeDb('/ws/proj-1');

    await startPreview(db, 'proj-1', { argv: ['node', 'dev.js'] }, {
      spawnImpl: fakeSpawn(child, captured), portPicker: async () => 4321,
      validateWorkspace: ALLOW_OK, platform: 'linux',
    });

    expect(liveHandleCountForTests()).toBe(1);
    shutdownAllPreviews();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(liveHandleCountForTests()).toBe(0);
  });
});
