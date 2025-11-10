import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';

declare global {
  interface Window {
    parNoirDesktop?: {
      platform: NodeJS.Platform;
      version: string;
      secureVolume: {
        status: () => Promise<SecureVolumeMountState>;
        mount: () => Promise<SecureVolumeMountState>;
        unmount: () => Promise<SecureVolumeMountState>;
        unlock: (payload: SecureVolumeUnlockPayload) => Promise<SecureVolumeMountState>;
        lock: () => Promise<SecureVolumeMountState>;
      };
      native: {
        openPath: (target: string) => Promise<string>;
      };
    };
  }
}

export {};
