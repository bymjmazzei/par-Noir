import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';

export class UnsupportedVolumeDriver implements VolumeDriver {
  public readonly platform: NodeJS.Platform;
  public readonly driver = 'unsupported';

  public constructor(platform: NodeJS.Platform, _config: SecureVolumeConfig) {
    this.platform = platform;
  }

  public async init(): Promise<void> {
    // no-op
  }

  public async setUnlockContext(_payload: SecureVolumeUnlockPayload): Promise<void> {
    // no-op
  }

  public async clearUnlockContext(): Promise<void> {
    // no-op
  }

  public async mount(): Promise<SecureVolumeMountState> {
    throw new Error('Secure folder is not supported on this platform yet.');
  }

  public async unmount(): Promise<SecureVolumeMountState> {
    return this.getStatus();
  }

  public async getStatus(): Promise<SecureVolumeMountState> {
    return {
      mounted: false,
      mountPoint: null,
      platform: this.platform,
      driver: this.driver,
      bundleExists: false
    };
  }
}
