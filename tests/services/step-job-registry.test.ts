/**
 * step-job-registry.test.ts — a long engine run outlives the request.
 *
 * Wave 3 (2026-09-08): a Task Agent step took 714 s live. The run used to
 * belong to the HTTP request — a reload dropped the stream and a second
 * click started a second run. A job runs once per key, buffers its frames,
 * and any response can attach and receive the buffer then the live frames.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Response } from 'express';
import { startStepJob, attachToStepJob, getStepJob, getStepJobSummary, resetStepJobsForTests, type JobSink } from '../../server/services/step-job-registry.js';

function fakeRes() {
  const res = {
    headersSent: false,
    headers: null as Record<string, string> | null,
    chunks: [] as string[],
    ended: false,
    closeListeners: [] as Array<() => void>,
    writeHead(_s: number, h: Record<string, string>) { this.headers = h; this.headersSent = true; },
    write(c: string) { this.chunks.push(c); return true; },
    end() { this.ended = true; },
    on(event: string, fn: () => void) { if (event === 'close') this.closeListeners.push(fn); },
  };
  return res;
}
const asRes = (r: ReturnType<typeof fakeRes>) => r as unknown as Response;
const frame = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A runner that waits for `release()` before it finishes. */
function gatedRunner() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let sinkRef: JobSink | null = null;
  const runner = async (sink: JobSink) => {
    sinkRef = sink;
    sink.write(frame({ type: 'turn_start', turn: 1 }));
    sink.write(frame({ type: 'text_delta', content: 'hello' }));
    await gate;
    sink.write(frame({ type: 'tool_call', id: 1, name: 'search_knowledge', input: {} }));
    sink.write(frame({ type: 'done' }));
    sink.end();
  };
  return { runner, release: () => release(), sink: () => sinkRef };
}

beforeEach(() => resetStepJobsForTests());

describe('step-job-registry', () => {
  it('runs once per key, replays the buffer to a late subscriber, then follows live', async () => {
    const g = gatedRunner();
    const { job, started } = startStepJob('task-step:t1', { step_name: 'Define customer base' }, g.runner);
    expect(started).toBe(true);
    await tick();

    // A second start while running attaches to the same job.
    const again = startStepJob('task-step:t1', {}, async () => { throw new Error('must not run'); });
    expect(again.started).toBe(false);
    expect(again.job).toBe(job);

    // A late subscriber gets everything so far.
    const late = fakeRes();
    attachToStepJob(job, asRes(late));
    expect(late.headers?.['Content-Type']).toBe('text/event-stream');
    expect(late.chunks).toEqual([frame({ type: 'turn_start', turn: 1 }), frame({ type: 'text_delta', content: 'hello' })]);
    expect(late.ended).toBe(false);

    // …and the live frames until the job ends.
    g.release();
    await tick(); await tick();
    expect(late.chunks.at(-2)).toBe(frame({ type: 'tool_call', id: 1, name: 'search_knowledge', input: {} }));
    expect(late.chunks.at(-1)).toBe(frame({ type: 'done' }));
    expect(late.ended).toBe(true);

    const summary = getStepJobSummary('task-step:t1');
    expect(summary?.status).toBe('done');
    expect(summary?.toolCalls).toBe(1);
    expect(summary?.turns).toBe(1);
    expect(summary?.meta).toEqual({ step_name: 'Define customer base' });

    // A subscriber after the end gets the replay and is closed at once.
    const after = fakeRes();
    attachToStepJob(job, asRes(after));
    expect(after.chunks).toHaveLength(4);
    expect(after.ended).toBe(true);
  });

  it('marks a runner that throws as failed and tells subscribers', async () => {
    const { job } = startStepJob('task-step:t2', {}, async (sink) => {
      sink.write(frame({ type: 'text_delta', content: 'partial' }));
      throw new Error('engine exploded');
    });
    const res = fakeRes();
    attachToStepJob(job, asRes(res));
    await tick(); await tick();
    expect(getStepJob('task-step:t2')?.status).toBe('failed');
    expect(getStepJobSummary('task-step:t2')?.error).toBe('engine exploded');
    expect(res.chunks.at(-1)).toBe(frame({ type: 'error', error: 'engine exploded' }));
    expect(res.ended).toBe(true);
  });

  it('drops a subscriber whose connection closed and can start a new run after the old one ended', async () => {
    const g = gatedRunner();
    const { job } = startStepJob('task-step:t3', {}, g.runner);
    const res = fakeRes();
    attachToStepJob(job, asRes(res));
    res.closeListeners.forEach((fn) => fn());
    g.release();
    await tick(); await tick();
    // Nothing after the replayed two frames reached the closed response.
    expect(res.chunks).toHaveLength(2);

    const next = startStepJob('task-step:t3', {}, async (sink) => { sink.end(); });
    expect(next.started).toBe(true);
    expect(next.job).not.toBe(job);
  });
});
