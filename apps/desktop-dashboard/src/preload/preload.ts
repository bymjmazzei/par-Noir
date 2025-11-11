import { contextBridge, ipcRenderer } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

import { NATIVE_IPC_CHANNEL, SECURE_VOLUME_IPC_CHANNEL, type SecureVolumeIdentity, type SecureVolumeMountState, type SecureVolumeUnlockPayload } from '../shared/ipcChannels';

const resolveAsset = (relativePath: string): string => {
  if (process.env.VITE_DEV_SERVER_URL) {
    return new URL(relativePath, process.env.VITE_DEV_SERVER_URL).toString();
  }

  const distPath = path.resolve(__dirname, '../../dist', relativePath);
  return pathToFileURL(distPath).toString();
};

const secureVolume = {
  status: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.status),
  mount: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.mount),
  unmount: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.unmount),
  unlock: async (payload: SecureVolumeUnlockPayload): Promise<SecureVolumeMountState> =>
    ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.unlock, payload),
  lock: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.lock),
  hydrate: async (identity: SecureVolumeIdentity): Promise<SecureVolumeMountState> =>
    ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.hydrate, identity)
};

console.log('[preload] secureVolume API exposed', Object.keys(secureVolume));

const nativeBridge = {
  openPath: async (target: string): Promise<string> => ipcRenderer.invoke(NATIVE_IPC_CHANNEL.openPath, target)
};

contextBridge.exposeInMainWorld('parNoirDesktop', {
  platform: process.platform,
  version: process.version,
  secureVolume,
  native: nativeBridge,
  assets: {
    resolve: resolveAsset
  }
});

