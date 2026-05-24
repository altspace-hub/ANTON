/*
 * preload.cjs — Electron preload script for the confirmation modal.
 *
 * Runs in an isolated context with NO Node integration. Exposes a
 * single API surface (window.agentPayModal) the renderer uses to:
 *   - subscribe to the payload (main → renderer)
 *   - send the user's decision back (renderer → main)
 *
 * .cjs because Electron's contextBridge preload is loaded outside
 * the renderer's module system; CommonJS sidesteps ESM-in-preload
 * compatibility quirks across Electron versions.
 *
 * Channel names must match electron-modal.ts:
 *   IPC_MODAL_PAYLOAD  = 'agent-pay:modal:payload'
 *   IPC_MODAL_DECISION = 'agent-pay:modal:decision'
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentPayModal', {
  /** Subscribe to the payment-proposal payload that the main process
   *  pushes once the window finishes loading. The renderer registers
   *  this on DOMContentLoaded; the main process sends exactly once. */
  onPayload(cb) {
    ipcRenderer.on('agent-pay:modal:payload', (_evt, payload) => {
      cb(payload);
    });
  },

  /** Send the user's decision back to the main process. The window
   *  will be destroyed by the main process immediately after; no
   *  further IPC is expected. */
  send(decision) {
    ipcRenderer.send('agent-pay:modal:decision', decision);
  },
});
