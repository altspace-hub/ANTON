/**
 * useAndroidBackButton — wires the Android hardware back button.
 *
 * Priority cascade (first true wins):
 *   1. A transient surface (BottomSheet, full-screen overlay) is open
 *      → close it via the back-stack
 *   2. Caller's own back logic (`onBack` callback) runs (e.g. close More
 *      menu, navigate sub-screen → parent, bounce tab → Home)
 *   3. Already on the root → require two back presses within 2s to exit
 *      (Android convention — prevents accidental exits)
 *
 * Only active inside Capacitor on Android. PWA & iOS pass through.
 */

import { useEffect, useRef } from 'react';
import { popBack, hasBackHandler } from '../services/back-stack';

export type AppBackResult = 'handled' | 'exit';

interface Options {
  /**
   * Run the app's own navigation logic. Return 'handled' when something
   * was navigated/closed, or 'exit' if we're already at the root and the
   * app should be backgrounded.
   */
  onBack: () => AppBackResult;
}

const EXIT_PROMPT_WINDOW_MS = 2000;

export function useAndroidBackButton({ onBack }: Options): void {
  const lastExitPromptAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.getPlatform() !== 'android') return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', () => {
          // 1. Transient surface
          if (hasBackHandler()) { popBack(); return; }
          // 2. Caller-defined navigation
          const result = onBack();
          if (result === 'handled') return;
          // 3. Root — confirm exit
          const now = Date.now();
          if (now - lastExitPromptAt.current < EXIT_PROMPT_WINDOW_MS) {
            void App.exitApp();
            return;
          }
          lastExitPromptAt.current = now;
          // Lightweight non-blocking prompt
          showExitToast();
        });
        if (cancelled) {
          await handle.remove();
        } else {
          removeListener = () => { void handle.remove(); };
        }
      } catch { /* not running in Capacitor */ }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [onBack]);
}

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;

function showExitToast(): void {
  if (typeof document === 'undefined') return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: calc(env(safe-area-inset-bottom, 0) + 88px);
      transform: translateX(-50%);
      background: var(--color-toast-bg);
      color: #FFFFFF;
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.1px;
      box-shadow: 0 8px 24px -8px rgba(0,0,0,0.35);
      z-index: 9999;
      pointer-events: none;
      transition: opacity 0.2s ease-out;
    `;
    toastEl.textContent = 'Press back again to exit';
    document.body.appendChild(toastEl);
  }
  toastEl.style.opacity = '1';
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = '0';
  }, 1900);
}
