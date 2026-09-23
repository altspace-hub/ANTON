import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  errorFields,
  exitOnListenError,
  lifecycleLog,
  startLifecycleHeartbeat,
} from '../../server/lib/lifecycle-log.js';

/**
 * The dev server's lifecycle record (server/lib/lifecycle-log.ts).
 *
 * 2026-09-23: the dev server had been found down twice with nothing saying
 * when or why. And a server that cannot bind its port stayed alive without
 * listening — reproduced against the server's own error handling: EADDRINUSE
 * reached the catch-all uncaughtException handler and the process lingered,
 * which looks exactly like "down".
 */

let dir: string;
let file: string;
const saved = process.env.ANTON_LIFECYCLE_LOG;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-lifecycle-'));
  file = path.join(dir, 'lifecycle.log');
});

afterEach(() => {
  if (saved === undefined) delete process.env.ANTON_LIFECYCLE_LOG;
  else process.env.ANTON_LIFECYCLE_LOG = saved;
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

const lines = () => fs.readFileSync(file, 'utf8').trim().split('\n');

describe('lifecycleLog', () => {
  it('appends one timestamped line per event, with its fields', () => {
    process.env.ANTON_LIFECYCLE_LOG = file;
    lifecycleLog('listening', { port: 3001 });
    lifecycleLog('shutdown', { signal: 'SIGINT' });
    const [a, b] = lines();
    expect(a).toMatch(new RegExp(`^\\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z server pid=${process.pid} listening port=3001$`));
    expect(b).toMatch(/ shutdown signal=SIGINT$/);
  });

  it('quotes a value that contains spaces, so a line stays parseable', () => {
    process.env.ANTON_LIFECYCLE_LOG = file;
    lifecycleLog('uncaught-exception', { message: 'boom in two words', code: undefined });
    expect(lines()[0]).toMatch(/ uncaught-exception message="boom in two words"$/);
  });

  it('writes nothing when the launcher did not ask for a log', () => {
    delete process.env.ANTON_LIFECYCLE_LOG;
    lifecycleLog('listening', { port: 3001 });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('never throws when the file cannot be written', () => {
    process.env.ANTON_LIFECYCLE_LOG = path.join(dir, 'no-such-dir', 'x.log');
    expect(() => lifecycleLog('listening')).not.toThrow();
  });
});

describe('errorFields', () => {
  // The file lives on disk: an error's message can quote what a user typed
  // ('invalid input syntax for type uuid: "jane.doe@example.com"'), so only the
  // kind, the code and the code location are kept (review 2026-09-23).
  it('keeps kind, code and where it was thrown — never the message', () => {
    const err = Object.assign(new Error('invalid input syntax for type uuid: "jane.doe@example.com"'), { code: '22P02' });
    const f = errorFields(err);
    expect(f).toMatchObject({ error: 'Error', code: '22P02' });
    expect(String(f.at)).toMatch(/^tests\/lib\/lifecycle-log\.test\.ts:\d+:\d+$/);
    expect(JSON.stringify(f)).not.toContain('jane.doe');
  });

  it('describes a non-Error rejection by its type only', () => {
    expect(errorFields('the user typed this')).toEqual({ error: 'string' });
  });
});

describe('startLifecycleHeartbeat', () => {
  it('records uptime and memory on each beat', () => {
    process.env.ANTON_LIFECYCLE_LOG = file;
    vi.useFakeTimers();
    const timer = startLifecycleHeartbeat(1000);
    vi.advanceTimersByTime(2500);
    clearInterval(timer);
    const beats = lines();
    expect(beats).toHaveLength(2);
    expect(beats[0]).toMatch(/ heartbeat uptimeMin=\d+ rssMb=\d+ heapUsedMb=\d+$/);
  });

  it('does not start without a log file', () => {
    delete process.env.ANTON_LIFECYCLE_LOG;
    expect(startLifecycleHeartbeat(1000)).toBeUndefined();
  });
});

describe('exitOnListenError', () => {
  it('exits with 1 and says why when the port is already taken', async () => {
    process.env.ANTON_LIFECYCLE_LOG = file;
    const holder = net.createServer();
    await new Promise<void>((r) => holder.listen(0, '127.0.0.1', () => r()));
    const port = (holder.address() as net.AddressInfo).port;

    const server = http.createServer();
    const exited = new Promise<number>((resolve) => exitOnListenError(server, port, resolve));
    server.listen(port, '127.0.0.1');

    await expect(exited).resolves.toBe(1);
    expect(server.listening).toBe(false);
    expect(lines().at(-1)).toMatch(new RegExp(` listen-failed port=${port} error=Error code=EADDRINUSE `));
    holder.close();
  });

  it('inside the desktop app a taken port is logged, not fatal — the app uses the server already running', async () => {
    process.env.ANTON_LIFECYCLE_LOG = file;
    const holder = net.createServer();
    await new Promise<void>((r) => holder.listen(0, '127.0.0.1', () => r()));
    const port = (holder.address() as net.AddressInfo).port;
    const server = http.createServer();
    const exit = vi.fn();
    exitOnListenError(server, port, exit, true);
    const failed = new Promise<void>((r) => server.once('error', () => setTimeout(r, 10)));
    server.listen(port, '127.0.0.1');
    await failed;
    expect(exit).not.toHaveBeenCalled();
    expect(lines().at(-1)).toMatch(/ listen-failed port=\d+ error=Error code=EADDRINUSE/);
    holder.close();
  });

  it('logs but does not exit on an error after the server is listening', async () => {
    const server = http.createServer();
    const exit = vi.fn();
    exitOnListenError(server, 0, exit);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    server.emit('error', Object.assign(new Error('late'), { code: 'ECONNRESET' }));
    expect(exit).not.toHaveBeenCalled();
    await new Promise<void>((r) => server.close(() => r()));
  });
});
