/**
 * step-job-registry.ts — long engine runs that outlive the request.
 *
 * Wave 3 (2026-09-08). A Task Agent step on the agentic engine took 714 s
 * live. Until now the run belonged to the HTTP request: a reload dropped the
 * stream, the server kept working and persisted the result, but the page
 * showed nothing and a second click started a second run on the same step.
 *
 * A job is started once per key (the task id), its SSE frames are buffered
 * as they are produced, and any number of responses can attach — the first
 * request, or a reloaded page — and receive the buffer followed by the live
 * frames. The run itself never touches an Express response: it writes to a
 * sink with the shape the streaming helpers expect, so the existing route
 * bodies run unchanged inside a job.
 *
 * In-process only: a server restart ends the run as it always did.
 */
import type { Response } from 'express';

export interface JobSink {
  headersSent: boolean;
  writeHead(status?: number, headers?: Record<string, string>): void;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  on(event: string, listener: () => void): void;
}

export interface StepJob {
  key: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  endedAt?: string;
  /** Free-form, shown to the page (step name, task title …). */
  meta: Record<string, unknown>;
  /** Raw SSE chunks in order, capped. */
  frames: string[];
  droppedFrames: number;
  subscribers: Set<Response>;
  error?: string;
  /** Counts kept for the summary without parsing the buffer again. */
  toolCalls: number;
  turns: number;
}

export interface StepJobSummary {
  status: StepJob['status'];
  startedAt: string;
  endedAt?: string;
  meta: Record<string, unknown>;
  frames: number;
  toolCalls: number;
  turns: number;
  error?: string;
}

const MAX_FRAMES = 5000;
const RETAIN_FINISHED_MS = 30 * 60 * 1000;

const jobs = new Map<string, StepJob>();

function summarise(job: StepJob): StepJobSummary {
  return {
    status: job.status,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    meta: job.meta,
    frames: job.frames.length + job.droppedFrames,
    toolCalls: job.toolCalls,
    turns: job.turns,
    error: job.error,
  };
}

export function getStepJob(key: string): StepJob | undefined {
  return jobs.get(key);
}

export function getStepJobSummary(key: string): StepJobSummary | null {
  const job = jobs.get(key);
  return job ? summarise(job) : null;
}

function finish(job: StepJob, status: 'done' | 'failed', error?: string): void {
  if (job.status !== 'running') return;
  job.status = status;
  job.endedAt = new Date().toISOString();
  if (error) job.error = error;
  for (const res of job.subscribers) {
    try { res.end(); } catch { /* already gone */ }
  }
  job.subscribers.clear();
  setTimeout(() => { if (jobs.get(job.key) === job) jobs.delete(job.key); }, RETAIN_FINISHED_MS).unref?.();
}

function broadcast(job: StepJob, chunk: string): void {
  if (job.frames.length >= MAX_FRAMES) { job.frames.shift(); job.droppedFrames += 1; }
  job.frames.push(chunk);
  if (chunk.includes('"type":"tool_call"')) job.toolCalls += 1;
  if (chunk.includes('"type":"turn_start"')) job.turns += 1;
  for (const res of job.subscribers) {
    try { res.write(chunk); } catch { job.subscribers.delete(res); }
  }
}

/**
 * Start a job for `key`, or hand back the one already running. `runner`
 * receives the sink; when it ends the sink (or returns, or throws) the job
 * is finished and every attached response is closed.
 */
export function startStepJob(
  key: string,
  meta: Record<string, unknown>,
  runner: (sink: JobSink) => Promise<void>,
): { job: StepJob; started: boolean } {
  const existing = jobs.get(key);
  if (existing && existing.status === 'running') return { job: existing, started: false };

  const job: StepJob = {
    key, status: 'running', startedAt: new Date().toISOString(), meta,
    frames: [], droppedFrames: 0, subscribers: new Set(), toolCalls: 0, turns: 0,
  };
  jobs.set(key, job);

  const sink: JobSink = {
    headersSent: true,
    writeHead: () => undefined,
    setHeader: () => undefined,
    write: (chunk) => { broadcast(job, chunk); return true; },
    end: () => finish(job, job.error ? 'failed' : 'done'),
    on: () => undefined,
  };

  void runner(sink)
    .then(() => finish(job, job.error ? 'failed' : 'done'))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      broadcast(job, `data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
      finish(job, 'failed', message);
    });

  return { job, started: true };
}

/**
 * Stream a job to a response: SSE headers, every buffered frame, then the
 * live frames until the job ends. A finished job replays and closes.
 */
export function attachToStepJob(job: StepJob, res: Response): void {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }
  if (job.droppedFrames > 0) {
    res.write(`data: ${JSON.stringify({ type: 'replay_truncated', dropped: job.droppedFrames })}\n\n`);
  }
  for (const chunk of job.frames) res.write(chunk);
  if (job.status !== 'running') { res.end(); return; }
  job.subscribers.add(res);
  res.on('close', () => { job.subscribers.delete(res); });
}

/** Tests: forget every job. */
export function resetStepJobsForTests(): void {
  jobs.clear();
}
