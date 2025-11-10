export interface SecureVolumeMountState {
  mounted: boolean;
  mountPoint: string | null;
  lastMountedAt?: string;
  platform: NodeJS.Platform;
  driver: string;
  bundleExists: boolean;
}

export interface SecureVolumeUnlockPayload {
  pnName: string;
  publicKey: string;
  passcode: string;
}

export const SECURE_VOLUME_IPC_CHANNEL = {
  mount: 'secure-volume:mount',
  unmount: 'secure-volume:unmount',
  status: 'secure-volume:status',
  unlock: 'secure-volume:unlock',
  lock: 'secure-volume:lock'
} as const;

export const NATIVE_IPC_CHANNEL = {
  openPath: 'native:open-path'
} as const;
