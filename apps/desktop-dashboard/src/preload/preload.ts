import { contextBridge, ipcRenderer } from 'electron';

import { NATIVE_IPC_CHANNEL, SECURE_VOLUME_IPC_CHANNEL, type SecureVolumeMountState, type SecureVolumeUnlockPayload } from '../shared/ipcChannels';

const secureVolume = {
  status: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.status),
  mount: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.mount),
  unmount: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.unmount),
  unlock: async (payload: SecureVolumeUnlockPayload): Promise<SecureVolumeMountState> =>
    ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.unlock, payload),
  lock: async (): Promise<SecureVolumeMountState> => ipcRenderer.invoke(SECURE_VOLUME_IPC_CHANNEL.lock)
};

const nativeBridge = {
  openPath: async (target: string): Promise<string> => ipcRenderer.invoke(NATIVE_IPC_CHANNEL.openPath, target)
};

contextBridge.exposeInMainWorld('parNoirDesktop', {
  platform: process.platform,
  version: process.version,
  secureVolume,
  native: nativeBridge
});

