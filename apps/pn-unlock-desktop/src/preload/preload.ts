import { contextBridge, ipcRenderer } from 'electron';

export type UnlockDesktopApi = {
  openExternal: (url: string) => Promise<void>;
  getPendingDeepLink: () => Promise<string | null>;
  onDeepLink: (handler: (url: string) => void) => () => void;
  vaultAvailable: () => Promise<boolean>;
  vaultGet: (key: string) => Promise<string | null>;
  vaultSet: (key: string, value: string) => Promise<void>;
  vaultRemove: (key: string) => Promise<void>;
  confirmBiometric: (reason: string) => Promise<boolean>;
};

const api: UnlockDesktopApi = {
  openExternal: (url) => ipcRenderer.invoke('unlock:open-external', url),
  getPendingDeepLink: () => ipcRenderer.invoke('unlock:get-pending-deep-link'),
  onDeepLink: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string) => {
      if (url) handler(url);
    };
    ipcRenderer.on('unlock:deep-link', listener);
    return () => {
      ipcRenderer.removeListener('unlock:deep-link', listener);
    };
  },
  vaultAvailable: () => ipcRenderer.invoke('unlock:vault-available'),
  vaultGet: (key) => ipcRenderer.invoke('unlock:vault-get', key),
  vaultSet: (key, value) => ipcRenderer.invoke('unlock:vault-set', key, value),
  vaultRemove: (key) => ipcRenderer.invoke('unlock:vault-remove', key),
  confirmBiometric: (reason) => ipcRenderer.invoke('unlock:confirm-biometric', reason),
};

contextBridge.exposeInMainWorld('pnUnlockDesktop', api);
contextBridge.exposeInMainWorld('__PN_UNLOCK_DESKTOP__', true);
