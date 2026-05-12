/**
 * useLongPress — call onLongPress after the user holds for `delay` ms
 * without moving more than `moveThreshold` pixels. Standard mobile pattern.
 */

import { useRef, useCallback } from 'react';

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress(onLongPress: () => void, opts: { delay?: number; moveThreshold?: number } = {}): LongPressHandlers {
  const { delay = 450, moveThreshold = 12 } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    start.current = null;
  }, []);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
        timer.current = null;
      }, delay);
    },
    onPointerUp: () => { cancel(); },
    onPointerCancel: () => { cancel(); },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || !timer.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) cancel();
    },
    onContextMenu: (e: React.MouseEvent) => {
      // Desktop right-click opens the menu too — but suppress the native one.
      e.preventDefault();
      if (!fired.current) { fired.current = true; onLongPress(); }
    },
  };
}
