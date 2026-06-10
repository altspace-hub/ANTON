/**
 * useOfflineQueueFlush — drains the offline message queue on reconnect.
 *
 * ChatPage queues a message (offline.ts) when the device is offline and tells
 * the user it "will be sent when you reconnect" — but nothing drained it, so
 * queued messages were silently lost forever. This hook closes that gap:
 * it subscribes to onConnectionChange and, on a transition to online, replays
 * each queued message through the same /query-sync path ChatPage uses, then
 * removes it from the queue on success.
 *
 * Failures keep the message in the queue (no infinite loop — we only attempt
 * once per online transition, and a re-entrancy guard prevents overlap).
 *
 * Mounted once at the App root so it works regardless of which tab is open.
 */

import { useEffect, useRef, useState } from 'react';
import { onConnectionChange, isOnline, getQueue, removeFromQueue } from '../services/offline';
import { sendQueryREST } from '../services/query';

export interface OfflineQueueFlushState {
  /** True while queued messages are being replayed. */
  flushing: boolean;
  /** Count remaining in the queue at the start of the current flush. */
  pending: number;
}

export function useOfflineQueueFlush(): OfflineQueueFlushState {
  const [flushing, setFlushing] = useState(false);
  const [pending, setPending] = useState(0);
  const flushingRef = useRef(false);

  useEffect(() => {
    async function flush() {
      if (flushingRef.current) return;       // re-entrancy guard
      if (!isOnline()) return;
      const queue = getQueue();
      if (queue.length === 0) return;

      flushingRef.current = true;
      setFlushing(true);
      setPending(queue.length);

      for (const msg of queue) {
        // Stop early if we dropped offline again mid-drain — the rest stay
        // queued for the next reconnect.
        if (!isOnline()) break;
        const delivered = await new Promise<boolean>((resolve) => {
          void sendQueryREST(
            msg.orgId,
            msg.message,
            {
              onComplete: () => resolve(true),
              onError: () => resolve(false),
            },
            { sessionId: msg.sessionId || undefined },
          );
        });
        if (delivered) {
          removeFromQueue(msg.id);
          setPending(p => Math.max(0, p - 1));
        }
        // On failure: leave it in the queue, stop draining to avoid hammering
        // a still-flaky connection. Next online transition retries.
        else break;
      }

      flushingRef.current = false;
      setFlushing(false);
    }

    const unsubscribe = onConnectionChange((online) => {
      if (online) void flush();
    });

    // Cold start: if we boot already online with a non-empty queue (e.g. the
    // app was killed before the last reconnect fired), drain it now too.
    void flush();

    return unsubscribe;
  }, []);

  return { flushing, pending };
}
