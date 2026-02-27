import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onLogLine: (callback: (line: string) => void) => {
    ipcRenderer.on('log-line', (_event, line) => callback(line));
  },
});
