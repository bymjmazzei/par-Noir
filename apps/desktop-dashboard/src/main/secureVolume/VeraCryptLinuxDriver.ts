import path from 'path';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig } from './VolumeDriver';
import { VeraCryptDriver } from './VeraCryptDriver';

export class VeraCryptLinuxDriver extends VeraCryptDriver {
  public readonly platform: NodeJS.Platform = 'linux';

  public constructor(config: SecureVolumeConfig, veracryptPath?: string) {
    super(config, veracryptPath);
  }

  protected getDefaultMountRoot(userDataPath: string): string {
    return path.join(userDataPath, 'Secure Folder');
  }

  protected findVeraCryptBinary(): string {
    const candidates: string[] = [];
    
    // Check bundled resources first
    if (this.appPath) {
      const appDir = path.dirname(this.appPath);
      const resourcesDir = path.join(appDir, 'resources', 'veracrypt', 'linux', 'extracted');
      
      candidates.push(
        path.join(resourcesDir, 'usr', 'bin', 'veracrypt'),
        path.join(resourcesDir, 'veracrypt'),
        path.join(appDir, 'veracrypt', 'veracrypt'),
        path.join(appDir, 'veracrypt')
      );
    }
    
    candidates.push(
      '/usr/bin/veracrypt',
      '/usr/local/bin/veracrypt',
      '/opt/veracrypt/veracrypt',
      'veracrypt'
    );

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
      '--stdin',
      '--non-interactive',
      '--quiet'
    ], this.unlockContext.authToken);
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
      '--stdin',
      '--hash', 'sha-512',
      '--encryption', 'AES',
      '--filesystem', 'ext4',
      '--volume-type', 'normal',
      '--non-interactive',
      '--quiet'
    ], this.unlockContext.authToken);
  }
}

