import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../shared/ipcChannels';
import type { SecureVolumeConfig, VolumeDriver } from './VolumeDriver';

interface ExecResult {
  stdout: string;
  stderr: string;
}

export const spawnAsync = (command: string, args: string[], options: { input?: string; cwd?: string } = {}): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd
    });
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

export abstract class VeraCryptDriver implements VolumeDriver {
  public readonly driver = 'veracrypt';
  public abstract readonly platform: NodeJS.Platform;

  protected readonly containerRoot: string;
  protected readonly mountRoot: string;
  protected readonly defaultVolumeName: string;
  protected readonly appPath: string | undefined;
  protected containerPath: string;
  protected mountPoint: string;
  protected volumeName: string;
  protected unlockContext: SecureVolumeUnlockPayload | null = null;
  protected lastMountedAt?: string;
  protected identityKey: string | null = null;
  protected veracryptPath: string;

  public constructor(config: SecureVolumeConfig, veracryptPath?: string) {
    this.containerRoot = path.join(config.userDataPath, 'secure-volumes');
    this.mountRoot = config.mountRoot ?? this.getDefaultMountRoot(config.userDataPath);
    this.defaultVolumeName = config.volumeName ?? 'par Noir Secure';
    this.appPath = config.appPath;
    this.veracryptPath = veracryptPath ?? this.findVeraCryptBinary();

    const defaultDirName = this.sanitiseName(this.defaultVolumeName);
    this.containerPath = path.join(this.containerRoot, `${defaultDirName}.hc`);
    this.mountPoint = path.join(this.mountRoot, defaultDirName);
    this.volumeName = this.defaultVolumeName;
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.containerRoot, { recursive: true });
    await fs.mkdir(this.mountRoot, { recursive: true });
    
    if (!(await this.verifyVeraCrypt())) {
      const portableHint = this.appPath 
        ? `\n\nPortable VeraCrypt should be placed next to the app at: ${path.dirname(this.appPath)}/veracrypt`
        : '';
      throw new Error(
        `VeraCrypt not found at ${this.veracryptPath}. Please install VeraCrypt or place a portable version next to the app.${portableHint}\n\n` +
        `Visit https://www.veracrypt.fr/en/Downloads.html for downloads.`
      );
    }
  }

  public async setUnlockContext(payload: SecureVolumeUnlockPayload): Promise<void> {
    const identityKey = this.deriveIdentityKey(payload);
    if (identityKey !== this.identityKey) {
      this.identityKey = identityKey;
      const dirName = this.sanitiseName(identityKey ?? this.defaultVolumeName);
      this.volumeName = identityKey ?? this.defaultVolumeName;
      this.containerPath = path.join(this.containerRoot, `${dirName}.hc`);
      this.mountPoint = path.join(this.mountRoot, dirName);
    }

    await fs.mkdir(path.dirname(this.containerPath), { recursive: true });
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
      console.error('[SecureVolume] VeraCrypt mount failed', {
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

    try {
      await this.executeUnmount();
    } catch (error) {
      const err = error as Error;
      if (!/not mounted|not found/i.test(err.message)) {
        throw err;
      }
    }

    return this.getStatus();
  }

  public async getStatus(): Promise<SecureVolumeMountState> {
    const mounted = await this.isMounted();
    const containerExists = await pathExists(this.containerPath);
    return {
      mounted,
      mountPoint: mounted ? this.mountPoint : null,
      lastMountedAt: this.lastMountedAt,
      platform: this.platform,
      driver: this.driver,
      bundleExists: containerExists
    };
  }

  protected abstract getDefaultMountRoot(userDataPath: string): string;
  protected abstract findVeraCryptBinary(): string;
  protected abstract verifyVeraCrypt(): Promise<boolean>;
  protected abstract executeMount(): Promise<void>;
  protected abstract executeUnmount(): Promise<void>;
  protected abstract isMounted(): Promise<boolean>;

  protected async ensureVolumeExists(): Promise<void> {
    if (await pathExists(this.containerPath)) {
      return;
    }

    if (!this.unlockContext) {
      throw new Error('Unlock context required to create secure volume');
    }

    await fs.mkdir(path.dirname(this.containerPath), { recursive: true });
    await fs.mkdir(this.mountPoint, { recursive: true });

    try {
      await this.executeCreate();
    } catch (error) {
      console.error('[SecureVolume] VeraCrypt create failed', {
        containerPath: this.containerPath,
        message: (error as Error).message
      });
      throw error;
    }
  }

  protected abstract executeCreate(): Promise<void>;

  protected sanitiseName(name: string): string {
    return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'par-noir-secure';
  }

  protected deriveIdentityKey(payload: SecureVolumeUnlockPayload): string {
    const identifier = this.resolveIdentifier(payload);
    return `par Noir - ${identifier}`;
  }

  protected resolveIdentifier(payload: SecureVolumeUnlockPayload): string {
    const byIdentifier = payload.pnIdentifier?.trim();
    if (byIdentifier) {
      return this.normalisePnIdentifier(byIdentifier);
    }

    const token = payload.authToken?.trim();
    if (token) {
      return this.normalisePnIdentifier(`pn-${token.substring(0, 12)}`);
    }

    if (payload.publicKey?.trim()) {
      const { createHash } = require('crypto');
      const hash = createHash('sha256').update(payload.publicKey.trim()).digest('hex').substring(0, 12);
      return this.normalisePnIdentifier(`pn-${hash}`);
    }

    if (payload.pnName?.trim()) {
      const { createHash } = require('crypto');
      const hash = createHash('sha256').update(payload.pnName.trim()).digest('hex').substring(0, 12);
      return this.normalisePnIdentifier(`pn-${hash}`);
    }

    return 'pn-default';
  }

  protected normalisePnIdentifier(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'pn-default';
    }

    const withoutBrandPrefix = trimmed.replace(/^par\s*noir\s*-\s*/i, '').trim();
    const base = withoutBrandPrefix.replace(/^pn-/i, '').trim();
    const sanitised = base.replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return sanitised ? `pn-${sanitised}` : 'pn-default';
  }

  protected async spawnVeraCrypt(args: string[], input?: string): Promise<ExecResult> {
    return spawnAsync(this.veracryptPath, args, { input, cwd: undefined });
  }
}

