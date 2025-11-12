import path from 'path';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig } from './VolumeDriver';
import { VeraCryptDriver } from './VeraCryptDriver';

export class VeraCryptWindowsDriver extends VeraCryptDriver {
  public readonly platform: NodeJS.Platform = 'win32';

  public constructor(config: SecureVolumeConfig, veracryptPath?: string) {
    super(config, veracryptPath);
    this.mountPoint = this.getDefaultMountRoot(config.userDataPath);
  }

  protected getDefaultMountRoot(userDataPath: string): string {
    return 'Z:';
  }

  protected findVeraCryptBinary(): string {
    const candidates = [
      'C:\\Program Files\\VeraCrypt\\VeraCrypt.exe',
      'C:\\Program Files (x86)\\VeraCrypt\\VeraCrypt.exe',
      'veracrypt.exe',
      'veracrypt'
    ];

    for (const candidate of candidates) {
      if (candidate === 'veracrypt.exe' || candidate === 'veracrypt') {
        return candidate;
      }
      try {
        require('fs').accessSync(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    return 'veracrypt.exe';
  }

  protected async verifyVeraCrypt(): Promise<boolean> {
    try {
      await this.spawnVeraCrypt(['/version']);
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
      '/volume',
      this.containerPath,
      '/letter', this.mountPoint,
      '/password', this.unlockContext.authToken,
      '/quit',
      '/silent'
    ]);
  }

  protected async executeUnmount(): Promise<void> {
    await this.spawnVeraCrypt([
      '/dismount',
      this.mountPoint,
      '/force',
      '/quit',
      '/silent'
    ]);
  }

  protected async isMounted(): Promise<boolean> {
    try {
      const { stdout } = await this.spawnVeraCrypt(['/list']);
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
      '/create',
      this.containerPath,
      '/size', '512M',
      '/password', this.unlockContext.authToken,
      '/hash', 'sha-512',
      '/encryption', 'AES',
      '/filesystem', 'NTFS',
      '/quick',
      '/format',
      '/quit',
      '/silent'
    ]);
  }
}

