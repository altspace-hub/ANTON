/**
 * useAndroidBackButton — wires the Android hardware back button.
 *
 * Priority cascade (first true wins):
 *   1. Transient overlay open → close it via the back-stack
 *   2. Caller's own back logic (onBack callback) runs
 *   3. Already at root → require two back presses within 2s to exit
 *
 * Only active inside Capacitor on Android. PWA & iOS pass through.
 * Ported from src/comm/hooks/useAndroidBackButton.ts.
 */

import { useEffect, useRef } from 'react';
import { popBack, hasBackHandler } from '../services/back-stack';

export type AppBackResult = 'handled' | 'exit';

interface Options {
  onBack: () => AppBackResult;
}

const EXIT_PROMPT_WINDOW_MS = 2000;

export function useAndroidBackButton({ onBack }: Options): void {
  const lastExitPromptAt = useRef(0);
  // Callers pass an inline closure — without this ref the useEffect would
  // re-fire every render, repeatedly attaching + removing the listener.
  // Read the live callback from a ref and keep deps empty: register once.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.getPlatform() !== 'android') return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', () => {
          if (hasBackHandler()) { popBack(); return; }
          const result = onBackRef.current();
          if (result === 'handled') return;
          const now = Date.now();
          if (now - lastExitPromptAt.current < EXIT_PROMPT_WINDOW_MS) {
            void App.exitApp();
            return;
          }
          lastExitPromptAt.current = now;
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
  }, []);
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
      background: rgba(28, 26, 20, 0.92);
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
