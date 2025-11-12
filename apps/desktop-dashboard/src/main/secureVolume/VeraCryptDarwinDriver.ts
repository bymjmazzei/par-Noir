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
    const candidates: string[] = [];
    const fs = require('fs');
    
    // Check bundled resources first (electron-builder puts extraResources in Contents/Resources/)
    if (this.appPath) {
      // Ensure we have an absolute path
      const appDir = path.resolve(path.dirname(this.appPath));
      // For packaged apps: appPath is Contents/MacOS/par Noir Desktop
      // Resources are at Contents/Resources/veracrypt/...
      const resourcesDir = path.resolve(appDir, '..', 'Resources');
      
      const bundledPath = path.resolve(resourcesDir, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt');
      
      console.log('[VeraCryptDarwinDriver] Looking for bundled VeraCrypt:', {
        appPath: this.appPath,
        appDir,
        resourcesDir,
        bundledPath,
        resourcesExists: fs.existsSync(resourcesDir),
        bundledExists: fs.existsSync(bundledPath)
      });
      
      // List contents of Resources directory for debugging
      if (fs.existsSync(resourcesDir)) {
        try {
          const resourcesContents = fs.readdirSync(resourcesDir);
          console.log('[VeraCryptDarwinDriver] Resources directory contents:', resourcesContents);
        } catch (e) {
          console.warn('[VeraCryptDarwinDriver] Could not read Resources directory:', e);
        }
      }
      
      candidates.push(
        // Bundled VeraCrypt from extraResources
        bundledPath,
        // Alternative paths for different packaging scenarios
        path.resolve(appDir, '..', '..', 'Resources', 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'),
        path.resolve(appDir, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'),
        path.resolve(appDir, 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'),
        path.resolve(appDir, 'veracrypt')
      );
    }
    
    candidates.push(
      '/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt',
      '/usr/local/bin/veracrypt',
      '/opt/homebrew/bin/veracrypt',
      'veracrypt'
    );

    for (const candidate of candidates) {
      if (candidate === 'veracrypt') {
        console.log('[VeraCryptDarwinDriver] Falling back to PATH lookup for veracrypt');
        return candidate;
      }
      try {
        fs.accessSync(candidate);
        console.log('[VeraCryptDarwinDriver] Found VeraCrypt at:', candidate);
        return candidate;
      } catch (error) {
        // Continue to next candidate
        continue;
      }
    }

    console.warn('[VeraCryptDarwinDriver] No VeraCrypt binary found, falling back to PATH');
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

