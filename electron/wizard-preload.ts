import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveConfig: (config: Record<string, string>) =>
    ipcRenderer.invoke('wizard:save-config', config),
  skipSetup: () =>
    ipcRenderer.invoke('wizard:skip'),
  openExternal: (url: string) =>
    shell.openExternal(url),
});
