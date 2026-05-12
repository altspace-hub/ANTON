/**
 * back-stack.ts — Coordinates Android hardware back-button handling.
 *
 * Anything that opens a transient surface (modal, overlay) registers a
 * `close` callback. The back button pops the top of the stack first;
 * only when the stack is empty does the App's own navigation kick in.
 *
 * Ported verbatim from src/app/services/back-stack.ts (Companion App).
 */

type CloseFn = () => void;

const stack: { id: number; close: CloseFn }[] = [];
let nextId = 1;

export function registerBackHandler(close: CloseFn): () => void {
  const id = nextId++;
  stack.push({ id, close });
  return () => {
    const i = stack.findIndex(e => e.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function popBack(): boolean {
  const top = stack.pop();
  if (!top) return false;
  try { top.close(); } catch { /* swallow — back-handler shouldn't throw */ }
  return true;
}

export function hasBackHandler(): boolean {
  return stack.length > 0;
}
