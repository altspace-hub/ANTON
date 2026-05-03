/**
 * back-stack.ts — Coordinates Android hardware back-button handling.
 *
 * Anything that opens a transient surface (BottomSheet, modal, full-screen
 * overlay, voice mode, etc.) registers a `close` callback. The back button
 * pops the top of the stack first; only when the stack is empty does the
 * App's own navigation logic kick in (close More menu → bounce to Home →
 * exit app via "press back twice").
 *
 * This is a tiny manual store because the app doesn't use Zustand and we
 * want zero re-renders when the stack changes (handlers don't need to
 * subscribe — they're only consulted when back is pressed).
 */

type CloseFn = () => void;

const stack: { id: number; close: CloseFn }[] = [];
let nextId = 1;

/**
 * Push a close handler onto the back-stack. Returns an unregister function.
 *
 *   useEffect(() => {
 *     if (open) return registerBackHandler(() => setOpen(false));
 *   }, [open]);
 */
export function registerBackHandler(close: CloseFn): () => void {
  const id = nextId++;
  stack.push({ id, close });
  return () => {
    const i = stack.findIndex(e => e.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * Pop and invoke the top close handler. Returns true if one was handled,
 * false if the stack was empty (caller should run its own back logic).
 */
export function popBack(): boolean {
  const top = stack.pop();
  if (!top) return false;
  try { top.close(); } catch { /* swallow — back-handler shouldn't throw */ }
  return true;
}

/** True if any handler is registered. */
export function hasBackHandler(): boolean {
  return stack.length > 0;
}
