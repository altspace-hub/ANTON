/**
 * task-store.ts — durable human↔agent task inbox (the W2 "talk rail").
 *
 * The missing channel: the phone app (via the ANTON instance) posts a TASK to
 * the person's agent; the person's own brain (their LLM, wired to this
 * standalone over JSON-RPC or MCP) polls `listTasks`, works, and posts replies
 * back with `postMessage(role:'agent')`; the app polls `listMessages` to show
 * them. A task is a THREAD of messages tagged human|agent.
 *
 * Durable (FileStorageBackend) — unlike the negotiation/proposal stores, tasks
 * are human work items that must survive a standalone restart. One JSON array
 * under `taskinbox.v1.rows`, a single promise-mutex serialising every mutation
 * (same discipline as agreement-store / fulfilment-store).
 */
import { randomBytes } from 'node:crypto';
import type { StorageBackend } from './storage.js';

export type TaskStatus = 'open' | 'working' | 'done' | 'cancelled';
export type TaskRole = 'human' | 'agent';

export interface TaskMessage {
  id: string;
  role: TaskRole;
  text: string;
  ts: number;
}

export interface TaskThread {
  id: string;
  /** Derived from the first human message — a short label for the list. */
  title: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  messages: TaskMessage[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastRole: TaskRole | null;
  lastText: string | null;
}

const ROWS_KEY = 'taskinbox.v1.rows';
const MAX_ROWS = 5_000;
const MAX_MESSAGES_PER_TASK = 500;

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

export class TaskStore {
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: StorageBackend,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async load(): Promise<TaskThread[]> {
    let raw: string | null = null;
    try { raw = await this.storage.get(ROWS_KEY); } catch { return []; }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as TaskThread[]) : [];
    } catch { return []; }
  }

  private async persist(rows: TaskThread[]): Promise<void> {
    const capped = rows.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ROWS);
    await this.storage.set(ROWS_KEY, JSON.stringify(capped));
  }

  /** Create a task — the human's ask is the first message (role 'human'). */
  createTask(text: string): Promise<TaskThread> {
    return this.enqueue(async () => {
      const now = this.now();
      const thread: TaskThread = {
        id: 'task_' + randomBytes(12).toString('hex'),
        title: titleFrom(text),
        status: 'open',
        createdAt: now,
        updatedAt: now,
        messages: [{ id: 'm_' + randomBytes(8).toString('hex'), role: 'human', text, ts: now }],
      };
      const rows = await this.load();
      rows.push(thread);
      await this.persist(rows);
      return thread;
    });
  }

  /** Append a message. role 'human' = a follow-up ask from the app; role
   *  'agent' = the brain's reply/update. The first agent message moves an
   *  'open' task to 'working'. */
  appendMessage(taskId: string, role: TaskRole, text: string): Promise<TaskThread> {
    return this.enqueue(async () => {
      const rows = await this.load();
      const t = rows.find((r) => r.id === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      const now = this.now();
      t.messages.push({ id: 'm_' + randomBytes(8).toString('hex'), role, text, ts: now });
      if (t.messages.length > MAX_MESSAGES_PER_TASK) {
        // Always keep the first message (the human's original ask) — drop from
        // the middle, never the front, so the task's context survives.
        t.messages = [t.messages[0]!, ...t.messages.slice(-(MAX_MESSAGES_PER_TASK - 1))];
      }
      t.updatedAt = now;
      if (role === 'agent' && t.status === 'open') t.status = 'working';
      await this.persist(rows);
      return t;
    });
  }

  setStatus(taskId: string, status: TaskStatus): Promise<TaskThread> {
    return this.enqueue(async () => {
      const rows = await this.load();
      const t = rows.find((r) => r.id === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      t.status = status;
      t.updatedAt = this.now();
      await this.persist(rows);
      return t;
    });
  }

  /** Thread summaries, newest-updated first. `since` (updatedAt > since) lets
   *  the brain poll only what changed; `status` narrows the view. */
  async listTasks(opts: { since?: number; status?: TaskStatus; limit?: number } = {}): Promise<TaskSummary[]> {
    const rows = await this.load();
    let filtered = rows;
    if (opts.since !== undefined) filtered = filtered.filter((t) => t.updatedAt > opts.since!);
    if (opts.status) filtered = filtered.filter((t) => t.status === opts.status);
    return filtered
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, Math.min(opts.limit ?? 50, 200)))
      .map(summaryOf);
  }

  async getTask(taskId: string): Promise<TaskThread | null> {
    return (await this.load()).find((r) => r.id === taskId) ?? null;
  }
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return 'Task';
  return t.length > 80 ? t.slice(0, 79) + '…' : t;
}

function summaryOf(t: TaskThread): TaskSummary {
  const last = t.messages[t.messages.length - 1];
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messageCount: t.messages.length,
    lastRole: last ? last.role : null,
    lastText: last ? (last.text.length > 140 ? last.text.slice(0, 139) + '…' : last.text) : null,
  };
}
