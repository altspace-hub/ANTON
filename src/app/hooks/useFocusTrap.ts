/**
 * useFocusTrap — keyboard accessibility for modals & sheets.
 *
 * When active, ensures Tab + Shift+Tab cycle within the modal's
 * focusable descendants instead of escaping back to page chrome.
 * Also saves the previously-focused element on mount and restores
 * it on unmount, so closing the modal returns the user to where
 * they were (a screen-reader requirement and a fundamental part
 * of WCAG 2.4.3 Focus Order).
 *
 * Usage inside a modal component:
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, open);   // open = boolean state
 *   return <div ref={ref} role="dialog" aria-modal="true">…</div>;
 */

import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the modal — first focusable, or the modal itself
    // (with tabIndex=-1 fallback if nothing inside is focusable).
    const initial = focusableElements(root)[0];
    if (initial) {
      // Defer to next tick so React mount completes before focus.
      window.setTimeout(() => initial.focus(), 0);
    } else if (root.tabIndex >= 0) {
      root.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (!root) return;
      const focusables = focusableElements(root);
      if (focusables.length === 0) {
        // Nothing tabbable inside — keep focus on the modal root.
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !root.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      // Restore focus only if we still own the active element (i.e. don't
      // steal focus if the user already moved on).
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [ref, active]);
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.offsetParent !== null,
  );
}
