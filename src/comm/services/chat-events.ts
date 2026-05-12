/**
 * chat-events.ts — tiny pub/sub bus used by ChatThreadScreen to refresh
 * a thread on actual change instead of polling every 2 s (P4-4).
 *
 * Design notes:
 *   - Just one global EventTarget; subscribers filter by threadHash.
 *   - Emitters live in messages.ts (every mutator) and chat.ts (inbound
 *     applyInbound* hooks for reactions, pollvotes, etc).
 *   - The safety-net polling tick stays — but at 30 s instead of 2 s —
 *     so a missed emit on some exotic path (a future feature, an early
 *     return, etc.) still recovers within a screen lifetime.
 *
 *   threadHash is the canonical hash of the *peer* (the same key the
 *   message store uses) so subscribers can match without computing
 *   anything.
 */

type Listener = (threadHash: string) => void;

const bus = new EventTarget();
const EVENT_NAME = 'chat-changed';

export function emitChatChanged(threadHash: string): void {
  try {
    bus.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: threadHash }));
  } catch { /* SSR / non-browser path */ }
}

export function subscribeChatChanged(threadHash: string, listener: Listener): () => void {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<string>;
    if (ce.detail === threadHash) listener(ce.detail);
  };
  bus.addEventListener(EVENT_NAME, handler);
  return () => bus.removeEventListener(EVENT_NAME, handler);
}

/** Emit for *any* thread — used by ChatListScreen if/when it converts
 *  off polling too. ChatThreadScreen ignores this. */
export function subscribeAnyChatChanged(listener: Listener): () => void {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<string>;
    listener(ce.detail);
  };
  bus.addEventListener(EVENT_NAME, handler);
  return () => bus.removeEventListener(EVENT_NAME, handler);
}
