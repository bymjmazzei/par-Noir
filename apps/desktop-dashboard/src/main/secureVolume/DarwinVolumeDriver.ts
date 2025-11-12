import path from 'path';
import { promises as fs } from 'fs';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';
import { spawnAsync } from './VeraCryptDriver';

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

/**
 * macOS-specific volume driver using hdiutil (built-in, no dependencies)
 * This uses macOS's native disk image encryption, which doesn't require FUSE
 */
export class DarwinVolumeDriver implements VolumeDriver {
  public readonly platform: NodeJS.Platform = 'darwin';
  public readonly driver = 'hdiutil';

  private readonly containerRoot: string;
  private readonly mountRoot: string;
  private readonly defaultVolumeName: string;
  protected containerPath: string;
  protected mountPoint: string;
  protected volumeName: string;
  protected unlockContext: SecureVolumeUnlockPayload | null = null;
  protected lastMountedAt?: string;
  protected identityKey: string | null = null;

  public constructor(config: SecureVolumeConfig) {
    this.containerRoot = path.join(config.userDataPath, 'secure-volumes');
    this.mountRoot = config.mountRoot ?? '/Volumes';
    this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';
    
    const defaultDirName = this.sanitiseName(this.defaultVolumeName);
    this.containerPath = path.join(this.containerRoot, `${defaultDirName}.sparsebundle`);
    this.mountPoint = path.join(this.mountRoot, defaultDirName);
    this.volumeName = this.defaultVolumeName;
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.containerRoot, { recursive: true });
    // Don't create /Volumes - it's a system directory
    if (!this.isSystemMountRoot(this.mountRoot)) {
      await fs.mkdir(this.mountRoot, { recursive: true });
    }
  }

  public async setUnlockContext(payload: SecureVolumeUnlockPayload): Promise<void> {
    const identityKey = this.deriveIdentityKey(payload);
    if (identityKey !== this.identityKey) {
      this.identityKey = identityKey;
      const dirName = this.sanitiseName(identityKey ?? this.defaultVolumeName);
      this.volumeName = identityKey ?? this.defaultVolumeName;
      this.containerPath = path.join(this.containerRoot, `${dirName}.sparsebundle`);
      this.mountPoint = path.join(this.mountRoot, dirName);
    }

    await fs.mkdir(path.dirname(this.containerPath), { recursive: true });
    // Don't create mount point if it's a system mount root
    if (!this.isSystemMountRoot(this.mountRoot)) {
      await fs.mkdir(this.mountPoint, { recursive: true });
    }
    this.unlockContext = { ...payload, authToken: payload.authToken.trim() };
  }

  public async clearUnlockContext(): Promise<void> {
    this.unlockContext = null;
  }

  public async mount(): Promise<SecureVolumeMountState> {
    if (!this.unlockContext) {
      throw new Error('Secure volume locked; unlock context required');
    }

    await this.ensureVolumeExists();

    if (await this.isMounted()) {
      console.log('[SecureVolume] Volume already mounted', {
        containerPath: this.containerPath,
        mountPoint: this.mountPoint
      });
      return this.getStatus();
    }

    console.log('[SecureVolume] Mounting secure volume', {
      containerPath: this.containerPath,
      mountPoint: this.mountPoint
    });

    try {
      await this.executeMount();
      console.log('[SecureVolume] Volume mounted successfully', {
        containerPath: this.containerPath,
        mountPoint: this.mountPoint
      });
    } catch (error) {
      console.error('[SecureVolume] hdiutil mount failed', {
        containerPath: this.containerPath,
        mountPoint: this.mountPoint,
        message: (error as Error).message
      });
      throw error;
    }

    this.lastMountedAt = new Date().toISOString();
    return this.getStatus();
  }

  public async unmount(): Promise<SecureVolumeMountState> {
    if (!(await this.isMounted())) {
      return this.getStatus();
    }

    console.log('[SecureVolume] Dismounting secure volume', {
      mountPoint: this.mountPoint
    });

    try {
      await this.executeUnmount();
      console.log('[SecureVolume] Volume dismounted successfully.');
    } catch (error) {
      const err = error as Error;
      if (!/not currently mounted/i.test(err.message) && !/no volume mounted/i.test(err.message)) {
        console.warn(`[SecureVolume] hdiutil dismount failed: ${err.message}`);
        throw err;
      }
      console.log('[SecureVolume] Volume was already dismounted or not found, ignoring error.');
    }

    return this.getStatus();
  }

  public async getStatus(): Promise<SecureVolumeMountState> {
    const mounted = await this.isMounted();
    const bundleExists = await pathExists(this.containerPath);
    return {
      mounted,
      mountPoint: mounted ? this.mountPoint : null,
      lastMountedAt: this.lastMountedAt,
      platform: this.platform,
      driver: this.driver,
      bundleExists
    };
  }

  protected async ensureVolumeExists(): Promise<void> {
    if (await pathExists(this.containerPath)) {
      console.log(`[SecureVolume] Sparse bundle already exists: ${this.containerPath}`);
      return;
    }

    if (!this.unlockContext) {
      throw new Error('Unlock context required to create secure volume');
    }

    console.log(`[SecureVolume] Creating new sparse bundle: ${this.containerPath}`);
    await fs.mkdir(path.dirname(this.containerPath), { recursive: true });

    try {
      await this.executeCreate();
      console.log(`[SecureVolume] Sparse bundle created successfully.`);
    } catch (error) {
      console.error('[SecureVolume] hdiutil create failed', {
        containerPath: this.containerPath,
        message: (error as Error).message
      });
      throw error;
    }
  }

  protected sanitiseName(name: string): string {
    return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
  }

  protected deriveIdentityKey(payload: SecureVolumeUnlockPayload): string {
    const identifier = this.resolveIdentifier(payload);
    return `par Noir - ${identifier}`;
  }

  protected resolveIdentifier(payload: SecureVolumeUnlockPayload): string {
    // If pnIdentifier is provided, use it directly (must match Google Drive folder name)
    const byIdentifier = payload.pnIdentifier?.trim();
    if (byIdentifier) {
      // Ensure it has the pn- prefix, but don't normalize further to preserve exact match
      const trimmed = byIdentifier.trim();
      if (trimmed.startsWith('pn-')) {
        return trimmed; // Use as-is to match Google Drive exactly
      }
      return `pn-${trimmed}`;
    }

    // Fallback: derive identifier using same method as Google Drive
    const token = payload.authToken?.trim();
    if (token) {
      return `pn-${token.substring(0, 12).toLowerCase()}`;
    }

    if (payload.publicKey?.trim()) {
      return `pn-${this.shortHash(payload.publicKey.trim())}`;
    }

    if (payload.pnName?.trim()) {
      return `pn-${this.shortHash(payload.pnName.trim())}`;
    }

    return 'pn-default';
  }

  protected shortHash(value: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
  }

  protected isSystemMountRoot(mountRoot: string): boolean {
    return mountRoot === '/Volumes' || mountRoot === '/mnt' || mountRoot.startsWith('/Volumes/');
  }

  protected async executeMount(): Promise<void> {
    if (!this.unlockContext) {
      throw new Error('Unlock context required');
    }

    // hdiutil attach with password from stdin
    // Note: We don't use -nobrowse so the volume appears in Finder
    await spawnAsync('hdiutil', [
      'attach',
      this.containerPath,
      '-mountpoint', this.mountPoint,
      '-stdinpass'
    ], { input: this.unlockContext.authToken });
  }

  protected async executeUnmount(): Promise<void> {
    await spawnAsync('hdiutil', [
      'detach',
      this.mountPoint,
      '-force'
    ]);
  }

  protected async isMounted(): Promise<boolean> {
    try {
      const { stdout } = await spawnAsync('hdiutil', ['info', '-plist']);
      // Check if our mount point or container path is in the output
      return stdout.includes(this.mountPoint) || stdout.includes(this.containerPath);
    } catch {
      // Fallback: check if mount point exists
      return await pathExists(this.mountPoint);
    }
  }

  protected async executeCreate(): Promise<void> {
    if (!this.unlockContext) {
      throw new Error('Unlock context required');
    }

    // Create encrypted sparse bundle using hdiutil
    // Size: 512MB, encryption: AES-256, filesystem: APFS
    await spawnAsync('hdiutil', [
      'create',
      '-size', '512m',
      '-type', 'SPARSEBUNDLE',
      '-fs', 'APFS',
      '-encryption', 'AES-256',
      '-stdinpass',
      this.containerPath
    ], { input: this.unlockContext.authToken });
  }
}

