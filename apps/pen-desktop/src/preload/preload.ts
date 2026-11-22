import { contextBridge, ipcRenderer } from 'electron';

export type PenDesktopApi = {
  vaultAvailable: () => Promise<boolean>;
  vaultGet: (key: string) => Promise<string | null>;
  vaultSet: (key: string, value: string) => Promise<void>;
  vaultRemove: (key: string) => Promise<void>;
  confirmBiometric: (reason: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  secureVolumeStatus: () => Promise<unknown>;
  secureVolumeUnlock: (payload: unknown) => Promise<unknown>;
  draftWrite: (opts: unknown) => Promise<void>;
  draftRead: (docId: string) => Promise<unknown>;
  draftList: () => Promise<unknown>;
  draftDelete: (docId: string) => Promise<void>;
  mediaWrite: (opts: unknown) => Promise<void>;
  mediaRead: (docId: string, mediaId: string) => Promise<unknown>;
  mediaDelete: (docId: string, mediaId: string) => Promise<void>;
  mediaList: (docId: string) => Promise<string[]>;
  mediaGetById: (mediaId: string) => Promise<unknown>;
  mediaGetByDriveFileId: (fileId: string) => Promise<unknown>;
  getPendingDeepLink: () => Promise<string | null>;
  onDeepLink: (handler: (url: string) => void) => () => void;
};

const api: PenDesktopApi = {
  vaultAvailable: () => ipcRenderer.invoke('pen:vault-available'),
  vaultGet: (key) => ipcRenderer.invoke('pen:vault-get', key),
  vaultSet: (key, value) => ipcRenderer.invoke('pen:vault-set', key, value),
  vaultRemove: (key) => ipcRenderer.invoke('pen:vault-remove', key),
  confirmBiometric: (reason) => ipcRenderer.invoke('pen:confirm-biometric', reason),
  openExternal: (url) => ipcRenderer.invoke('pen:open-external', url),
  secureVolumeStatus: () => ipcRenderer.invoke('pen:secure-volume-status'),
  secureVolumeUnlock: (payload) => ipcRenderer.invoke('pen:secure-volume-unlock', payload),
  draftWrite: (opts) => ipcRenderer.invoke('pen:draft-write', opts),
  draftRead: (docId) => ipcRenderer.invoke('pen:draft-read', docId),
  draftList: () => ipcRenderer.invoke('pen:draft-list'),
  draftDelete: (docId) => ipcRenderer.invoke('pen:draft-delete', docId),
  mediaWrite: (opts) => ipcRenderer.invoke('pen:media-write', opts),
  mediaRead: (docId, mediaId) => ipcRenderer.invoke('pen:media-read', docId, mediaId),
  mediaDelete: (docId, mediaId) => ipcRenderer.invoke('pen:media-delete', docId, mediaId),
  mediaList: (docId) => ipcRenderer.invoke('pen:media-list', docId),
  mediaGetById: (mediaId) => ipcRenderer.invoke('pen:media-get-by-id', mediaId),
  mediaGetByDriveFileId: (fileId) => ipcRenderer.invoke('pen:media-get-by-drive', fileId),
  getPendingDeepLink: () => ipcRenderer.invoke('pen:get-pending-deep-link'),
  onDeepLink: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, url: string) => {
      if (url) handler(url);
    };
    ipcRenderer.on('pen:deep-link', listener);
    return () => ipcRenderer.removeListener('pen:deep-link', listener);
  }
};

contextBridge.exposeInMainWorld('penDesktop', api);
contextBridge.exposeInMainWorld('__PN_PEN_DESKTOP__', true);
