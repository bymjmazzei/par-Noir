import { app } from 'electron';
import path from 'path';

import type { SecureVolumeIdentity, SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import { DarwinVolumeDriver } from './DarwinVolumeDriver';
import { UnsupportedVolumeDriver } from './UnsupportedVolumeDriver';
import type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';
import { KeychainService } from './KeychainService';

export class SecureVolumeManager {
  private driver: VolumeDriver | null = null;
  private identity: SecureVolumeIdentity | null = null;

  public async init(): Promise<void> {
    const userDataPath = app.getPath('userData');
    const config: SecureVolumeConfig = {
      userDataPath,
      mountRoot: path.join(userDataPath, 'Secure Folder'),
      bundleName: 'par-noir-secure.sparsebundle',
      volumeName: 'par Noir Secure'
    };

    switch (process.platform) {
      case 'darwin':
        this.driver = new DarwinVolumeDriver(config);
        break;
      default:
        this.driver = new UnsupportedVolumeDriver(process.platform, config);
        break;
    }

    await this.driver.init();
  }

  public async setUnlockContext(payload: SecureVolumeUnlockPayload): Promise<void> {
    this.identity = {
      pnName: payload.pnName,
      publicKey: payload.publicKey
    };
    await this.getDriver().setUnlockContext(payload);
    await KeychainService.save(this.identity, payload.authToken);
  }

  public async clearUnlockContext(): Promise<void> {
    await this.getDriver().clearUnlockContext();
  }

  public async hydrate(identity: SecureVolumeIdentity): Promise<SecureVolumeMountState> {
    const cachedToken = await KeychainService.load(identity);
    if (!cachedToken) {
      throw new Error('Cached token unavailable for secure volume');
    }

    this.identity = identity;
    await this.getDriver().setUnlockContext({ ...identity, authToken: cachedToken });
    return this.mount();
  }

  public async mount(): Promise<SecureVolumeMountState> {
    return this.getDriver().mount();
  }

  public async unmount(): Promise<SecureVolumeMountState> {
    return this.getDriver().unmount();
  }

  public async getStatus(): Promise<SecureVolumeMountState> {
    return this.getDriver().getStatus();
  }

  private getDriver(): VolumeDriver {
    if (!this.driver) {
      throw new Error('SecureVolumeManager not initialized');
    }
    return this.driver;
  }
}
