/**
 * relay/task-router.ts — the P2 wire router: the human↔agent TASK INBOX over
 * the phone's relay channel. The phone (a paired contact = the owner) drives
 * the task verbs as request/response wires; the agent's brain still posts its
 * replies over the LOCAL JSON-RPC (role:'agent'), and the phone sees them on
 * its next poll (task.messages).
 *
 * Only `task.*` (+ ping) wires are routed here — the agent↔agent commerce verbs
 * (discover / negotiate / agree / settle …) are NOT exposed over the phone
 * channel, so the phone only ever sees its own task thread.
 *
 * The phone IS the human side over the relay (it holds the agent's pairing QR),
 * so its messages are recorded role:'human' without the INSTANCE_AGENT_NAME
 * bearer guard (which still protects the JSON-RPC path).
 */
import type { TaskStore, TaskStatus } from '../task-store.js';
import { TaskNotFoundError } from '../task-store.js';
import type { WireRouter, RelayWire } from './peer.js';

const STATUSES: ReadonlyArray<TaskStatus> = ['open', 'working', 'done', 'cancelled'];

export function taskRouter(tasks: TaskStore): WireRouter {
  return async ({ wire, reply }) => {
    // Echo the request id so the phone can correlate the async reply.
    const id = typeof wire.id === 'string' ? wire.id : undefined;
    const respond = (w: RelayWire) => reply(id ? { ...w, id } : w);
    try {
      switch (wire.kind) {
        case 'ping':
          return respond({ kind: 'pong', ts: Date.now() });

        case 'task.post': {
          const text = String(wire.text ?? '').trim();
          if (!text || text.length > 8000) return respond({ kind: 'error', error: 'text must be 1–8000 characters' });
          const t = await tasks.createTask(text);
          return respond({ kind: 'task.created', taskId: t.id, status: t.status, createdAt: t.createdAt });
        }

        case 'task.list': {
          const since = typeof wire.since === 'number' ? wire.since : undefined;
          const list = await tasks.listTasks(since !== undefined ? { since } : {});
          return respond({ kind: 'task.list', tasks: list });
        }

        case 'task.messages': {
          const t = await tasks.getTask(String(wire.taskId ?? ''));
          if (!t) return respond({ kind: 'error', error: 'task not found' });
          return respond({
            kind: 'task.thread', taskId: t.id, title: t.title, status: t.status,
            createdAt: t.createdAt, updatedAt: t.updatedAt, messages: t.messages,
          });
        }

        case 'task.message': {
          const text = String(wire.text ?? '').trim();
          if (!text || text.length > 8000) return respond({ kind: 'error', error: 'text must be 1–8000 characters' });
          const t = await tasks.appendMessage(String(wire.taskId ?? ''), 'human', text);
          return respond({ kind: 'task.ack', taskId: t.id, status: t.status, updatedAt: t.updatedAt, messageCount: t.messages.length });
        }

        case 'task.setStatus': {
          const status = String(wire.status ?? '');
          if (!STATUSES.includes(status as TaskStatus)) return respond({ kind: 'error', error: 'invalid status' });
          const t = await tasks.setStatus(String(wire.taskId ?? ''), status as TaskStatus);
          return respond({ kind: 'task.status', taskId: t.id, status: t.status });
        }

        default:
          return; // unknown wire — ignored (commerce verbs are not on the phone channel)
      }
    } catch (e) {
      return respond({ kind: 'error', error: e instanceof TaskNotFoundError ? 'task not found' : 'request failed' });
    }
  };
}
