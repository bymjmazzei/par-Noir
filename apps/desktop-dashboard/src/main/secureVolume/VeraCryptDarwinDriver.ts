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
      // appPath is already the directory containing the executable (Contents/MacOS)
      // Resources are at Contents/Resources/veracrypt/...
      const resourcesDir = path.resolve(this.appPath, '..', 'Resources');
      
      const bundledPath = path.resolve(resourcesDir, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt');
      
      console.log('[VeraCryptDarwinDriver] Looking for bundled VeraCrypt:', {
        appPath: this.appPath,
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
        path.resolve(this.appPath, '..', '..', 'Resources', 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'),
        path.resolve(this.appPath, 'veracrypt', 'darwin', 'extracted', 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'),
        path.resolve(this.appPath, 'VeraCrypt.app', 'Contents', 'MacOS', 'VeraCrypt'),
        path.resolve(this.appPath, 'veracrypt')
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
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      console.error('[VeraCryptDarwinDriver] VeraCrypt verification failed:', {
        path: this.veracryptPath,
        error: errorMsg
      });
      
      // Check for common macOS FUSE dependency issue
      if (errorMsg.includes('libfuse') || errorMsg.includes('Library not loaded')) {
        console.error('[VeraCryptDarwinDriver] VeraCrypt requires macOSFUSE to be installed. Please install it from https://osxfuse.github.io/');
        throw new Error(
          'VeraCrypt requires macOSFUSE to be installed.\n\n' +
          'Please install macOSFUSE from: https://osxfuse.github.io/\n\n' +
          'Alternatively, you can install it via Homebrew:\n' +
          '  brew install --cask macfuse'
        );
      }
      
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

