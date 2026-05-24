/**
 * electron-modal.ts — ModalDriver impl using a real Electron
 * BrowserWindow. This is the production code path; tests use
 * StubModalDriver from modal.ts.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §7
 *
 * Window properties — all enforced here, NOT user-configurable:
 *   - frame: false              (no OS chrome — we draw our own bar)
 *   - alwaysOnTop: true         (modal cannot be hidden behind the agent's window)
 *   - skipTaskbar: false        (visible in taskbar so the user can find it)
 *   - resizable: false          (fixed size — agent cannot trick the user with a
 *                                shrunken-window confusion attack)
 *   - movable: true             (user comfort)
 *   - modal: true (when parent) (blocks parent until decided)
 *   - webPreferences:
 *       contextIsolation: true  (preload runs in isolated context)
 *       sandbox: true           (renderer runs sandboxed)
 *       nodeIntegration: false  (no Node in renderer)
 *
 * One modal at a time. Subsequent promptForDecision calls queue.
 */
import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModalDriver } from './modal.js';
import type { ModalDecision, ModalPayload } from '../shared/ipc-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolved paths to the renderer HTML + preload script.
 *  Production layout (after `pnpm build`):
 *    dist/main/electron-modal.js
 *    dist/renderer/modal/index.html
 *    dist/renderer/modal/preload.cjs
 *
 *  Dev / vitest don't load this module, so these paths only need to
 *  resolve in the actual electron-built bundle. */
const MODAL_HTML_PATH = path.resolve(__dirname, '../renderer/modal/index.html');
const MODAL_PRELOAD_PATH = path.resolve(__dirname, '../renderer/modal/preload.cjs');

/** Window dimensions — picked to fit the spec §7.1 layout on a
 *  typical desktop without scrolling. */
const MODAL_WIDTH = 480;
const MODAL_HEIGHT = 540;

/** IPC channel names — exported so the preload + renderer use the
 *  same strings. */
export const IPC_MODAL_PAYLOAD = 'agent-pay:modal:payload';
export const IPC_MODAL_DECISION = 'agent-pay:modal:decision';

/** Serial-only modal owner: at most one modal open at a time. Concurrent
 *  promptForDecision calls queue and run in order. */
export class ElectronModalDriver implements ModalDriver {
  private busy = false;
  private waiting: Array<{
    payload: ModalPayload;
    resolve: (d: ModalDecision) => void;
    reject: (e: unknown) => void;
  }> = [];

  async promptForDecision(payload: ModalPayload): Promise<ModalDecision> {
    if (this.busy) {
      return new Promise<ModalDecision>((resolve, reject) => {
        this.waiting.push({ payload, resolve, reject });
      });
    }
    return this.runOne(payload);
  }

  private async runOne(payload: ModalPayload): Promise<ModalDecision> {
    this.busy = true;
    try {
      const decision = await this.showWindow(payload);
      return decision;
    } finally {
      this.busy = false;
      const next = this.waiting.shift();
      if (next) {
        this.runOne(next.payload).then(next.resolve, next.reject);
      }
    }
  }

  private showWindow(payload: ModalPayload): Promise<ModalDecision> {
    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: MODAL_WIDTH,
        height: MODAL_HEIGHT,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        resizable: false,
        movable: true,
        title: 'Confirm payment',
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          preload: MODAL_PRELOAD_PATH,
        },
      });

      // Auto-reject on TTL — guarantees the proposal store sees a
      // decision even if the user walks away.
      const remainingMs = Math.max(0, payload.expiresAtMs - Date.now());
      const expiryTimer = setTimeout(() => {
        if (!win.isDestroyed()) win.destroy();
        finish({ kind: 'reject', reason: 'expired' });
      }, remainingMs);

      // Listen for the renderer's decision. Use a one-shot wrapper so
      // we can unregister cleanly.
      const decisionHandler = (
        _evt: Electron.IpcMainEvent, raw: unknown,
      ) => {
        const decision = coerceDecision(raw);
        if (!win.isDestroyed()) win.destroy();
        finish(decision);
      };
      ipcMain.once(IPC_MODAL_DECISION, decisionHandler);

      // Window close (X / Esc / Alt-F4) without an explicit decision
      // counts as Reject — per spec §7.3.
      win.on('closed', () => {
        ipcMain.removeListener(IPC_MODAL_DECISION, decisionHandler);
        clearTimeout(expiryTimer);
        // If finish hasn't run, this fires it with a Reject.
        finish({ kind: 'reject', reason: 'closed by user' });
      });

      // Once the window is ready, push the payload in via IPC.
      win.webContents.once('did-finish-load', () => {
        win.webContents.send(IPC_MODAL_PAYLOAD, payload);
      });

      void win.loadFile(MODAL_HTML_PATH);

      let done = false;
      function finish(d: ModalDecision): void {
        if (done) return;
        done = true;
        clearTimeout(expiryTimer);
        resolve(d);
      }
    });
  }
}

function coerceDecision(raw: unknown): ModalDecision {
  if (raw && typeof raw === 'object' && 'kind' in raw) {
    const k = (raw as { kind?: string }).kind;
    if (k === 'approve') return { kind: 'approve' };
    if (k === 'reject') {
      const reason = String((raw as { reason?: unknown }).reason ?? 'rejected');
      return { kind: 'reject', reason };
    }
  }
  // Malformed payload from renderer (shouldn't happen — preload is
  // trusted code) — treat as Reject so we never silently approve.
  return { kind: 'reject', reason: 'malformed renderer response' };
}
