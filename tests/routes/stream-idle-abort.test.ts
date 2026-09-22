/**
 * stream-idle-abort.test.ts
 *
 * 2026-08-20: an FCP model validation "started, did things, then aborted".
 * No restart in the log, no saturation — the small runs alongside it completed
 * fine. The prompt was 77,376 characters with two structured output formats at
 * thinking='think', and the route applied the per-thinking-level ceiling as an
 * ABSOLUTE wall-clock limit: 300 seconds from request to done, regardless of
 * whether the stream was producing tokens the entire time.
 *
 * So the run was cut off mid-answer, and the failure scaled with the value of
 * the request — the bigger and more useful the analysis, the more reliably it
 * died. The comment on those numbers says they exist because "runtime spawn
 * adds seconds before first token", which is a time-to-FIRST-token budget;
 * they were simply being applied to the whole run.
 *
 * A stream that is writing is healthy however long it takes. Only silence is a
 * fault. These tests drive the helper with fake timers because the defect is
 * entirely in when the clock fires.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../server/routes/claude.ts'),
  'utf8',
);

/** The helper, extracted verbatim in shape from server/routes/claude.ts. */
function armIdleAbort(
  res: { write: (c: string) => boolean; on: (ev: string, fn: () => void) => unknown },
  abort: () => void,
  opts: { firstTokenMs: number; idleMs?: number; ceilingMs?: number },
): () => void {
  const idleMs = opts.idleMs ?? 180_000;
  const ceilingMs = opts.ceilingMs ?? 1_800_000;
  let stopped = false;
  let idleTimer: ReturnType<typeof setTimeout>;
  const ceilingTimer = setTimeout(() => { if (!stopped) abort(); }, ceilingMs);
  idleTimer = setTimeout(() => { if (!stopped) abort(); }, opts.firstTokenMs);
  const stop = () => { if (stopped) return; stopped = true; clearTimeout(idleTimer); clearTimeout(ceilingTimer); };
  const originalWrite = res.write.bind(res);
  res.write = (chunk: string): boolean => {
    if (!stopped) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (!stopped) abort(); }, idleMs);
    }
    return originalWrite(chunk);
  };
  res.on('close', stop);
  res.on('finish', stop);
  return stop;
}

function fakeRes() {
  const handlers: Record<string, (() => void)[]> = {};
  return {
    written: [] as string[],
    write(c: string) { this.written.push(c); return true; },
    on(ev: string, fn: () => void) { (handlers[ev] ||= []).push(fn); return this; },
    emit(ev: string) { (handlers[ev] || []).forEach(f => f()); },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a healthy long stream', () => {
  it('is NOT aborted just because it runs past the ceiling', () => {
    const abort = vi.fn();
    const res = fakeRes();
    armIdleAbort(res, abort, { firstTokenMs: 300_000, idleMs: 180_000 });

    // First token after 4 minutes — inside the spawn budget.
    vi.advanceTimersByTime(240_000);
    res.write('data: token\n\n');
    expect(abort).not.toHaveBeenCalled();

    // Then eleven more minutes of steady output. Total run: 15 minutes,
    // three times the old 300s ceiling, and every second of it productive.
    for (let i = 0; i < 11; i++) {
      vi.advanceTimersByTime(60_000);
      res.write('data: token\n\n');
    }
    expect(abort).not.toHaveBeenCalled();
    expect(res.written.length).toBe(12);
  });
});

describe('a stalled stream', () => {
  it('is aborted after the idle window once output has begun', () => {
    const abort = vi.fn();
    const res = fakeRes();
    armIdleAbort(res, abort, { firstTokenMs: 300_000, idleMs: 180_000 });

    res.write('data: token\n\n');
    vi.advanceTimersByTime(179_000);
    expect(abort).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('is aborted if the first token never arrives', () => {
    const abort = vi.fn();
    armIdleAbort(fakeRes(), abort, { firstTokenMs: 300_000 });
    vi.advanceTimersByTime(299_000);
    expect(abort).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('still has an absolute backstop against a wedged stream', () => {
    const abort = vi.fn();
    const res = fakeRes();
    armIdleAbort(res, abort, { firstTokenMs: 300_000, idleMs: 180_000, ceilingMs: 1_800_000 });
    // Dribbling one byte every two minutes forever must not run indefinitely.
    for (let i = 0; i < 20; i++) { vi.advanceTimersByTime(120_000); res.write('.'); }
    expect(abort).toHaveBeenCalled();
  });
});

describe('stop()', () => {
  it('silences both timers once the run completes', () => {
    const abort = vi.fn();
    const stop = armIdleAbort(fakeRes(), abort, { firstTokenMs: 1_000, ceilingMs: 2_000 });
    stop();
    vi.advanceTimersByTime(10_000);
    expect(abort).not.toHaveBeenCalled();
  });

  it('is also triggered by the response closing', () => {
    const abort = vi.fn();
    const res = fakeRes();
    armIdleAbort(res, abort, { firstTokenMs: 1_000 });
    res.emit('close');
    vi.advanceTimersByTime(10_000);
    expect(abort).not.toHaveBeenCalled();
  });
});

describe('both streaming paths use it', () => {
  it('the SDK path no longer sets an absolute kill timer', () => {
    expect(src).toMatch(/stopSdkTimers = armIdleAbort\(res, \(\) => sdkAbort\.abort\(\)/);
    expect(src).not.toMatch(/setTimeout\(\(\) => sdkAbort\.abort\(\)/);
  });

  it('the API path no longer sets an absolute kill timer', () => {
    expect(src).toMatch(/stopApiTimers = armIdleAbort\(res, \(\) => abortController\.abort\(\)/);
    expect(src).not.toMatch(/setTimeout\(\(\) => abortController\.abort\(\)/);
  });

  it('treats the tuned ceilings as a first-token budget', () => {
    expect(src).toMatch(/firstTokenMs:/);
    expect(src).toMatch(/time to FIRST token/);
  });
});
