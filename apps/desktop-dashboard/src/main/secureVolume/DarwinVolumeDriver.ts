import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';

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
    this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';

    const defaultDirName = this.sanitiseName(this.defaultVolumeName);
    this.bundlePath = path.join(this.bundleRoot, `${defaultDirName}.sparsebundle`);
    this.mountPoint = path.join(this.mountRoot, defaultDirName);
    this.volumeName = this.defaultVolumeName;
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.bundleRoot, { recursive: true });
    await fs.mkdir(this.mountRoot, { recursive: true });
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
    await fs.mkdir(this.mountPoint, { recursive: true });
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
      return this.getStatus();
    }

    try {
      await spawnAsync('hdiutil', [
        'attach',
        this.bundlePath,
        '-stdinpass',
        '-mountpoint',
        this.mountPoint,
        '-nobrowse',
        '-quiet'
      ], { input: `${this.unlockContext.authToken}\n` });
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
    await fs.mkdir(this.mountPoint, { recursive: true });

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
    if (!fsSync.existsSync(this.mountPoint)) {
      return false;
    }

    try {
      const entries = await fs.readdir(this.mountPoint);
      return entries.length > 0;
    } catch {
      return false;
    }
  }

  private sanitiseName(name: string): string {
    return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
  }

  private deriveIdentityKey(payload: SecureVolumeUnlockPayload): string {
    const raw = payload.pnName?.trim() || payload.publicKey?.trim();
    if (!raw) {
      return this.defaultVolumeName;
    }

    const normalized = raw.startsWith('par Noir') ? raw : `par Noir - ${raw}`;
    return normalized;
  }
}
