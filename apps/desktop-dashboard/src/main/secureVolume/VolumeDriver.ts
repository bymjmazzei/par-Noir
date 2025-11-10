import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';

export interface VolumeDriver {
  readonly platform: NodeJS.Platform;
  readonly driver: string;
  init(): Promise<void>;
  setUnlockContext(payload: SecureVolumeUnlockPayload): Promise<void>;
  clearUnlockContext(): Promise<void>;
  mount(): Promise<SecureVolumeMountState>;
  unmount(): Promise<SecureVolumeMountState>;
  getStatus(): Promise<SecureVolumeMountState>;
}

export interface SecureVolumeConfig {
  userDataPath: string;
  mountRoot?: string;
  volumeName?: string;
  bundleName?: string;
}
