/**
 * collab-client.ts — instance-side JSON-RPC client for the owner's
 * anton-collaboration standalone (apps/anton-collaboration), the W2 talk rail.
 *
 * Mirror of agent-pay-client.ts: a plain loopback `fetch` (NOT url-fetcher,
 * which blocks loopback) to the admin-configured collaboration URL. The phone
 * posts tasks + polls replies through the app-gateway, which calls these.
 *
 * The person's own brain (their LLM) is the OTHER client of the same
 * standalone — it polls listTasks + replies with postMessage(role:'agent').
 * The instance bridge only ever acts as the HUMAN side.
 */

export type TaskStatus = 'open' | 'working' | 'done' | 'cancelled';
export type TaskRole = 'human' | 'agent';

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

export interface TaskMessage {
  id: string;
  role: TaskRole;
  text: string;
  ts: number;
}

export interface TaskThread {
  taskId: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  messages: TaskMessage[];
}

export class CollabError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'CollabError';
    this.code = code;
  }
}

const RPC_TIMEOUT_MS = 15_000;

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

async function rpc<T>(url: string, bearer: string, method: string, params: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base(url)}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? {} }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new CollabError(
      err instanceof Error && err.name === 'AbortError' ? 'collaboration timed out' : 'collaboration unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  let body: { result?: T; error?: { code?: number; message?: string } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new CollabError('collaboration returned invalid JSON');
  }
  if (body.error) {
    throw new CollabError(body.error.message ?? 'collaboration error', body.error.code);
  }
  return body.result as T;
}

/** getStatus → { paired, agentName, verbs } — used by the admin probe. */
export async function getStatus(cfg: { url: string; bearer: string }): Promise<{ paired: boolean; agentName: string; verbs: string[] }> {
  return rpc(cfg.url, cfg.bearer, 'getStatus', {});
}

export async function postTask(cfg: { url: string; bearer: string }, text: string): Promise<{ taskId: string; status: TaskStatus; createdAt: number }> {
  return rpc(cfg.url, cfg.bearer, 'postTask', { text });
}

export async function listTasks(
  cfg: { url: string; bearer: string },
  opts: { since?: number; status?: TaskStatus; limit?: number } = {},
): Promise<TaskSummary[]> {
  const r = await rpc<{ tasks: TaskSummary[] }>(cfg.url, cfg.bearer, 'listTasks', opts);
  return Array.isArray(r?.tasks) ? r.tasks : [];
}

export async function listMessages(cfg: { url: string; bearer: string }, taskId: string): Promise<TaskThread> {
  return rpc<TaskThread>(cfg.url, cfg.bearer, 'listMessages', { taskId });
}

/** Post a HUMAN follow-up message (the app is always the human side). */
export async function postHumanMessage(cfg: { url: string; bearer: string }, taskId: string, text: string): Promise<{ taskId: string; status: TaskStatus; updatedAt: number }> {
  return rpc(cfg.url, cfg.bearer, 'postMessage', { taskId, text, role: 'human' });
}

/**
 * Headless pairing — exchange the 6-digit code the collaboration standalone
 * prints on boot for a bearer. POST /pair is a plain REST endpoint.
 */
export async function pairWithCode(
  url: string,
  name: string,
  code: string,
  ttlMs?: number,
): Promise<{ agentId: string; sessionToken: string; expiresAt: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base(url)}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, ...(ttlMs ? { ttlMs } : {}) }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new CollabError(
      err instanceof Error && err.name === 'AbortError' ? 'collaboration timed out' : 'collaboration unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as
    | { agentId?: string; sessionToken?: string; expiresAt?: number; error?: { message?: string } | string }
    | null;
  if (!res.ok || !body || !body.sessionToken) {
    const msg =
      (body && typeof body.error === 'object' && body.error?.message) ||
      (body && typeof body.error === 'string' && body.error) ||
      `pairing failed (HTTP ${res.status})`;
    throw new CollabError(String(msg));
  }
  return { agentId: body.agentId ?? '', sessionToken: body.sessionToken, expiresAt: body.expiresAt ?? 0 };
}
