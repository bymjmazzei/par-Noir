import path from 'path';

import type {
  SecureVolumeIdentity,
  SecureVolumeMountState,
  SecureVolumeUnlockPayload
} from '@par-noir/desktop-ipc';
import { DarwinVolumeDriver } from './DarwinVolumeDriver';
import { VeraCryptWindowsDriver } from './VeraCryptWindowsDriver';
import { VeraCryptLinuxDriver } from './VeraCryptLinuxDriver';
import { UnsupportedVolumeDriver } from './UnsupportedVolumeDriver';
import type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';
import { TokenStorageService } from './TokenStorageService';

export type SecureVolumeManagerInit = {
  /** Shared PN desktop data root (containers under secure-volumes/). */
  userDataPath: string;
  /** Directory containing the app executable / resources (VeraCrypt bundle lookup). */
  appPath?: string;
};

export class SecureVolumeManager {
  private driver: VolumeDriver | null = null;
  private identity: SecureVolumeIdentity | null = null;

  public async init(opts: SecureVolumeManagerInit): Promise<void> {
    const isDarwin = process.platform === 'darwin';
    const config: SecureVolumeConfig = {
      userDataPath: opts.userDataPath,
      appPath: opts.appPath,
      mountRoot: isDarwin ? '/Volumes' : undefined,
      bundleName: 'par-noir-secure.hc',
      volumeName: 'par Noir Secure'
    };

    switch (process.platform) {
      case 'darwin':
        this.driver = new DarwinVolumeDriver(config);
        break;
      case 'win32':
        this.driver = new VeraCryptWindowsDriver(config);
        break;
      case 'linux':
        this.driver = new VeraCryptLinuxDriver(config);
        break;
      default:
        this.driver = new UnsupportedVolumeDriver(process.platform, config);
        break;
    }

    await this.driver.init();
  }

  public async setUnlockContext(payload: SecureVolumeUnlockPayload): Promise<void> {
    this.identity = {
      publicKey: payload.publicKey,
      pnIdentifier: payload.pnIdentifier
    };

    const persistedToken = await TokenStorageService.load(this.identity);
    const tokenToUse = (persistedToken ?? payload.authToken)?.trim();

    if (!tokenToUse) {
      throw new Error('Secure volume unlock token missing.');
    }

    const context: SecureVolumeUnlockPayload = {
      publicKey: payload.publicKey,
      pnIdentifier: payload.pnIdentifier,
      authToken: tokenToUse
    };

    await this.getDriver().setUnlockContext(context);

    if (!persistedToken) {
      await TokenStorageService.save(this.identity, tokenToUse);
    }
    this.identity = { ...this.identity, authToken: tokenToUse };
  }

  public async clearUnlockContext(): Promise<void> {
    try {
      await this.getDriver().unmount();
    } catch (error) {
      console.warn('[SecureVolumeManager] Failed to unmount during clearUnlockContext', error);
    }

    await this.getDriver().clearUnlockContext();
    this.identity = null;
  }

  public async hydrate(identity: SecureVolumeIdentity): Promise<SecureVolumeMountState> {
    const cachedToken = await TokenStorageService.load(identity);
    if (!cachedToken || !cachedToken.trim()) {
      throw new Error('Cached token unavailable for secure volume');
    }

    this.identity = { ...identity, authToken: cachedToken.trim() };
    await this.getDriver().setUnlockContext({ ...identity, authToken: cachedToken.trim() });
    return this.mount();
  }

  public async mount(): Promise<SecureVolumeMountState> {
    return this.getDriver().mount();
  }

  public async unmount(): Promise<SecureVolumeMountState> {
    return this.getDriver().unmount();
  }

  public async getStatus(): Promise<SecureVolumeMountState> {
    if (!this.driver) {
      return {
        mounted: false,
        mountPoint: null,
        platform: process.platform,
        driver: process.platform === 'darwin' ? 'hdiutil' : 'veracrypt',
        bundleExists: false
      };
    }
    return this.getDriver().getStatus();
  }

  private getDriver(): VolumeDriver {
    if (!this.driver) {
      throw new Error('SecureVolumeManager not initialized');
    }
    return this.driver;
  }
}

/** App directory helper for Electron main (packaged vs dev). */
export function electronAppDirectory(app: {
  isPackaged: boolean;
  getPath: (name: 'exe') => string;
  getAppPath: () => string;
}): string {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  }
  return app.getAppPath();
}
