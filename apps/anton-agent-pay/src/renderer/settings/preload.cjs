/*
 * preload.cjs — Electron preload for the Settings window.
 *
 * Exposes window.agentPaySettings (matches SettingsApi in
 * src/shared/ipc-types.ts). Renderer NEVER sees Node — every call
 * goes through ipcRenderer.invoke which hits the main process
 * handlers registered by settings-ipc.ts.
 */
const { contextBridge, ipcRenderer } = require('electron');

const CH = {
  WALLET_INFO: 'agent-pay:settings:wallet:info',
  WALLET_CREATE: 'agent-pay:settings:wallet:create',
  WALLET_IMPORT: 'agent-pay:settings:wallet:import',
  WALLET_REVEAL_MNEMONIC: 'agent-pay:settings:wallet:reveal-mnemonic',
  WALLET_DELETE: 'agent-pay:settings:wallet:delete',
  WALLET_ENABLE_PASSPHRASE: 'agent-pay:settings:wallet:enable-passphrase',
  WALLET_CHANGE_PASSPHRASE: 'agent-pay:settings:wallet:change-passphrase',
  WALLET_REMOVE_PASSPHRASE: 'agent-pay:settings:wallet:remove-passphrase',
  PAIRING_NEW_CODE: 'agent-pay:settings:pairing:new-code',
  PAIRING_LIST: 'agent-pay:settings:pairing:list',
  PAIRING_REVOKE: 'agent-pay:settings:pairing:revoke',
  BOOT_INFO: 'agent-pay:settings:boot-info',
};

contextBridge.exposeInMainWorld('agentPaySettings', {
  walletInfo: () => ipcRenderer.invoke(CH.WALLET_INFO),
  walletCreate: () => ipcRenderer.invoke(CH.WALLET_CREATE),
  walletImport: (args) => ipcRenderer.invoke(CH.WALLET_IMPORT, args),
  walletRevealMnemonic: (args) => ipcRenderer.invoke(CH.WALLET_REVEAL_MNEMONIC, args),
  walletDelete: (args) => ipcRenderer.invoke(CH.WALLET_DELETE, args),
  walletEnablePassphrase: (args) => ipcRenderer.invoke(CH.WALLET_ENABLE_PASSPHRASE, args),
  walletChangePassphrase: (args) => ipcRenderer.invoke(CH.WALLET_CHANGE_PASSPHRASE, args),
  walletRemovePassphrase: (args) => ipcRenderer.invoke(CH.WALLET_REMOVE_PASSPHRASE, args),
  pairingNewCode: () => ipcRenderer.invoke(CH.PAIRING_NEW_CODE),
  pairingList: () => ipcRenderer.invoke(CH.PAIRING_LIST),
  pairingRevoke: (args) => ipcRenderer.invoke(CH.PAIRING_REVOKE, args),
  bootInfo: () => ipcRenderer.invoke(CH.BOOT_INFO),
});
