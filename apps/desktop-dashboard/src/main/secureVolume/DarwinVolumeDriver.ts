import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';

interface ExecResult {
  stdout: string;
  stderr: string;
}

const spawnAsync = (command: string, args: string[], options: { input?: string } = {}): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
        reject(error);
      }
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export class DarwinVolumeDriver implements VolumeDriver {
  public readonly platform: NodeJS.Platform = 'darwin';
  public readonly driver = 'hdiutil';

  private readonly bundleRoot: string;
  private readonly mountRoot: string;
  private readonly allowMountPointCreation: boolean;
  private readonly defaultVolumeName: string;
  private bundlePath: string;
  private mountPoint: string;
  private volumeName: string;
  private unlockContext: SecureVolumeUnlockPayload | null = null;
  private lastMountedAt?: string;
  private identityKey: string | null = null;

  public constructor(config: SecureVolumeConfig) {
    this.bundleRoot = path.join(config.userDataPath, 'secure-volumes');
    this.mountRoot = config.mountRoot ?? path.join(config.userDataPath, 'Secure Folder');
    this.allowMountPointCreation = !this.isSystemMountRoot(this.mountRoot);
    this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';

    const defaultDirName = this.sanitiseName(this.defaultVolumeName);
    this.bundlePath = path.join(this.bundleRoot, `${defaultDirName}.sparsebundle`);
    this.mountPoint = path.join(this.mountRoot, defaultDirName);
    this.volumeName = this.defaultVolumeName;
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.bundleRoot, { recursive: true });
    if (this.allowMountPointCreation) {
      await fs.mkdir(this.mountRoot, { recursive: true });
    }
  }

  public async setUnlockContext(payload: SecureVolumeUnlockPayload): Promise<void> {
    const identityKey = this.deriveIdentityKey(payload);
    if (identityKey !== this.identityKey) {
      this.identityKey = identityKey;
      const dirName = this.sanitiseName(identityKey ?? this.defaultVolumeName);
      this.volumeName = identityKey ?? this.defaultVolumeName;
      this.bundlePath = path.join(this.bundleRoot, `${dirName}.sparsebundle`);
      this.mountPoint = path.join(this.mountRoot, dirName);
    }

    await fs.mkdir(path.dirname(this.bundlePath), { recursive: true });
    if (this.allowMountPointCreation) {
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
        bundlePath: this.bundlePath,
        mountPoint: this.mountPoint
      });
      return this.getStatus();
    }

    console.log('[SecureVolume] Mounting secure volume', {
      bundlePath: this.bundlePath,
      mountPoint: this.mountPoint
    });

    try {
      await spawnAsync('hdiutil', [
        'attach',
        this.bundlePath,
        '-stdinpass',
        '-mountpoint',
        this.mountPoint,
        '-quiet'
      ], { input: `${this.unlockContext.authToken}\n` });
      console.log('[SecureVolume] Volume mounted successfully', {
        bundlePath: this.bundlePath,
        mountPoint: this.mountPoint
      });
    } catch (error) {
      console.error('[SecureVolume] hdiutil attach failed', {
        bundlePath: this.bundlePath,
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

    try {
      await spawnAsync('hdiutil', [
        'detach',
        this.mountPoint,
        '-quiet',
        '-force'
      ]);
    } catch (error) {
      const err = error as Error;
      if (!/not currently mounted/i.test(err.message)) {
        throw err;
      }
    }

    return this.getStatus();
  }

  public async getStatus(): Promise<SecureVolumeMountState> {
    const mounted = await this.isMounted();
    const bundleExists = await pathExists(this.bundlePath);
    return {
      mounted,
      mountPoint: mounted ? this.mountPoint : null,
      lastMountedAt: this.lastMountedAt,
      platform: this.platform,
      driver: this.driver,
      bundleExists
    };
  }

  private async ensureVolumeExists(): Promise<void> {
    if (await pathExists(this.bundlePath)) {
      return;
    }

    if (!this.unlockContext) {
      throw new Error('Unlock context required to create secure volume');
    }

    await fs.mkdir(path.dirname(this.bundlePath), { recursive: true });
    if (this.allowMountPointCreation) {
      await fs.mkdir(this.mountPoint, { recursive: true });
    }

    try {
      await spawnAsync('hdiutil', [
        'create',
        '-type', 'SPARSEBUNDLE',
        '-fs', 'APFS',
        '-encryption', 'AES-256',
        '-stdinpass',
        '-size', '512m',
        '-volname', this.volumeName,
        this.bundlePath
      ], { input: `${this.unlockContext.authToken}\n` });
    } catch (error) {
      console.error('[SecureVolume] hdiutil create failed', {
        bundlePath: this.bundlePath,
        message: (error as Error).message
      });
      throw error;
    }
  }

  private async isMounted(): Promise<boolean> {
    try {
      const { stdout } = await spawnAsync('hdiutil', ['info']);
      if (stdout.includes(this.bundlePath)) {
        return true;
      }
    } catch (error) {
      console.warn('[SecureVolume] Failed to query hdiutil info', {
        bundlePath: this.bundlePath,
        message: (error as Error).message
      });
    }

    return fsSync.existsSync(this.mountPoint);
  }

  private sanitiseName(name: string): string {
    return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
  }

  private isSystemMountRoot(root: string): boolean {
    return path.resolve(root) === '/Volumes';
  }

  private deriveIdentityKey(payload: SecureVolumeUnlockPayload): string {
    const identifier = this.resolveIdentifier(payload);
    return `par Noir - ${identifier}`;
  }

  private resolveIdentifier(payload: SecureVolumeUnlockPayload): string {
    const byIdentifier = payload.pnIdentifier?.trim();
    if (byIdentifier) {
      return this.normalisePnIdentifier(byIdentifier);
    }

    const token = payload.authToken?.trim();
    if (token) {
      return this.normalisePnIdentifier(`pn-${token.substring(0, 12)}`);
    }

    if (payload.publicKey?.trim()) {
      return this.normalisePnIdentifier(`pn-${this.shortHash(payload.publicKey.trim())}`);
    }

    if (payload.pnName?.trim()) {
      return this.normalisePnIdentifier(`pn-${this.shortHash(payload.pnName.trim())}`);
    }

    return 'pn-default';
  }

  private normalisePnIdentifier(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'pn-default';
    }

    const withoutBrandPrefix = trimmed.replace(/^par\s*noir\s*-\s*/i, '').trim();
    const base = withoutBrandPrefix.replace(/^pn-/i, '').trim();
    const sanitised = base.replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return sanitised ? `pn-${sanitised}` : 'pn-default';
  }

  private shortHash(value: string): string {
    return createHash('sha256').update(value).digest('hex').substring(0, 12);
  }
}
