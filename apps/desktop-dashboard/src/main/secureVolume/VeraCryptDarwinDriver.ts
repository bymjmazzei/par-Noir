import path from 'path';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig } from './VolumeDriver';
import { VeraCryptDriver, spawnAsync } from './VeraCryptDriver';

export class VeraCryptDarwinDriver extends VeraCryptDriver {
  public readonly platform: NodeJS.Platform = 'darwin';

  public constructor(config: SecureVolumeConfig, veracryptPath?: string) {
    super(config, veracryptPath);
  }

  protected getDefaultMountRoot(userDataPath: string): string {
    return '/Volumes';
  }

  protected findVeraCryptBinary(): string {
    const candidates = [
      '/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt',
      '/usr/local/bin/veracrypt',
      '/opt/homebrew/bin/veracrypt',
      'veracrypt'
    ];

    for (const candidate of candidates) {
      if (candidate === 'veracrypt') {
        return candidate;
      }
      try {
        require('fs').accessSync(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    return 'veracrypt';
  }

  protected async verifyVeraCrypt(): Promise<boolean> {
    try {
      await this.spawnVeraCrypt(['--version']);
      return true;
    } catch {
      return false;
    }
  }

  protected async executeMount(): Promise<void> {
    if (!this.unlockContext) {
      throw new Error('Unlock context required');
    }

    await this.spawnVeraCrypt([
      '--mount',
      this.containerPath,
      '--mount-point', this.mountPoint,
      '--password', this.unlockContext.authToken,
      '--non-interactive',
      '--quiet'
    ]);
  }

  protected async executeUnmount(): Promise<void> {
    await this.spawnVeraCrypt([
      '--dismount',
      this.mountPoint,
      '--force',
      '--non-interactive',
      '--quiet'
    ]);
  }

  protected async isMounted(): Promise<boolean> {
    try {
      const { stdout } = await this.spawnVeraCrypt(['--list']);
      return stdout.includes(this.mountPoint) || stdout.includes(this.containerPath);
    } catch {
      const fs = require('fs');
      return fs.existsSync(this.mountPoint);
    }
  }

  protected async executeCreate(): Promise<void> {
    if (!this.unlockContext) {
      throw new Error('Unlock context required');
    }

    await this.spawnVeraCrypt([
      '--create',
      this.containerPath,
      '--size', '512M',
      '--password', this.unlockContext.authToken,
      '--hash', 'sha-512',
      '--encryption', 'AES',
      '--filesystem', 'APFS',
      '--volume-type', 'normal',
      '--non-interactive',
      '--quiet'
    ]);
  }
}

